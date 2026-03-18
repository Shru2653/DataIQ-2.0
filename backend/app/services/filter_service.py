from pathlib import Path
from typing import Dict, List
import pandas as pd
from fastapi import HTTPException

from app.core.config import UPLOAD_DIR
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir


def load_dataset(filename: str) -> pd.DataFrame:
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found")

    ext = file_path.suffix.lower()
    try:
        if ext == ".csv":
            return pd.read_csv(file_path, low_memory=False)
        elif ext in {".xlsx", ".xls"}:
            return pd.read_excel(file_path, engine="openpyxl")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load dataset: {e}")


def load_dataset_user(user_id: str, filename: str) -> pd.DataFrame:
    files_dir = user_files_dir(user_id)
    cleaned_dir = user_cleaned_dir(user_id)
    ensure_dir(files_dir)
    ensure_dir(cleaned_dir)
    file_path = (files_dir / filename)
    if not file_path.exists():
        alt = (cleaned_dir / filename)
        if alt.exists():
            file_path = alt
        else:
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found")

    ext = file_path.suffix.lower()
    try:
        if ext == ".csv":
            return pd.read_csv(file_path, low_memory=False)
        elif ext in {".xlsx", ".xls"}:
            return pd.read_excel(file_path, engine="openpyxl")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load dataset: {e}")


def apply_column_selection(df: pd.DataFrame, columns: List[str]) -> pd.DataFrame:
    if not columns:
        return df
    missing = [c for c in columns if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Columns not found: {missing}")
    return df[columns]


def apply_range_filters(df: pd.DataFrame, range_filters: Dict[str, dict]) -> pd.DataFrame:
    if not range_filters:
        return df
    for column, rf in range_filters.items():
        if column not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
        series = pd.to_numeric(df[column], errors="coerce")
        mask = pd.Series(True, index=df.index)
        min_value = rf.get("min_value")
        max_value = rf.get("max_value")
        if min_value is not None:
            mask &= series >= min_value
        if max_value is not None:
            mask &= series <= max_value
        df = df[mask]
    return df


def apply_value_filters(df: pd.DataFrame, value_filters: Dict[str, dict]) -> pd.DataFrame:
    if not value_filters:
        return df
    for column, vf in value_filters.items():
        if column not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
        values = vf.get("values") or []
        if not values:
            continue
        col_str = df[column].astype(str)
        df = df[col_str.isin([str(v) for v in values])]
    return df


def apply_category_filters(df: pd.DataFrame, category_filters: Dict[str, List[str]]) -> pd.DataFrame:
    if not category_filters:
        return df
    for column, categories in category_filters.items():
        if column not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
        if not categories:
            continue
        col_str = df[column].astype(str)
        df = df[col_str.isin([str(c) for c in categories])]
    return df


def apply_text_search_filters(df: pd.DataFrame, text_filters: Dict[str, dict]) -> pd.DataFrame:
    if not text_filters:
        return df
    for column, tf in text_filters.items():
        if column not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
        term = (tf.get("search_term") or "").strip()
        if not term:
            continue
        case_sensitive = bool(tf.get("case_sensitive", False))
        col_str = df[column].astype(str)
        if case_sensitive:
            mask = col_str.str.contains(term, na=False, regex=False)
        else:
            mask = col_str.str.contains(term, case=False, na=False, regex=False)
        df = df[mask]
    return df


def apply_pagination(df: pd.DataFrame, limit: int, offset: int) -> pd.DataFrame:
    if offset and offset > 0:
        df = df.iloc[offset:]
    if limit and limit > 0:
        df = df.head(limit)
    return df
