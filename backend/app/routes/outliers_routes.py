from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import pandas as pd
import numpy as np

from app.core.config import UPLOAD_DIR, TEMP_DIR
from app.services.dataset_service import add_cleaned_version, resolve_original_filename
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir

router = APIRouter()


class OutlierSettings(BaseModel):
    method: str = "iqr"  # iqr, zscore, modified_zscore, isolation_forest
    threshold: float = 3.0  # used for zscore/modified_zscore
    action: str = "flag"  # flag, replace, remove
    preview_limit: int = 100
    high_variance_percentile: float = 0.8  # for High Variance filter
    skew_threshold: float = 1.0  # for Distribution Based filter


class OutlierRequest(BaseModel):
    filename: str
    method: Optional[str] = None  # can override settings.method
    filters: Optional[List[str]] = None  # Numeric Columns, High Variance, Distribution Based
    settings: Optional[OutlierSettings] = None


class OutlierResponse(BaseModel):
    message: str
    rows_before: int
    rows_after: int
    outliers_flagged: int
    columns_checked: List[str]
    method_used: str
    action_applied: str
    new_file: Optional[str] = None
    preview_data: Optional[List[Dict[str, Any]]] = None


def _load_dataframe_for_processing_user(filename: str, current_user: UserInDB) -> pd.DataFrame:
    files_dir = user_files_dir(current_user.id)
    ensure_dir(files_dir)
    file_path = files_dir / filename
    if not file_path.exists():
        # Fallback: allow selecting previously cleaned files
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(cleaned_dir)
        alt_path = cleaned_dir / filename
        if alt_path.exists():
            file_path = alt_path
        else:
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found")
    ext = file_path.suffix.lower()
    try:
        if ext == ".csv":
            for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                try:
                    return pd.read_csv(file_path, encoding=encoding)
                except UnicodeDecodeError:
                    continue
            raise HTTPException(status_code=400, detail="Could not decode CSV file")
        elif ext in [".xlsx", ".xls"]:
            return pd.read_excel(file_path, engine="openpyxl")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")


def _select_outlier_columns(df: pd.DataFrame, filters: List[str], settings: OutlierSettings) -> List[str]:
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()

    # Exclude ID-like columns (they're identifiers, not measured values)
    id_keywords = {'id', 'idx', 'index', 'code', 'zip', 'postal'}
    filtered_num_cols = [
        c for c in num_cols
        if not any(keyword in c.lower() for keyword in id_keywords)
    ]

    if not filters or "Numeric Columns" in filters:
        candidates = filtered_num_cols if filtered_num_cols else num_cols
    else:
        candidates = []
    if "High Variance" in (filters or []):
        variances = df[filtered_num_cols].var(numeric_only=True) if filtered_num_cols else df[num_cols].var(numeric_only=True)
        cutoff = variances.quantile(settings.high_variance_percentile)
        candidates.extend(variances[variances >= cutoff].index.tolist())
    if "Distribution Based" in (filters or []):
        skew = df[filtered_num_cols].skew(numeric_only=True) if filtered_num_cols else df[num_cols].skew(numeric_only=True)
        candidates.extend(skew[skew.abs() >= settings.skew_threshold].index.tolist())
    unique = []
    seen = set()
    for c in candidates:
        if c not in seen and c in num_cols:
            unique.append(c)
            seen.add(c)
    return unique


def _detect_outliers_mask(df: pd.DataFrame, cols: List[str], settings: OutlierSettings) -> Dict[str, pd.Series]:
    masks: Dict[str, pd.Series] = {}
    method = (settings.method or "iqr").lower()
    thr = settings.threshold
    if method == "iqr":
        for c in cols:
            q1 = df[c].quantile(0.25)
            q3 = df[c].quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            masks[c] = (df[c] < lower) | (df[c] > upper)
    elif method == "zscore":
        for c in cols:
            mu = df[c].mean()
            sd = df[c].std(ddof=0)
            z = (df[c] - mu) / (sd if sd != 0 else 1)
            masks[c] = z.abs() > thr
    elif method == "modified_zscore":
        for c in cols:
            med = df[c].median()
            mad = (df[c] - med).abs().median()
            mz = 0.6745 * (df[c] - med) / (mad if mad != 0 else 1)
            masks[c] = mz.abs() > thr
    elif method == "isolation_forest":
        try:
            from sklearn.ensemble import IsolationForest
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"IsolationForest not available: {e}")
        X = df[cols].fillna(df[cols].median())
        iso = IsolationForest(n_estimators=100, contamination='auto', random_state=42)
        preds = iso.fit_predict(X)
        joint_mask = pd.Series(preds == -1, index=df.index)
        for c in cols:
            masks[c] = joint_mask
    else:
        raise HTTPException(status_code=400, detail=f"Unknown outlier method: {method}")
    return masks


def _apply_outlier_action(df: pd.DataFrame, masks: Dict[str, pd.Series], cols: List[str], settings: OutlierSettings):
    action = (settings.action or "flag").lower()
    if masks:
        any_mask = pd.Series(False, index=df.index)
        for m in masks.values():
            any_mask = any_mask | m.fillna(False)
    else:
        any_mask = pd.Series(False, index=df.index)

    total_flagged = int(any_mask.sum())
    if action == "flag":
        for c in cols:
            df[f"{c}_is_outlier"] = masks[c].fillna(False).astype(int)
    elif action == "replace":
        method = (settings.method or "iqr").lower()
        for c in cols:
            s = df[c]
            m = masks[c].fillna(False)
            if method == "iqr":
                q1 = s.quantile(0.25); q3 = s.quantile(0.75); iqr = q3 - q1
                lower = q1 - 1.5 * iqr; upper = q3 + 1.5 * iqr
            elif method == "zscore":
                mu = s.mean(); sd = s.std(ddof=0); k = settings.threshold
                lower = mu - k * (sd if sd != 0 else 1); upper = mu + k * (sd if sd != 0 else 1)
            elif method == "modified_zscore":
                med = s.median(); mad = (s - med).abs().median(); k = settings.threshold
                lower = med - (k/0.6745) * (mad if mad != 0 else 1)
                upper = med + (k/0.6745) * (mad if mad != 0 else 1)
            else:
                lower = s.quantile(0.01); upper = s.quantile(0.99)
            # Cast bounds to match column dtype to avoid type errors
            col_dtype = df[c].dtype
            if pd.api.types.is_integer_dtype(col_dtype):
                lower = int(lower)
                upper = int(upper)
            df.loc[m & (s < lower), c] = lower
            df.loc[m & (s > upper), c] = upper
    elif action == "remove":
        df.drop(index=df.index[any_mask], inplace=True)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
    return df, total_flagged


@router.post("/api/outliers/preview")
async def outliers_preview(request: OutlierRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or OutlierSettings()
        if request.method:
            settings.method = request.method
        cols = _select_outlier_columns(df, request.filters or ["Numeric Columns"], settings)
        masks = _detect_outliers_mask(df, cols, settings)
        df_preview = df.copy()
        # For preview, always flag outliers to show which rows are affected
        df_preview, _ = _apply_outlier_action(df_preview, masks, cols, OutlierSettings(**{**settings.dict(), "action": "flag"}))
        n = max(1, settings.preview_limit)
        preview = df_preview.head(n).fillna("").to_dict(orient="records")
        # Count unique rows with at least one outlier
        any_mask = pd.Series(False, index=df.index)
        for m in masks.values():
            any_mask = any_mask | m.fillna(False)
        unique_outlier_rows = int(any_mask.sum())
        return OutlierResponse(
            message="Outlier preview generated",
            rows_before=len(df),
            rows_after=len(df_preview),
            outliers_flagged=unique_outlier_rows,
            columns_checked=cols,
            method_used=settings.method,
            action_applied="flag",
            new_file=None,
            preview_data=preview,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating outlier preview: {str(e)}")


@router.post("/api/outliers/diagnose")
async def outliers_diagnose(request: OutlierRequest, current_user: UserInDB = Depends(get_current_active_user)):
    """Diagnostic endpoint to debug outlier detection issues."""
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or OutlierSettings()
        if request.method:
            settings.method = request.method

        cols = _select_outlier_columns(df, request.filters or ["Numeric Columns"], settings)
        masks = _detect_outliers_mask(df, cols, settings)

        # Calculate statistics for each column
        col_stats = {}
        for col in cols:
            outliers_count = masks[col].sum()
            outlier_indices = df.index[masks[col]].tolist()
            col_stats[col] = {
                "outliers_found": int(outliers_count),
                "outlier_indices": outlier_indices[:10],  # First 10
                "min_value": float(df[col].min()),
                "max_value": float(df[col].max()),
                "mean_value": float(df[col].mean()),
                "outlier_values": df.loc[masks[col], col].tolist()[:10]
            }

        return {
            "message": "Diagnostic report generated",
            "total_rows": len(df),
            "total_columns_in_data": len(df.columns),
            "columns_selected_for_detection": cols,
            "detection_method": settings.method,
            "filter_applied": request.filters,
            "column_statistics": col_stats,
            "total_rows_with_outliers": int(sum(1 for c in cols if masks[c].sum() > 0))
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnostic error: {str(e)}")



@router.post("/api/outliers/apply")
async def outliers_apply(request: OutlierRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or OutlierSettings()
        if request.method:
            settings.method = request.method

        # Debug logging to see what's being sent
        import sys
        print(f"DEBUG: Request received - method={request.method}, action={settings.action}", file=sys.stderr)
        print(f"DEBUG: Settings object - {settings.dict()}", file=sys.stderr)

        cols = _select_outlier_columns(df, request.filters or ["Numeric Columns"], settings)
        masks = _detect_outliers_mask(df, cols, settings)
        df_processed = df.copy()
        print(f"DEBUG: Detected {sum(m.sum() for m in masks.values())} total outliers, action={settings.action}", file=sys.stderr)
        df_processed, flagged = _apply_outlier_action(df_processed, masks, cols, settings)
        print(f"DEBUG: After action - rows before={len(df)}, rows after={len(df_processed)}, action={settings.action}", file=sys.stderr)
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Ensure naming is based on the root original file, not a previously cleaned name
        root_original = await resolve_original_filename(current_user.id, request.filename)
        base, ext = os.path.splitext(root_original)
        out_name = f"outlier_handled_{base}_{timestamp}{ext}"
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(cleaned_dir)
        out_path = cleaned_dir / out_name
        if ext.lower() == ".csv":
            df_processed.to_csv(out_path, index=False, encoding="utf-8-sig")
        elif ext.lower() in [".xlsx", ".xls"]:
            df_processed.to_excel(out_path, index=False, engine="openpyxl")
        n = max(1, settings.preview_limit)
        preview = df_processed.head(n).fillna("").to_dict(orient="records")
        # Register cleaned version
        try:
            await add_cleaned_version(current_user.id, request.filename, out_name)
        except Exception:
            pass

        return OutlierResponse(
            message="Outlier handling applied successfully",
            rows_before=len(df),
            rows_after=len(df_processed),
            outliers_flagged=flagged,
            columns_checked=cols,
            method_used=settings.method,
            action_applied=settings.action,
            new_file=out_name,
            preview_data=preview,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error applying outlier handling: {str(e)}")
