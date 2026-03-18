from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import pandas as pd
from sklearn.preprocessing import LabelEncoder

from app.core.config import UPLOAD_DIR, TEMP_DIR
from app.services.dataset_service import add_cleaned_version
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir

router = APIRouter()


class StandardizeActions(BaseModel):
    lowercase: bool = False
    remove_special: bool = False
    trim_whitespace: bool = False
    encode: Optional[str] = None  # onehot, label, ordinal


class StandardizeSettings(BaseModel):
    encoding_type: Optional[str] = None  # onehot, label, ordinal
    handle_unknown: str = "ignore"  # ignore, error, create_new
    case_sensitive: bool = False
    high_cardinality_threshold: int = 50
    low_cardinality_threshold: int = 20
    preview_limit: int = 10


class StandardizeRequest(BaseModel):
    filename: str
    actions: StandardizeActions
    filters: Optional[List[str]] = None  # Text Columns, Categorical, High Cardinality, Low Cardinality, Mixed Case
    settings: Optional[StandardizeSettings] = None


class StandardizeResponse(BaseModel):
    message: str
    applied_actions: List[str]
    columns_changed: List[str]
    encoding_applied: Optional[str] = None
    new_file: Optional[str] = None
    preview_data: List[Dict[str, Any]]


def _load_dataframe_for_processing_user(filename: str, current_user: UserInDB) -> pd.DataFrame:
    files_dir = user_files_dir(current_user.id)
    ensure_dir(files_dir)
    file_path = files_dir / filename
    if not file_path.exists():
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


def _select_standardize_columns(df: pd.DataFrame, filters: List[str], settings: StandardizeSettings) -> List[str]:
    cols = df.columns.tolist()
    candidates: List[str] = []
    text_cols = df.select_dtypes(include=["object", "string"]).columns.tolist()
    categorical_cols = [
        c for c in cols if (
            pd.api.types.is_categorical_dtype(df[c]) or
            (c in text_cols and df[c].nunique(dropna=True) <= settings.low_cardinality_threshold)
        )
    ]
    if not filters:
        candidates = text_cols
    else:
        if "Text Columns" in filters:
            candidates.extend(text_cols)
        if "Categorical" in filters:
            candidates.extend(categorical_cols)
        if "High Cardinality" in filters:
            candidates.extend([c for c in text_cols if df[c].nunique(dropna=True) > settings.high_cardinality_threshold])
        if "Low Cardinality" in filters:
            candidates.extend([c for c in text_cols if df[c].nunique(dropna=True) <= settings.low_cardinality_threshold])
        if "Mixed Case" in filters:
            def mixed(s: pd.Series) -> bool:
                sample = s.dropna().astype(str).head(100)
                return any(x != x.lower() and x != x.upper() for x in sample)
            candidates.extend([c for c in text_cols if mixed(df[c])])
    unique_candidates = []
    seen = set()
    for c in candidates:
        if c not in seen and c in df.columns:
            unique_candidates.append(c)
            seen.add(c)
    return unique_candidates


def _op_lowercase(series: pd.Series, case_sensitive: bool) -> pd.Series:
    if case_sensitive:
        return series
    return series.astype(str).str.lower()


def _op_remove_special(series: pd.Series) -> pd.Series:
    return series.astype(str).str.replace(r"[^\w\s-]", "", regex=True)


def _op_trim_whitespace(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.replace(r"\s+", " ", regex=True)
    return s.str.strip()


def _apply_text_ops(df: pd.DataFrame, cols: List[str], actions: StandardizeActions, settings: StandardizeSettings, logs: List[str]) -> None:
    for col in cols:
        if actions.lowercase:
            df[col] = _op_lowercase(df[col], settings.case_sensitive)
            logs.append(f"lowercase:{col}")
        if actions.remove_special:
            df[col] = _op_remove_special(df[col])
            logs.append(f"remove_special:{col}")
        if actions.trim_whitespace:
            df[col] = _op_trim_whitespace(df[col])
            logs.append(f"trim_whitespace:{col}")


def _encode_columns(df: pd.DataFrame, cols: List[str], encode: Optional[str], settings: StandardizeSettings):
    if not encode or not cols:
        return df, []
    changed: List[str] = []
    if encode == "onehot":
        if settings.handle_unknown == "error":
            for c in cols:
                if df[c].isna().any():
                    raise HTTPException(status_code=400, detail=f"Null/unknown values found in column '{c}' with handle_unknown='error'")
        df = pd.get_dummies(
            df,
            columns=cols,
            prefix=cols,
            prefix_sep="_",
            dummy_na=(settings.handle_unknown == "create_new"),
            dtype=int,
        )
        changed = cols
    elif encode in ("label", "ordinal"):
        for col in cols:
            le = LabelEncoder()
            series = df[col].astype(str)
            series = series.fillna("<NA>") if settings.handle_unknown == "create_new" else series.fillna("")
            df[col] = le.fit_transform(series)
            changed.append(col)
    return df, changed


def _perform_standardize(df: pd.DataFrame, actions: StandardizeActions, filters: List[str], settings: StandardizeSettings):
    cols = _select_standardize_columns(df, filters or [], settings)
    logs: List[str] = []
    if cols:
        _apply_text_ops(df, cols, actions, settings, logs)
    enc = actions.encode or (settings.encoding_type if settings and settings.encoding_type else None)
    encoding_applied = None
    if enc:
        df, enc_cols = _encode_columns(df, cols, enc, settings)
        logs.append(f"encoding:{enc} on {enc_cols}")
        encoding_applied = enc
    return df, cols, logs, encoding_applied


@router.post("/api/standardize/preview")
async def standardize_preview(request: StandardizeRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or StandardizeSettings()
        df_processed, cols, logs, enc = _perform_standardize(df.copy(), request.actions, request.filters or [], settings)
        n = max(1, settings.preview_limit)
        preview = df_processed.head(n).fillna("").to_dict(orient="records")
        return StandardizeResponse(
            message="Preview generated",
            applied_actions=logs,
            columns_changed=cols,
            encoding_applied=enc,
            new_file=None,
            preview_data=preview,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating standardize preview: {str(e)}")


@router.post("/api/standardize/apply")
async def standardize_apply(request: StandardizeRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or StandardizeSettings()
        df_processed, cols, logs, enc = _perform_standardize(df.copy(), request.actions, request.filters or [], settings)
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name, ext = os.path.splitext(request.filename)
        out_name = f"standardized_{name}_{timestamp}{ext}"
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

        return StandardizeResponse(
            message="Standardization applied successfully",
            applied_actions=logs,
            columns_changed=cols,
            encoding_applied=enc,
            new_file=out_name,
            preview_data=preview,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error applying standardization: {str(e)}")
