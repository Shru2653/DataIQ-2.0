from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import pandas as pd
import numpy as np

from app.core.config import UPLOAD_DIR, TEMP_DIR
from app.services.dataset_service import add_cleaned_version, resolve_original_filename
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir

router = APIRouter()


class MissingValuesPreviewRequest(BaseModel):
    filename: str


class MissingValuesSummary(BaseModel):
    column: str
    missing_count: int
    missing_percent: float


class MissingValuesPreviewResponse(BaseModel):
    total_rows: int
    total_columns: int
    missing_summary: List[MissingValuesSummary]
    high_missing_cols: List[str]
    low_missing_cols: List[str]


class MissingValuesHandleRequest(BaseModel):
    filename: str
    action: str  # drop, forward, backward, mean, median, custom
    filter: str = "all"  # all, numeric, text
    threshold: float = 0.5
    custom_value: Optional[str] = None


class MissingValuesHandleResponse(BaseModel):
    message: str
    rows_affected: int
    new_file: str


@router.post("/api/missing-values/preview")
async def preview_missing_values(request: MissingValuesPreviewRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        files_dir = user_files_dir(current_user.id)
        ensure_dir(files_dir)
        file_path = files_dir / request.filename
        if not file_path.exists():
            # Fallback to cleaned directory
            cleaned_dir = user_cleaned_dir(current_user.id)
            ensure_dir(cleaned_dir)
            alt_path = cleaned_dir / request.filename
            if alt_path.exists():
                file_path = alt_path
            else:
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")

        ext = file_path.suffix.lower()
        if ext == ".csv":
            for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                try:
                    df = pd.read_csv(file_path, encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(status_code=400, detail="Could not decode CSV file")
        elif ext in [".xlsx", ".xls"]:
            df = pd.read_excel(file_path, engine="openpyxl")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

        missing_info = []
        for col in df.columns:
            missing_count = int(df[col].isnull().sum())
            missing_percent = round((missing_count / len(df)) * 100, 2) if len(df) else 0.0
            missing_info.append(MissingValuesSummary(column=col, missing_count=missing_count, missing_percent=missing_percent))

        high_missing_cols = [info.column for info in missing_info if info.missing_percent > 50]
        low_missing_cols = [info.column for info in missing_info if 0 < info.missing_percent <= 50]

        return MissingValuesPreviewResponse(
            total_rows=len(df),
            total_columns=len(df.columns),
            missing_summary=missing_info,
            high_missing_cols=high_missing_cols,
            low_missing_cols=low_missing_cols,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing preview: {str(e)}")


@router.post("/api/missing-values/handle")
async def handle_missing_values(request: MissingValuesHandleRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        files_dir = user_files_dir(current_user.id)
        ensure_dir(files_dir)
        file_path = files_dir / request.filename
        if not file_path.exists():
            # Fallback to cleaned directory
            cleaned_dir = user_cleaned_dir(current_user.id)
            ensure_dir(cleaned_dir)
            alt_path = cleaned_dir / request.filename
            if alt_path.exists():
                file_path = alt_path
            else:
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")

        ext = file_path.suffix.lower()
        if ext == ".csv":
            for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                try:
                    df = pd.read_csv(file_path, encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(status_code=400, detail="Could not decode CSV file")
        elif ext in [".xlsx", ".xls"]:
            df = pd.read_excel(file_path, engine="openpyxl")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

        initial_nulls = int(df.isnull().sum().sum())
        df_processed = df.copy()

        if request.filter == "numeric":
            target_cols = df_processed.select_dtypes(include=[np.number]).columns.tolist()
        elif request.filter == "text":
            target_cols = df_processed.select_dtypes(include=["object", "string"]).columns.tolist()
        else:
            target_cols = df_processed.columns.tolist()

        if request.action == "drop":
            df_processed = df_processed.dropna(subset=target_cols)
        elif request.action == "forward":
            for col in target_cols:
                df_processed[col] = df_processed[col].fillna(method="ffill")
        elif request.action == "backward":
            for col in target_cols:
                df_processed[col] = df_processed[col].fillna(method="bfill")
        elif request.action == "mean":
            numeric_cols = df_processed.select_dtypes(include=[np.number]).columns
            target_numeric = [c for c in target_cols if c in numeric_cols]
            for col in target_numeric:
                mean_val = df_processed[col].mean()
                if not pd.isna(mean_val):
                    df_processed[col] = df_processed[col].fillna(mean_val)
        elif request.action == "median":
            numeric_cols = df_processed.select_dtypes(include=[np.number]).columns
            target_numeric = [c for c in target_cols if c in numeric_cols]
            for col in target_numeric:
                median_val = df_processed[col].median()
                if not pd.isna(median_val):
                    df_processed[col] = df_processed[col].fillna(median_val)
        elif request.action == "custom" and request.custom_value is not None:
            for col in target_cols:
                try:
                    if df_processed[col].dtype in ["int64", "float64"]:
                        fill_value = float(request.custom_value) if "." in request.custom_value else int(request.custom_value)
                    else:
                        fill_value = request.custom_value
                    df_processed[col] = df_processed[col].fillna(fill_value)
                except (ValueError, TypeError):
                    df_processed[col] = df_processed[col].fillna(request.custom_value)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported action: {request.action}")

        final_nulls = int(df_processed.isnull().sum().sum())
        rows_affected = initial_nulls - final_nulls

        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Always derive name from the root original to avoid nested prefixes
        root_original = await resolve_original_filename(current_user.id, request.filename)
        base, ext2 = os.path.splitext(root_original)
        cleaned_name = f"cleaned_{base}_{timestamp}{ext2}"
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(cleaned_dir)
        cleaned_path = cleaned_dir / cleaned_name

        if ext2.lower() == ".csv":
            df_processed.to_csv(cleaned_path, index=False, encoding="utf-8-sig")
        elif ext2.lower() in [".xlsx", ".xls"]:
            df_processed.to_excel(cleaned_path, index=False, engine="openpyxl")

        # Register cleaned version
        try:
            # Attach to the root original
            await add_cleaned_version(current_user.id, root_original, cleaned_name)
        except Exception:
            print(f"CRITICAL: Failed to register cleaned file in database: {e}") 
            # Tell the frontend something went wrong
            raise HTTPException(
                status_code=500, 
                detail=f"File was cleaned, but failed to update database: {e}"
            )

        return MissingValuesHandleResponse(
            message="Missing values handled successfully",
            rows_affected=rows_affected,
            new_file=cleaned_name,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error handling missing values: {str(e)}")
