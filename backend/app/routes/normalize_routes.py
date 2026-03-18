from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import pandas as pd
import numpy as np

from app.core.config import UPLOAD_DIR, TEMP_DIR
from app.services.dataset_service import add_cleaned_version
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir

router = APIRouter()


class NormalizeSettings(BaseModel):
    method: str = "standard"  # standard, minmax, robust, unit_vector, quantile
    feature_range: Optional[List[float]] = None  # for minmax, e.g., [0, 1] or [-1, 1]
    with_mean: bool = True  # center for standard/robust where applicable
    preview_limit: int = 100
    selected_features: Optional[List[str]] = None


class NormalizeRequest(BaseModel):
    filename: str
    filters: Optional[List[str]] = None  # Numeric Columns, High Range, Skewed Distribution, Selected Features
    settings: Optional[NormalizeSettings] = None


class NormalizeResponse(BaseModel):
    message: str
    columns_scaled: List[str]
    method_used: str
    new_file: Optional[str] = None
    preview_data: Optional[List[Dict[str, Any]]] = None


def _load_dataframe_for_processing_user(filename: str, current_user: UserInDB) -> pd.DataFrame:
    files_dir = user_files_dir(current_user.id)
    cleaned_dir = user_cleaned_dir(current_user.id)
    ensure_dir(files_dir)
    ensure_dir(cleaned_dir)
    file_path = files_dir / filename
    if not file_path.exists():
        temp_path = cleaned_dir / filename
        if temp_path.exists():
            file_path = temp_path
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


def _select_normalize_columns(df: pd.DataFrame, filters: List[str], settings: NormalizeSettings) -> List[str]:
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    candidates: List[str] = []
    if not filters or "Numeric Columns" in filters:
        candidates.extend(num_cols)
    if "High Range" in (filters or []):
        rng = (df[num_cols].max(numeric_only=True) - df[num_cols].min(numeric_only=True)).fillna(0)
        cutoff = rng.quantile(0.8) if len(rng) else 0
        candidates.extend(rng[rng >= cutoff].index.tolist())
    if "Skewed Distribution" in (filters or []):
        skew = df[num_cols].skew(numeric_only=True)
        candidates.extend(skew[skew.abs() >= 1.0].index.tolist())
    if "Selected Features" in (filters or []):
        if settings.selected_features:
            candidates.extend([c for c in settings.selected_features if c in num_cols])
    unique: List[str] = []
    seen = set()
    for c in candidates:
        if c not in seen and c in num_cols:
            unique.append(c)
            seen.add(c)
    return unique


def _apply_scaling(df: pd.DataFrame, cols: List[str], settings: NormalizeSettings):
    method = (settings.method or "standard").lower()
    if not cols:
        return df, []
    X = df[cols].copy()
    nan_mask = X.isna()
    if method == "standard":
        try:
            from sklearn.preprocessing import StandardScaler
            scaler = StandardScaler(with_mean=settings.with_mean)
            X_filled = X.fillna(X.median(numeric_only=True))
            Y = scaler.fit_transform(X_filled)
            Y = pd.DataFrame(Y, columns=cols, index=df.index)
            Y[nan_mask] = np.nan
            df[cols] = Y
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"StandardScaler error: {e}")
    elif method == "minmax":
        try:
            from sklearn.preprocessing import MinMaxScaler
            fr = settings.feature_range if settings.feature_range and len(settings.feature_range) == 2 else [0.0, 1.0]
            scaler = MinMaxScaler(feature_range=(float(fr[0]), float(fr[1])))
            X_filled = X.fillna(X.median(numeric_only=True))
            Y = scaler.fit_transform(X_filled)
            Y = pd.DataFrame(Y, columns=cols, index=df.index)
            Y[nan_mask] = np.nan
            df[cols] = Y
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"MinMaxScaler error: {e}")
    elif method == "robust":
        try:
            from sklearn.preprocessing import RobustScaler
            scaler = RobustScaler(with_centering=settings.with_mean)
            X_filled = X.fillna(X.median(numeric_only=True))
            Y = scaler.fit_transform(X_filled)
            Y = pd.DataFrame(Y, columns=cols, index=df.index)
            Y[nan_mask] = np.nan
            df[cols] = Y
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"RobustScaler error: {e}")
    elif method == "unit_vector":
        try:
            from sklearn.preprocessing import Normalizer
            scaler = Normalizer(norm='l2')
            X_filled = X.fillna(0)
            Y = scaler.fit_transform(X_filled)
            Y = pd.DataFrame(Y, columns=cols, index=df.index)
            Y[nan_mask] = np.nan
            df[cols] = Y
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Unit Vector normalization error: {e}")
    elif method == "quantile":
        try:
            from sklearn.preprocessing import QuantileTransformer
            scaler = QuantileTransformer(output_distribution='uniform', random_state=42)
            X_filled = X.fillna(X.median(numeric_only=True))
            Y = scaler.fit_transform(X_filled)
            Y = pd.DataFrame(Y, columns=cols, index=df.index)
            Y[nan_mask] = np.nan
            df[cols] = Y
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"QuantileTransformer error: {e}")
    else:
        raise HTTPException(status_code=400, detail=f"Unknown scaling method: {method}")
    return df, cols


@router.post("/api/normalize/preview")
async def normalize_preview(request: NormalizeRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or NormalizeSettings()
        cols = _select_normalize_columns(df, request.filters or ["Numeric Columns"], settings)
        df_processed, scaled_cols = _apply_scaling(df.copy(), cols, settings)
        n = max(1, settings.preview_limit)
        preview = df_processed.head(n).fillna("").to_dict(orient="records")
        return NormalizeResponse(
            message="Normalize preview generated",
            columns_scaled=scaled_cols,
            method_used=settings.method,
            new_file=None,
            preview_data=preview,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating normalize preview: {str(e)}")


@router.post("/api/normalize/apply")
async def normalize_apply(request: NormalizeRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or NormalizeSettings()
        cols = _select_normalize_columns(df, request.filters or ["Numeric Columns"], settings)
        df_processed, scaled_cols = _apply_scaling(df.copy(), cols, settings)
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name, ext = os.path.splitext(request.filename)
        out_name = f"normalized_{name}_{timestamp}{ext}"
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

        return NormalizeResponse(
            message="Normalization applied successfully",
            columns_scaled=scaled_cols,
            method_used=settings.method,
            new_file=out_name,
            preview_data=preview,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error applying normalization: {str(e)}")
