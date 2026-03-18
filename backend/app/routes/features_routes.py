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


class FeatureSettings(BaseModel):
    action: str  # polynomial, interaction, binning, date, text
    degree: int = 2  # for polynomial/interaction
    include_bias: bool = False
    interaction_only: bool = False
    binning_strategy: Optional[str] = None  # 'equal_width' or 'equal_freq'
    bins: int = 5
    date_parts: Optional[List[str]] = None  # ['year','month','day','weekday']
    text_options: Optional[Dict[str, Any]] = None  # { use_tfidf, max_features }
    selected_columns: Optional[List[str]] = None
    preview_limit: int = 100


class FeatureRequest(BaseModel):
    filename: str
    filters: Optional[List[str]] = None  # Numeric Features, Date Columns, Text Columns, Selected Columns
    settings: FeatureSettings


class FeatureResponse(BaseModel):
    message: str
    new_columns: List[str]
    action_applied: str
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


def _select_feature_columns(df: pd.DataFrame, filters: List[str], settings: FeatureSettings) -> List[str]:
    cols: List[str] = []
    if not filters:
        filters = []
    if "Numeric Features" in filters or not filters:
        cols.extend(df.select_dtypes(include=[np.number]).columns.tolist())
    if "Date Columns" in filters:
        for c in df.columns:
            if np.issubdtype(df[c].dtype, np.datetime64):
                cols.append(c)
            else:
                try:
                    pd.to_datetime(df[c])
                    cols.append(c)
                except Exception:
                    pass
    if "Text Columns" in filters:
        cols.extend(df.select_dtypes(include=[object]).columns.tolist())
    if "Selected Columns" in filters and settings.selected_columns:
        cols.extend([c for c in settings.selected_columns if c in df.columns])
    unique: List[str] = []
    seen = set()
    for c in cols:
        if c not in seen and c in df.columns:
            unique.append(c)
            seen.add(c)
    return unique


def _fe_polynomial(df: pd.DataFrame, num_cols: List[str], settings: FeatureSettings):
    if not num_cols:
        return df, []
    try:
        from sklearn.preprocessing import PolynomialFeatures
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PolynomialFeatures not available: {e}")
    poly = PolynomialFeatures(degree=max(1, settings.degree), include_bias=settings.include_bias, interaction_only=settings.interaction_only)
    X_df = df[num_cols]
    row_nan_mask = X_df.isna().any(axis=1)
    X_filled = X_df.fillna(X_df.median(numeric_only=True))
    X_new = poly.fit_transform(X_filled.values)
    names = poly.get_feature_names_out(num_cols)
    new_df = df.copy()
    new_cols_added: List[str] = []
    for idx, name in enumerate(names):
        if name in new_df.columns:
            continue
        if name in num_cols:
            continue
        safe_name = name.replace(' ', '').replace('^', '^')
        new_df[safe_name] = X_new[:, idx]
        new_df.loc[row_nan_mask, safe_name] = np.nan
        new_cols_added.append(safe_name)
    return new_df, new_cols_added


def _fe_interaction_only(df: pd.DataFrame, num_cols: List[str], settings: FeatureSettings):
    s = FeatureSettings(**{**settings.dict(), 'interaction_only': True, 'include_bias': settings.include_bias, 'degree': max(2, settings.degree)})
    return _fe_polynomial(df, num_cols, s)


def _fe_binning(df: pd.DataFrame, cols: List[str], settings: FeatureSettings):
    new_df = df.copy()
    created: List[str] = []
    for c in cols:
        if c not in new_df.columns:
            continue
        if settings.binning_strategy == 'equal_freq':
            try:
                binned = pd.qcut(new_df[c], q=max(1, settings.bins), duplicates='drop')
            except Exception:
                binned = pd.qcut(new_df[c].rank(method='first'), q=max(1, settings.bins), duplicates='drop')
        else:
            binned = pd.cut(new_df[c], bins=max(1, settings.bins))
        name = f"{c}_bin"
        new_df[name] = binned.astype(str)
        created.append(name)
    return new_df, created


def _fe_date_parts(df: pd.DataFrame, cols: List[str], settings: FeatureSettings):
    new_df = df.copy()
    parts = settings.date_parts or ['year','month','day','weekday']
    created: List[str] = []
    for c in cols:
        try:
            dt = pd.to_datetime(new_df[c])
        except Exception:
            continue
        if 'year' in parts:
            name=f"{c}_Year"; new_df[name]=dt.dt.year; created.append(name)
        if 'month' in parts:
            name=f"{c}_Month"; new_df[name]=dt.dt.month; created.append(name)
        if 'day' in parts:
            name=f"{c}_Day"; new_df[name]=dt.dt.day; created.append(name)
        if 'weekday' in parts:
            name=f"{c}_Weekday"; new_df[name]=dt.dt.weekday; created.append(name)
        if 'quarter' in parts:
            name=f"{c}_Quarter"; new_df[name]=dt.dt.quarter; created.append(name)
    return new_df, created


def _fe_text(df: pd.DataFrame, cols: List[str], settings: FeatureSettings):
    new_df = df.copy()
    created: List[str] = []
    opts = settings.text_options or {}
    use_tfidf = bool(opts.get('use_tfidf', False))
    max_features = int(opts.get('max_features', 100))
    for c in cols:
        if c not in new_df.columns:
            continue
        s = new_df[c].astype(str).fillna("")
        wc = s.str.split().apply(len)
        cl = s.str.len()
        name_wc = f"{c}_WordCount"; name_cl = f"{c}_CharLen"
        new_df[name_wc] = wc; new_df[name_cl] = cl
        created.extend([name_wc, name_cl])
    if use_tfidf and cols:
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            combined = df[cols].astype(str).fillna("").apply(lambda r: ' '.join(r.values), axis=1)
            vect = TfidfVectorizer(max_features=max_features)
            mat = vect.fit_transform(combined)
            tfidf_cols = [f"TFIDF_{w}" for w in vect.get_feature_names_out()]
            import scipy.sparse as sp
            mat_dense = mat.toarray() if hasattr(mat, 'toarray') else sp.csr_matrix(mat).toarray()
            for i, name in enumerate(tfidf_cols):
                new_df[name] = mat_dense[:, i]
            created.extend(tfidf_cols)
        except Exception:
            pass
    return new_df, created


def _perform_feature_engineering(df: pd.DataFrame, request: FeatureRequest):
    settings = request.settings
    filters = request.filters or []
    cols = _select_feature_columns(df, filters, settings)
    action = settings.action.lower()
    created: List[str] = []
    if action in ("polynomial", "interaction"):
        num_cols = [c for c in cols if c in df.select_dtypes(include=[np.number]).columns]
        if action == "polynomial":
            df, created = _fe_polynomial(df, num_cols, settings)
        else:
            df, created = _fe_interaction_only(df, num_cols, settings)
    elif action == "binning":
        num_cols = [c for c in cols if c in df.select_dtypes(include=[np.number]).columns]
        df, created = _fe_binning(df, num_cols, settings)
    elif action == "date":
        df, created = _fe_date_parts(df, cols, settings)
    elif action == "text":
        text_cols = [c for c in cols if c in df.select_dtypes(include=[object]).columns]
        df, created = _fe_text(df, text_cols, settings)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown feature action: {action}")
    return df, created


@router.post("/api/features/preview")
async def features_preview(request: FeatureRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        df_processed, created = _perform_feature_engineering(df.copy(), request)
        n = max(1, request.settings.preview_limit if request.settings else 10)
        preview = df_processed.head(n).fillna("").to_dict(orient="records")
        return FeatureResponse(
            message="Feature engineering preview generated",
            new_columns=created,
            action_applied=request.settings.action,
            new_file=None,
            preview_data=preview,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating feature preview: {str(e)}")


@router.post("/api/features/apply")
async def features_apply(request: FeatureRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        df_processed, created = _perform_feature_engineering(df.copy(), request)
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name, ext = os.path.splitext(request.filename)
        out_name = f"features_{name}_{timestamp}{ext}"
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(cleaned_dir)
        out_path = cleaned_dir / out_name
        if ext.lower() == ".csv":
            df_processed.to_csv(out_path, index=False, encoding="utf-8-sig")
        elif ext.lower() in [".xlsx", ".xls"]:
            df_processed.to_excel(out_path, index=False, engine="openpyxl")
        n = max(1, request.settings.preview_limit if request.settings else 10)
        preview = df_processed.head(n).fillna("").to_dict(orient="records")
        # Register cleaned version
        try:
            await add_cleaned_version(current_user.id, request.filename, out_name)
        except Exception:
            pass

        return FeatureResponse(
            message="Feature engineering applied successfully",
            new_columns=created,
            action_applied=request.settings.action,
            new_file=out_name,
            preview_data=preview,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error applying feature engineering: {str(e)}")
