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


class ColumnTypeInfo(BaseModel):
    column: str
    current_dtype: str
    null_count: int
    null_percentage: float
    suggested_dtype: str
    sample_values: List[str]
    conversion_possible: bool


class DataTypesPreviewRequest(BaseModel):
    filename: str


class DataTypesPreviewResponse(BaseModel):
    total_rows: int
    total_columns: int
    column_info: List[ColumnTypeInfo]
    preview_data: List[Dict[str, Any]]
    memory_usage_before: str


class DataTypesConvertRequest(BaseModel):
    filename: str
    action: str  # auto_detect, convert_to_numeric, convert_to_datetime, convert_to_category, custom_mapping
    columns: Optional[List[str]] = None
    filter_type: str = "all"  # all, numeric, object, datetime, mixed
    settings: Optional[Dict[str, Any]] = None
    custom_mapping: Optional[Dict[str, str]] = None


class DataTypesConvertResponse(BaseModel):
    message: str
    conversions_applied: int
    failed_conversions: List[str]
    updated_dtypes: Dict[str, str]
    memory_usage_before: str
    memory_usage_after: str
    memory_saved: str
    new_file: str
    preview_data: List[Dict[str, Any]]


def suggest_optimal_dtype(series):
    try:
        if series.isnull().all() or len(series) == 0:
            return str(series.dtype), False

        current_dtype = str(series.dtype)

        if series.dtype == 'object':
            try:
                numeric_series = pd.to_numeric(series, errors='coerce')
                if not numeric_series.isnull().all():
                    if numeric_series.dropna().apply(lambda x: float(x).is_integer()).all():
                        max_val = numeric_series.max()
                        min_val = numeric_series.min()
                        if min_val >= 0:
                            if max_val <= 255:
                                return "uint8", True
                            elif max_val <= 65535:
                                return "uint16", True
                            elif max_val <= 4294967295:
                                return "uint32", True
                        else:
                            if -128 <= min_val and max_val <= 127:
                                return "int8", True
                            elif -32768 <= min_val and max_val <= 32767:
                                return "int16", True
                            elif -2147483648 <= min_val and max_val <= 2147483647:
                                return "int32", True
                        return "int64", True
                    else:
                        return "float32", True
            except Exception:
                pass

            try:
                pd.to_datetime(series.dropna().head(10), errors='raise')
                return "datetime64[ns]", True
            except Exception:
                pass
            return "object", False

        elif pd.api.types.is_numeric_dtype(series):
            if pd.api.types.is_integer_dtype(series):
                max_val = series.max()
                min_val = series.min()
                if min_val >= 0:
                    if max_val <= 255:
                        return "uint8", current_dtype != "uint8"
                    elif max_val <= 65535:
                        return "uint16", current_dtype != "uint16"
                    elif max_val <= 4294967295:
                        return "uint32", current_dtype != "uint32"
                else:
                    if -128 <= min_val and max_val <= 127:
                        return "int8", current_dtype != "int8"
                    elif -32768 <= min_val and max_val <= 32767:
                        return "int16", current_dtype != "int16"
                    elif -2147483648 <= min_val and max_val <= 2147483647:
                        return "int32", current_dtype != "int32"
                return current_dtype, False
            else:
                if current_dtype == "float64":
                    return "float32", True
                return current_dtype, False

        elif pd.api.types.is_datetime64_any_dtype(series):
            return "datetime64[ns]", False
        elif pd.api.types.is_categorical_dtype(series):
            return "category", False
        elif pd.api.types.is_bool_dtype(series):
            return "bool", False
        return current_dtype, False
    except Exception:
        return str(series.dtype), False


@router.post("/api/datatypes/preview")
async def preview_datatypes(request: DataTypesPreviewRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        # Look in user files dir, then user cleaned dir
        files_dir = user_files_dir(current_user.id)
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(files_dir)
        ensure_dir(cleaned_dir)
        file_path = files_dir / request.filename
        if not file_path.exists():
            temp_path = cleaned_dir / request.filename
            if temp_path.exists():
                file_path = temp_path
            else:
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")

        ext = file_path.suffix.lower()
        if ext == '.csv':
            for encoding in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
                try:
                    df = pd.read_csv(file_path, encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(status_code=400, detail="Could not decode CSV file")
        elif ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path, engine='openpyxl')
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

        memory_usage_before = df.memory_usage(deep=True).sum()
        memory_before_mb = round(memory_usage_before / 1024 / 1024, 2)

        column_info: List[ColumnTypeInfo] = []
        for col in df.columns:
            col_data = df[col]
            current_dtype = str(col_data.dtype)
            null_count = int(col_data.isnull().sum())
            null_percentage = round((null_count / len(df) * 100), 2) if len(df) > 0 else 0.0
            sample_values = col_data.dropna().head(5).astype(str).tolist()
            suggested_dtype, conversion_possible = suggest_optimal_dtype(col_data)
            column_info.append(ColumnTypeInfo(
                column=col,
                current_dtype=current_dtype,
                null_count=null_count,
                null_percentage=null_percentage,
                suggested_dtype=suggested_dtype,
                sample_values=sample_values,
                conversion_possible=conversion_possible,
            ))

        preview_data = df.head(100).fillna("").to_dict(orient="records")
        return DataTypesPreviewResponse(
            total_rows=len(df),
            total_columns=len(df.columns),
            column_info=column_info,
            preview_data=preview_data,
            memory_usage_before=f"{memory_before_mb} MB",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing preview: {str(e)}")


@router.post("/api/datatypes/convert")
async def convert_datatypes(request: DataTypesConvertRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        files_dir = user_files_dir(current_user.id)
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(files_dir)
        ensure_dir(cleaned_dir)
        file_path = files_dir / request.filename
        if not file_path.exists():
            temp_path = cleaned_dir / request.filename
            if temp_path.exists():
                file_path = temp_path
            else:
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")

        ext = file_path.suffix.lower()
        if ext == '.csv':
            for encoding in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
                try:
                    df = pd.read_csv(file_path, encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(status_code=400, detail="Could not decode CSV file")
        elif ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path, engine='openpyxl')
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

        memory_before = df.memory_usage(deep=True).sum()
        memory_before_mb = round(memory_before / 1024 / 1024, 2)

        if request.columns:
            target_cols = request.columns
        else:
            if request.filter_type == "numeric":
                target_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            elif request.filter_type == "object":
                target_cols = df.select_dtypes(include=['object']).columns.tolist()
            elif request.filter_type == "datetime":
                target_cols = df.select_dtypes(include=['datetime64']).columns.tolist()
            elif request.filter_type == "mixed":
                target_cols = df.select_dtypes(include=['object', 'number']).columns.tolist()
            else:
                target_cols = df.columns.tolist()

        invalid_cols = [col for col in target_cols if col not in df.columns]
        if invalid_cols:
            raise HTTPException(status_code=400, detail=f"Invalid columns: {', '.join(invalid_cols)}")

        df_processed = df.copy()
        conversions_applied = 0
        failed_conversions: List[str] = []

        for col in target_cols:
            try:
                original_dtype = str(df_processed[col].dtype)

                if request.action == "auto_detect":
                    suggested_dtype, _ = suggest_optimal_dtype(df_processed[col])
                    if suggested_dtype != original_dtype:
                        if suggested_dtype == "category":
                            try:
                                unique_vals = df_processed[col].unique()
                                categories = [str(val) for val in unique_vals if pd.notna(val)]
                                cat_data = []
                                for val in df_processed[col]:
                                    if pd.isna(val):
                                        cat_data.append(None)
                                    else:
                                        cat_data.append(str(val))
                                df_processed[col] = pd.Categorical(cat_data, categories=categories)
                            except Exception:
                                continue
                        elif "int" in suggested_dtype or "uint" in suggested_dtype:
                            if df_processed[col].isnull().any():
                                continue
                            else:
                                df_processed[col] = df_processed[col].astype(suggested_dtype)
                        else:
                            df_processed[col] = df_processed[col].astype(suggested_dtype)
                        conversions_applied += 1

                elif request.action == "convert_to_numeric":
                    errors = request.settings.get("errors", "coerce") if request.settings else "coerce"
                    if df_processed[col].dtype == 'bool':
                        df_processed[col] = df_processed[col].astype(int)
                    else:
                        df_processed[col] = pd.to_numeric(df_processed[col], errors=errors)
                    if str(df_processed[col].dtype) != original_dtype:
                        conversions_applied += 1

                elif request.action == "convert_to_datetime":
                    errors = request.settings.get("errors", "coerce") if request.settings else "coerce"
                    date_format = request.settings.get("date_format") if request.settings else None
                    if date_format == "infer":
                        date_format = None
                    df_processed[col] = pd.to_datetime(df_processed[col], errors=errors, format=date_format)
                    if str(df_processed[col].dtype) != original_dtype:
                        conversions_applied += 1

                elif request.action == "convert_to_category":
                    try:
                        unique_vals = df_processed[col].unique()
                        categories = [str(val) for val in unique_vals if pd.notna(val)]
                        cat_data = []
                        for val in df_processed[col]:
                            if pd.isna(val):
                                cat_data.append(None)
                            else:
                                cat_data.append(str(val))
                        df_processed[col] = pd.Categorical(cat_data, categories=categories)
                        if str(df_processed[col].dtype) != original_dtype:
                            conversions_applied += 1
                    except Exception:
                        failed_conversions.append(f"{col}: Failed to convert to category")
                        continue

                elif request.action == "custom_mapping" and request.custom_mapping:
                    if col in request.custom_mapping:
                        target_dtype = request.custom_mapping[col]
                        df_processed[col] = df_processed[col].astype(target_dtype)
                        if target_dtype != original_dtype:
                            conversions_applied += 1
            except Exception as e:
                failed_conversions.append(f"{col}: {str(e)}")
                continue

        memory_after = df_processed.memory_usage(deep=True).sum()
        memory_after_mb = round(memory_after / 1024 / 1024, 2)
        memory_saved_mb = round((memory_before - memory_after) / 1024 / 1024, 2)
        memory_saved_percent = round(((memory_before - memory_after) / memory_before * 100), 2) if memory_before > 0 else 0

        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name, ext2 = os.path.splitext(request.filename)
        converted_name = f"converted_{name}_{timestamp}{ext2}"
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(cleaned_dir)
        converted_path = cleaned_dir / converted_name

        if ext2.lower() == '.csv':
            df_processed.to_csv(converted_path, index=False, encoding='utf-8-sig')
        elif ext2.lower() in ['.xlsx', '.xls']:
            df_processed.to_excel(converted_path, index=False, engine='openpyxl')

        updated_dtypes = df_processed.dtypes.astype(str).to_dict()
        preview_data = df_processed.head(100).fillna("").to_dict(orient="records")

        # Register cleaned version
        try:
            await add_cleaned_version(current_user.id, request.filename, converted_name)
        except Exception:
            pass

        return DataTypesConvertResponse(
            message="Data type conversions completed successfully",
            conversions_applied=conversions_applied,
            failed_conversions=failed_conversions,
            updated_dtypes=updated_dtypes,
            memory_usage_before=f"{memory_before_mb} MB",
            memory_usage_after=f"{memory_after_mb} MB",
            memory_saved=f"{memory_saved_mb} MB ({memory_saved_percent}%)",
            new_file=converted_name,
            preview_data=preview_data,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error converting data types: {str(e)}")
