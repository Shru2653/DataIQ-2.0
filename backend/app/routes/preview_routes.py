"""
preview_routes.py
GET /api/preview?filename=sales.csv&rows=20

Returns first N rows of any CSV/Excel file as JSON.
Works for any uploaded file in the user's files_dir or cleaned_dir.
"""
from __future__ import annotations

import math
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.user_model import UserInDB
from app.utils.auth_utils import get_current_active_user
from app.utils.paths import ensure_dir, user_cleaned_dir, user_files_dir

router = APIRouter()


def _safe(val):
    """Convert numpy / NaN / Inf → JSON-safe Python type."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (pd.Timestamp,)):
        return val.isoformat()
    return val


def _load(filename: str, user: UserInDB) -> pd.DataFrame:
    files_dir   = user_files_dir(user.id)
    cleaned_dir = user_cleaned_dir(user.id)
    ensure_dir(files_dir)
    ensure_dir(cleaned_dir)

    path = files_dir / filename
    if not path.exists():
        alt = cleaned_dir / filename
        if alt.exists():
            path = alt
        else:
            raise HTTPException(404, f"File '{filename}' not found.")

    ext = path.suffix.lower()
    try:
        if ext == ".csv":
            for enc in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                try:
                    return pd.read_csv(path, encoding=enc, low_memory=False)
                except UnicodeDecodeError:
                    continue
            raise HTTPException(400, "Cannot decode CSV.")
        elif ext in {".xlsx", ".xls"}:
            return pd.read_excel(path, engine="openpyxl")
        else:
            raise HTTPException(400, f"Unsupported file type: {ext}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"Failed to read file: {exc}")


@router.get("/api/preview")
async def preview_file(
    filename: str = Query(..., description="Filename to preview"),
    rows: int     = Query(20, ge=1, le=100, description="Number of rows to return"),
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Return the first `rows` rows of a CSV/Excel file plus column metadata.

    Response shape:
    {
      "filename": "sales.csv",
      "total_rows": 1500,
      "total_columns": 8,
      "preview_rows": 20,
      "columns": [
        { "name": "Date", "dtype": "object", "missing_pct": 0.0 }
      ],
      "rows": [ { "Date": "2026-01-01", "Sales": 123.4, ... }, ... ]
    }
    """
    df = _load(filename, current_user)

    total_rows = len(df)
    preview_df = df.head(rows)

    # Column metadata
    columns = []
    for col in df.columns:
        missing_pct = round(float(df[col].isnull().mean() * 100), 1)
        columns.append({
            "name":        col,
            "dtype":       str(df[col].dtype),
            "missing_pct": missing_pct,
        })

    # Rows — convert every cell to JSON-safe type
    safe_rows = []
    for _, row in preview_df.iterrows():
        safe_rows.append({col: _safe(row[col]) for col in df.columns})

    return {
        "filename":      filename,
        "total_rows":    total_rows,
        "total_columns": len(df.columns),
        "preview_rows":  len(preview_df),
        "columns":       columns,
        "rows":          safe_rows,
    }