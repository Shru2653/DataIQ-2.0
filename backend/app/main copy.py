from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import shutil
import tempfile
import atexit
import glob
import re
from typing import List, Optional, Dict, Any, Union
import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder
from app.core.config import UPLOAD_DIR, TEMP_DIR
from app.core.database import init_db, close_db
from app.utils.cleanup_utils import (
    cleanup_temp_directory,
    cleanup_processed_files as cleanup_processed_files_util,
    cleanup_old_temp_files,
)
from app.routes.files_routes import router as files_router
from app.routes.analyze_routes import router as analyze_router
from app.routes.filters_routes import router as filters_router
from app.routes.dataset_info_routes import router as dataset_info_router
from app.routes.missing_values_routes import router as missing_values_router
from app.routes.datatypes_routes import router as datatypes_router
from app.routes.duplicates_routes import router as duplicates_router
from app.routes.standardize_routes import router as standardize_router
from app.routes.outliers_routes import router as outliers_router
from app.routes.normalize_routes import router as normalize_router
from app.routes.features_routes import router as features_router
from app.routes.dax_routes import router as dax_router
from app.routes.cleanup_routes import router as cleanup_router

# Directories are managed via app.core.config (UPLOAD_DIR, TEMP_DIR)

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"}
ALLOWED_DOC_EXTENSIONS = {".csv", ".xlsx", ".xls", ".pdf"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS.union(ALLOWED_DOC_EXTENSIONS)

# ============================================================================
# FILE CLEANUP UTILITIES
# ============================================================================

def cleanup_processed_files():
    try:
        removed = cleanup_processed_files_util()
        if removed:
            print(f"Cleaned up processed files: {removed}")
    except Exception as e:
        print(f"Error during cleanup: {e}")

# Note: Disabled automatic cleanup to avoid deleting processed/cleaned files unintentionally.
# If needed, trigger cleanup via explicit API endpoint only.

# ============================================================================
# FILTER DATA MODELS moved to routes/filters_routes.py
# ============================================================================

app = FastAPI(title="DataIQ Backend", version="0.1.0")

# CORS for Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files statically
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/temp", StaticFiles(directory=TEMP_DIR), name="temp")

@app.on_event("startup")
async def _startup():
    await init_db()

@app.on_event("shutdown")
async def _shutdown():
    await close_db()

# Prepare router inclusion (routes are currently empty; endpoints remain here until migration)
app.include_router(files_router)
app.include_router(analyze_router)
app.include_router(filters_router)
app.include_router(dataset_info_router)
app.include_router(missing_values_router)
app.include_router(datatypes_router)
app.include_router(duplicates_router)
app.include_router(standardize_router)
app.include_router(outliers_router)
app.include_router(normalize_router)
app.include_router(features_router)
app.include_router(dax_router)
app.include_router(cleanup_router)

 

def _validate_filename(filename: str) -> None:
    _, ext = os.path.splitext(filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' is not allowed.")

 


# dataset loading and filtering helpers moved to services/filter_service.py


def _apply_column_selection(df: pd.DataFrame, columns: List[str]) -> pd.DataFrame:
    """
    Filter DataFrame to include only specified columns.
    Validates column existence before filtering.
    """
    if not columns:
        return df

    # dataset loading and filtering helpers moved to services/filter_service.py


    def _apply_column_selection(df: pd.DataFrame, columns: List[str]) -> pd.DataFrame:
        """
        Filter DataFrame to include only specified columns.
        Validates column existence before filtering.
        """
        if not columns:
            return df
        
        # Validate all requested columns exist
        missing_cols = [col for col in columns if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400, 
                detail=f"Columns not found: {missing_cols}"
            )
        
        return df[columns]


    def _apply_range_filters(df: pd.DataFrame, range_filters: Dict[str, RangeFilter]) -> pd.DataFrame:
        """
        Apply numeric range filters (min-max) using efficient pandas operations.
        Handles both integer and float columns automatically.
        """
        if not range_filters:
            return df
        
        for column, range_filter in range_filters.items():
            if column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
            
            # Convert to numeric, coercing errors to NaN for non-numeric values
            numeric_series = pd.to_numeric(df[column], errors='coerce')
            
            # Build boolean mask for range filtering
            mask = pd.Series([True] * len(df), index=df.index)
            
            if range_filter.min_value is not None:
                mask &= (numeric_series >= range_filter.min_value)
            
            if range_filter.max_value is not None:
                mask &= (numeric_series <= range_filter.max_value)
            
            # Apply filter - this preserves rows where the column value is within range
            df = df[mask]
        
        return df


    def _apply_value_filters(df: pd.DataFrame, value_filters: Dict[str, ValueFilter]) -> pd.DataFrame:
        """
        Apply exact value matching filters using efficient pandas isin() operations.
        Handles string matching with proper type conversion.
        """
        if not value_filters:
            return df
        
        for column, value_filter in value_filters.items():
            if column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
            
            if not value_filter.values:
                continue
            
            # Convert both column values and filter values to strings for consistent comparison
            column_str = df[column].astype(str)
            filter_values = [str(v) for v in value_filter.values]
            
            # Use pandas isin() for efficient filtering
            df = df[column_str.isin(filter_values)]
        
        return df


    def _apply_category_filters(df: pd.DataFrame, category_filters: Dict[str, List[str]]) -> pd.DataFrame:
        """
        Apply multi-select category filters using pandas isin() operations.
        Similar to value filters but with simpler input structure.
        """
        if not category_filters:
            return df
        
        for column, selected_categories in category_filters.items():
            if column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
            
            if not selected_categories:
                continue
            
            # Convert to strings and apply filter
            column_str = df[column].astype(str)
            selected_str = [str(cat) for cat in selected_categories]
            df = df[column_str.isin(selected_str)]
        
        return df


    def _apply_text_search_filters(df: pd.DataFrame, text_filters: Dict[str, TextSearchFilter]) -> pd.DataFrame:
        """
        Apply text search filters using pandas string operations.
        Supports case-sensitive and case-insensitive substring matching.
        """
        if not text_filters:
            return df
        
        for column, text_filter in text_filters.items():
            if column not in df.columns:
                raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
            
            if not text_filter.search_term.strip():
                continue
            
            # Convert column to string type
            column_str = df[column].astype(str)
            
            # Apply case-sensitive or case-insensitive search
            if text_filter.case_sensitive:
                mask = column_str.str.contains(text_filter.search_term, na=False, regex=False)
            else:
                mask = column_str.str.contains(
                    text_filter.search_term, 
                    case=False, 
                    na=False, 
                    regex=False
                )
            
            df = df[mask]
        
        return df


    def _apply_pagination(df: pd.DataFrame, limit: int, offset: int) -> pd.DataFrame:
        """
        Apply pagination to DataFrame for performance optimization.
        Uses efficient pandas slicing operations.
        """
        if offset > 0:
            df = df.iloc[offset:]
        
        if limit > 0:
            df = df.head(limit)
        
        return df


    # /apply-filters moved to routes/filters_routes.py


    # dataset-info moved to routes/dataset_info_routes.py


    # ============================================================================
    # MISSING VALUES HANDLING - Direct integration for quick deployment
    # ============================================================================

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

    @app.post("/api/missing-values/preview")
    async def preview_missing_values(request: MissingValuesPreviewRequest):
        """Preview missing values in the dataset"""
        try:
            # Load dataset from uploads directory
            file_path = os.path.join(UPLOAD_DIR, request.filename)
            
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")
            
            # Load dataset with proper encoding handling
            _, ext = os.path.splitext(request.filename)
            ext = ext.lower()
            
            if ext == '.csv':
                # Try different encodings for CSV files
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
            
            # Calculate missing values per column
            missing_info = []
            for col in df.columns:
                missing_count = int(df[col].isnull().sum())
                missing_percent = round((missing_count / len(df)) * 100, 2)
                
                missing_info.append(MissingValuesSummary(
                    column=col,
                    missing_count=missing_count,
                    missing_percent=missing_percent
                ))
            
            # Categorize columns by missing percentage
            high_missing_cols = [info.column for info in missing_info if info.missing_percent > 50]
            low_missing_cols = [info.column for info in missing_info if info.missing_percent <= 50 and info.missing_percent > 0]
            
            return MissingValuesPreviewResponse(
                total_rows=len(df),
                total_columns=len(df.columns),
                missing_summary=missing_info,
                high_missing_cols=high_missing_cols,
                low_missing_cols=low_missing_cols
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error processing preview: {str(e)}")

    @app.post("/api/missing-values/handle")
    async def handle_missing_values(request: MissingValuesHandleRequest):
        """Handle missing values using selected strategy"""
        try:
            # Load dataset from uploads directory
            file_path = os.path.join(UPLOAD_DIR, request.filename)
            
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")
            
            # Load dataset with proper encoding handling
            _, ext = os.path.splitext(request.filename)
            ext = ext.lower()
            
            if ext == '.csv':
                # Try different encodings for CSV files
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
            
            initial_nulls = int(df.isnull().sum().sum())
            
            # Create a copy for processing
            df_processed = df.copy()
            
            # Apply filter to select target columns
            if request.filter == "numeric":
                target_cols = df_processed.select_dtypes(include=[np.number]).columns.tolist()
            elif request.filter == "text":
                target_cols = df_processed.select_dtypes(include=['object', 'string']).columns.tolist()
            else:  # "all"
                target_cols = df_processed.columns.tolist()
            
            # Apply the selected action
            if request.action == "drop":
                # Drop rows with any missing values in target columns
                df_processed = df_processed.dropna(subset=target_cols)
                
            elif request.action == "forward":
                # Forward fill
                for col in target_cols:
                    df_processed[col] = df_processed[col].fillna(method='ffill')
                    
            elif request.action == "backward":
                # Backward fill
                for col in target_cols:
                    df_processed[col] = df_processed[col].fillna(method='bfill')
                    
            elif request.action == "mean":
                # Fill with mean (numeric columns only)
                numeric_cols = df_processed.select_dtypes(include=[np.number]).columns
                target_numeric = [col for col in target_cols if col in numeric_cols]
                
                for col in target_numeric:
                    mean_val = df_processed[col].mean()
                    if not pd.isna(mean_val):
                        df_processed[col] = df_processed[col].fillna(mean_val)
                        
            elif request.action == "median":
                # Fill with median (numeric columns only)
                numeric_cols = df_processed.select_dtypes(include=[np.number]).columns
                target_numeric = [col for col in target_cols if col in numeric_cols]
                
                for col in target_numeric:
                    median_val = df_processed[col].median()
                    if not pd.isna(median_val):
                        df_processed[col] = df_processed[col].fillna(median_val)
                        
            elif request.action == "custom" and request.custom_value is not None:
                # Fill with custom value
                for col in target_cols:
                    # Try to convert custom value to appropriate type
                    try:
                        if df_processed[col].dtype in ['int64', 'float64']:
                            fill_value = float(request.custom_value) if '.' in request.custom_value else int(request.custom_value)
                        else:
                            fill_value = request.custom_value
                        df_processed[col] = df_processed[col].fillna(fill_value)
                    except (ValueError, TypeError):
                        # If conversion fails, use as string
                        df_processed[col] = df_processed[col].fillna(request.custom_value)
            
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported action: {request.action}")
            
            # Calculate rows affected
            final_nulls = int(df_processed.isnull().sum().sum())
            rows_affected = initial_nulls - final_nulls
            
            # Generate cleaned filename with timestamp
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            name, ext = os.path.splitext(request.filename)
            cleaned_name = f"cleaned_{name}_{timestamp}{ext}"
            cleaned_path = os.path.join(TEMP_DIR, cleaned_name)
            
            # Save the cleaned dataset
            if ext.lower() == '.csv':
                df_processed.to_csv(cleaned_path, index=False, encoding='utf-8-sig')
            elif ext.lower() in ['.xlsx', '.xls']:
                df_processed.to_excel(cleaned_path, index=False, engine='openpyxl')
            
            return MissingValuesHandleResponse(
                message="Missing values handled successfully",
                rows_affected=rows_affected,
                new_file=cleaned_name
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error handling missing values: {str(e)}")

    # ============================================================================
    # REMOVE DUPLICATES - Duplicate detection and removal functionality
    # ============================================================================

    class DuplicatesPreviewRequest(BaseModel):
        filename: str
        subset: Optional[List[str]] = None  # Columns to check for duplicates (None = all columns)

    class DuplicateRecord(BaseModel):
        row_index: int
        data: Dict[str, Any]

    class DuplicatesPreviewResponse(BaseModel):
        total_rows: int
        total_columns: int
        duplicate_count: int
        duplicate_percentage: float
        unique_duplicate_groups: int  # Number of unique duplicate patterns
        preview: List[Dict[str, Any]]  # Sample of duplicate rows
        columns_checked: List[str]

    class DuplicatesHandleRequest(BaseModel):
        filename: str
        action: str  # find_duplicates, remove_all, keep_first, keep_last, mark_duplicates
        subset: Optional[List[str]] = None  # Columns to check for duplicates (None = all columns)
        keep: str = "first"  # first, last, false (for remove_all)
        mark_only: bool = False

    class DuplicatesHandleResponse(BaseModel):
        message: str
        rows_before: int
        rows_after: int
        duplicates_removed: int
        new_file: str

    # ============================================================================
    # DATA TYPES CORRECTION - Data type detection and conversion functionality
    # ============================================================================

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
        preview_data: List[Dict[str, Any]]  # First 5 rows
        memory_usage_before: str

    class DataTypesConvertRequest(BaseModel):
        filename: str
        action: str  # auto_detect, convert_to_numeric, convert_to_datetime, convert_to_category, custom_mapping
        columns: Optional[List[str]] = None  # Columns to convert (None = all columns)
        filter_type: str = "all"  # all, numeric, object, datetime, mixed
        settings: Optional[Dict[str, Any]] = None  # Additional settings
        custom_mapping: Optional[Dict[str, str]] = None  # For custom type conversions

    class DataTypesConvertResponse(BaseModel):
        message: str
        conversions_applied: int
        failed_conversions: List[str]
        updated_dtypes: Dict[str, str]
        memory_usage_before: str
        memory_usage_after: str
        memory_saved: str
        new_file: str
        preview_data: List[Dict[str, Any]]  # First 5 rows after conversion

    @app.post("/api/datatypes/preview")
    async def preview_datatypes(request: DataTypesPreviewRequest):
        """Preview data types and suggest optimizations"""
        try:
            # Load dataset from uploads directory
            file_path = os.path.join(UPLOAD_DIR, request.filename)
            
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")
            
            # Load dataset with proper encoding handling
            _, ext = os.path.splitext(request.filename)
            ext = ext.lower()
            
            if ext == '.csv':
                # Try different encodings for CSV files
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
            
            # Calculate memory usage before optimization
            memory_usage_before = df.memory_usage(deep=True).sum()
            memory_before_mb = round(memory_usage_before / 1024 / 1024, 2)
            
            # Analyze each column for data type optimization
            column_info = []
            for col in df.columns:
                col_data = df[col]
                current_dtype = str(col_data.dtype)
                null_count = int(col_data.isnull().sum())
                null_percentage = round((null_count / len(df) * 100), 2) if len(df) > 0 else 0.0
                
                # Get sample values (non-null, first 5)
                sample_values = col_data.dropna().head(5).astype(str).tolist()
                
                # Suggest optimized data type
                suggested_dtype, conversion_possible = suggest_optimal_dtype(col_data)
                
                column_info.append(ColumnTypeInfo(
                    column=col,
                    current_dtype=current_dtype,
                    null_count=null_count,
                    null_percentage=null_percentage,
                    suggested_dtype=suggested_dtype,
                    sample_values=sample_values,
                    conversion_possible=conversion_possible
                ))
            
            # Get preview data (first 5 rows)
            preview_data = df.head(5).fillna("").to_dict(orient="records")
            
            return DataTypesPreviewResponse(
                total_rows=len(df),
                total_columns=len(df.columns),
                column_info=column_info,
                preview_data=preview_data,
                memory_usage_before=f"{memory_before_mb} MB"
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error processing preview: {str(e)}")

    def suggest_optimal_dtype(series):
        """Suggest optimal data type for a pandas Series"""
        try:
            # Skip if series is empty or all null
            if series.isnull().all() or len(series) == 0:
                return str(series.dtype), False
            
            current_dtype = str(series.dtype)
            
            # For object columns, try to infer better types
            if series.dtype == 'object':
                # Try numeric conversion
                try:
                    numeric_series = pd.to_numeric(series, errors='coerce')
                    if not numeric_series.isnull().all():
                        # Check if it can be integer
                        if numeric_series.dropna().apply(lambda x: x.is_integer()).all():
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
                except:
                    pass
                
                # Try datetime conversion
                try:
                    pd.to_datetime(series.dropna().head(10), errors='raise')
                    return "datetime64[ns]", True
                except:
                    pass
                
                # Check if it's categorical (low cardinality) - temporarily disabled
                # unique_ratio = series.nunique() / len(series)
                # if unique_ratio < 0.5 and series.nunique() < 50:
                #     return "category", True
                
                return "object", False
            
            # For numeric columns, suggest smaller types if possible
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
                    # Float optimization
                    if current_dtype == "float64":
                        return "float32", True
                    return current_dtype, False
            
            # For datetime columns
            elif pd.api.types.is_datetime64_any_dtype(series):
                return "datetime64[ns]", False
            
            # For categorical columns
            elif pd.api.types.is_categorical_dtype(series):
                return "category", False
            
            # For boolean columns - keep as boolean (they're already optimized)
            elif pd.api.types.is_bool_dtype(series):
                return "bool", False
            
            return current_dtype, False
            
        except Exception:
            return str(series.dtype), False

    @app.post("/api/datatypes/convert")
    async def convert_datatypes(request: DataTypesConvertRequest):
        """Convert data types using selected strategy"""
        try:
            # Load dataset from uploads directory
            file_path = os.path.join(UPLOAD_DIR, request.filename)
            
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")
            
            # Load dataset with proper encoding handling
            _, ext = os.path.splitext(request.filename)
            ext = ext.lower()
            
            if ext == '.csv':
                # Try different encodings for CSV files
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
            
            # Calculate memory usage before conversion
            memory_before = df.memory_usage(deep=True).sum()
            memory_before_mb = round(memory_before / 1024 / 1024, 2)
            
            # Determine columns to convert
            if request.columns:
                target_cols = request.columns
            else:
                # Filter columns based on filter_type
                if request.filter_type == "numeric":
                    target_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                elif request.filter_type == "object":
                    target_cols = df.select_dtypes(include=['object']).columns.tolist()
                elif request.filter_type == "datetime":
                    target_cols = df.select_dtypes(include=['datetime64']).columns.tolist()
                elif request.filter_type == "mixed":
                    target_cols = df.select_dtypes(include=['object', 'number']).columns.tolist()
                else:  # "all"
                    target_cols = df.columns.tolist()
            
            # Verify all target columns exist
            invalid_cols = [col for col in target_cols if col not in df.columns]
            if invalid_cols:
                raise HTTPException(status_code=400, detail=f"Invalid columns: {', '.join(invalid_cols)}")
            
            # Create a copy for processing
            df_processed = df.copy()
            conversions_applied = 0
            failed_conversions = []
            
            # Apply conversions based on action
            for col in target_cols:
                try:
                    original_dtype = str(df_processed[col].dtype)
                    
                    if request.action == "auto_detect":
                        suggested_dtype, _ = suggest_optimal_dtype(df_processed[col])
                        if suggested_dtype != original_dtype:
                            # Handle different data type conversions safely
                            if suggested_dtype == "category":
                                # Convert to category by creating a completely new column
                                try:
                                    # Get unique values and create categorical
                                    unique_vals = df_processed[col].unique()
                                    categories = [str(val) for val in unique_vals if pd.notna(val)]
                                    
                                    # Map values to categorical
                                    cat_data = []
                                    for val in df_processed[col]:
                                        if pd.isna(val):
                                            cat_data.append(None)
                                        else:
                                            cat_data.append(str(val))
                                    
                                    # Create categorical series
                                    df_processed[col] = pd.Categorical(cat_data, categories=categories)
                                except Exception:
                                    # If categorical conversion fails, skip it
                                    continue
                            elif "int" in suggested_dtype or "uint" in suggested_dtype:
                                # For integer conversions, ensure no nulls that would cause issues
                                if df_processed[col].isnull().any():
                                    # Skip integer conversion if there are nulls
                                    continue
                                else:
                                    df_processed[col] = df_processed[col].astype(suggested_dtype)
                            else:
                                df_processed[col] = df_processed[col].astype(suggested_dtype)
                            conversions_applied += 1
                    
                    elif request.action == "convert_to_numeric":
                        errors = request.settings.get("errors", "coerce") if request.settings else "coerce"
                        # Handle boolean columns specially - convert True/False to 1/0
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
                        # Convert to category by creating a completely new column
                        try:
                            # Get unique values and create categorical
                            unique_vals = df_processed[col].unique()
                            categories = [str(val) for val in unique_vals if pd.notna(val)]
                            
                            # Map values to categorical
                            cat_data = []
                            for val in df_processed[col]:
                                if pd.isna(val):
                                    cat_data.append(None)
                                else:
                                    cat_data.append(str(val))
                            
                            # Create categorical series
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
            
            # Calculate memory usage after conversion
            memory_after = df_processed.memory_usage(deep=True).sum()
            memory_after_mb = round(memory_after / 1024 / 1024, 2)
            memory_saved_mb = round((memory_before - memory_after) / 1024 / 1024, 2)
            memory_saved_percent = round(((memory_before - memory_after) / memory_before * 100), 2) if memory_before > 0 else 0
            
            # Generate output filename with timestamp
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            name, ext = os.path.splitext(request.filename)
            converted_name = f"converted_{name}_{timestamp}{ext}"
            converted_path = os.path.join(TEMP_DIR, converted_name)
            
            # Save the converted dataset
            if ext.lower() == '.csv':
                df_processed.to_csv(converted_path, index=False, encoding='utf-8-sig')
            elif ext.lower() in ['.xlsx', '.xls']:
                df_processed.to_excel(converted_path, index=False, engine='openpyxl')
            
            # Get updated dtypes
            updated_dtypes = df_processed.dtypes.astype(str).to_dict()
            
            # Get preview data (first 5 rows after conversion)
            preview_data = df_processed.head(5).fillna("").to_dict(orient="records")
            
            return DataTypesConvertResponse(
                message=f"Data type conversions completed successfully",
                conversions_applied=conversions_applied,
                failed_conversions=failed_conversions,
                updated_dtypes=updated_dtypes,
                memory_usage_before=f"{memory_before_mb} MB",
                memory_usage_after=f"{memory_after_mb} MB",
                memory_saved=f"{memory_saved_mb} MB ({memory_saved_percent}%)",
                new_file=converted_name,
                preview_data=preview_data
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error converting data types: {str(e)}")

    @app.post("/api/duplicates/preview")
    async def preview_duplicates(request: DuplicatesPreviewRequest):
        """Preview duplicates in the dataset"""
        try:
            # Load dataset from uploads directory
            file_path = os.path.join(UPLOAD_DIR, request.filename)
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail="File not found")
            
            # Load the dataset
            try:
                if request.filename.lower().endswith('.csv'):
                    # Try different encodings for CSV files
                    for encoding in ['utf-8', 'latin-1', 'cp1252']:
                        try:
                            df = pd.read_csv(file_path, encoding=encoding)
                            break
                        except UnicodeDecodeError:
                            continue
                    else:
                        raise HTTPException(status_code=400, detail="Unable to decode CSV file")
                else:
                    df = pd.read_excel(file_path)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
            
            if df.empty:
                raise HTTPException(status_code=400, detail="Dataset is empty")
            
            # Determine subset columns for duplicate checking
            subset_cols = request.subset if request.subset else df.columns.tolist()
            
            # Validate subset columns exist
            missing_cols = [col for col in subset_cols if col not in df.columns]
            if missing_cols:
                raise HTTPException(status_code=400, detail=f"Columns not found: {missing_cols}")
            
            # Find duplicates
            total_rows = len(df)
            duplicate_mask = df.duplicated(subset=subset_cols, keep=False)
            duplicate_rows = df[duplicate_mask]
            duplicate_count = len(duplicate_rows)
            
            # Calculate duplicate percentage
            duplicate_percentage = (duplicate_count / total_rows * 100) if total_rows > 0 else 0
            
            # Get unique duplicate groups
            unique_duplicate_groups = 0
            if duplicate_count > 0:
                # Group by the subset columns and count groups with more than 1 row
                grouped = df[duplicate_mask].groupby(subset_cols).size()
                unique_duplicate_groups = len(grouped)
            
            # Get sample duplicate records (first 5 duplicate rows)
            sample_duplicates = []
            if duplicate_count > 0:
                sample_df = duplicate_rows.head(5)
                for _, row in sample_df.iterrows():
                    sample_duplicates.append({
                        "row_index": int(row.name),
                        "data": row.to_dict()
                    })
            
            return DuplicatesPreviewResponse(
                total_rows=total_rows,
                total_columns=len(df.columns),
                duplicate_count=duplicate_count,
                duplicate_percentage=round(duplicate_percentage, 2),
                unique_duplicate_groups=unique_duplicate_groups,
                columns_checked=subset_cols,
                preview=sample_duplicates
            )
            
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error analyzing duplicates: {str(e)}")

    @app.post("/api/duplicates/handle")
    async def handle_duplicates(request: DuplicatesHandleRequest):
        """Handle duplicates using selected strategy"""
        try:
            # Load dataset from uploads directory
            file_path = os.path.join(UPLOAD_DIR, request.filename)
            
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail=f"File '{request.filename}' not found")
            
            # Load dataset with proper encoding handling
            _, ext = os.path.splitext(request.filename)
            ext = ext.lower()
            
            if ext == '.csv':
                # Try different encodings for CSV files
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
            
            initial_rows = len(df)
            
            # Determine which columns to check
            if request.subset:
                subset_cols = request.subset
            else:
                # When no subset specified, exclude ID-like columns for better duplicate detection
                all_cols = df.columns.tolist()
                id_like_columns = ['id', 'ID', 'Id', '_id', 'index', 'INDEX', 'Index']
                subset_cols = [col for col in all_cols if col not in id_like_columns]
                
                # If all columns were ID-like (unlikely), fall back to all columns
                if not subset_cols:
                    subset_cols = all_cols
            
            # Verify all subset columns exist
            invalid_cols = [col for col in subset_cols if col not in df.columns]
            if invalid_cols:
                raise HTTPException(status_code=400, detail=f"Invalid columns: {', '.join(invalid_cols)}")
            
            # Create a copy for processing
            df_processed = df.copy()
            
            # Apply the selected action
            if request.action == "find_duplicates":
                # Keep only duplicate rows (all occurrences)
                dup_mask = df_processed.duplicated(subset=subset_cols, keep=False)
                df_processed = df_processed[dup_mask]
                
            elif request.action == "remove_all":
                # Remove all duplicates (no occurrences kept)
                df_processed = df_processed.drop_duplicates(subset=subset_cols, keep=False)
                
            elif request.action == "keep_first":
                # Keep first occurrence, remove rest
                df_processed = df_processed.drop_duplicates(subset=subset_cols, keep='first')
                
            elif request.action == "keep_last":
                # Keep last occurrence, remove rest
                df_processed = df_processed.drop_duplicates(subset=subset_cols, keep='last')
                
            elif request.action == "mark_duplicates":
                # Add a column marking duplicates
                df_processed['is_duplicate'] = df_processed.duplicated(subset=subset_cols, keep=False)
            
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported action: {request.action}")
            
            # Calculate rows affected
            final_rows = len(df_processed)
            duplicates_removed = initial_rows - final_rows
            
            # Generate cleaned filename with timestamp
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            name, ext = os.path.splitext(request.filename)
            
            # Different naming based on action
            if request.action == "find_duplicates":
                cleaned_name = f"duplicates_{name}_{timestamp}{ext}"
            elif request.action == "mark_duplicates":
                cleaned_name = f"marked_{name}_{timestamp}{ext}"
            else:
                cleaned_name = f"deduped_{name}_{timestamp}{ext}"
                
            cleaned_path = os.path.join(TEMP_DIR, cleaned_name)
            
            # Save the processed dataset
            if ext.lower() == '.csv':
                df_processed.to_csv(cleaned_path, index=False, encoding='utf-8-sig')
            elif ext.lower() in ['.xlsx', '.xls']:
                df_processed.to_excel(cleaned_path, index=False, engine='openpyxl')
            
            # Generate appropriate message based on action
            if request.action == "find_duplicates":
                message = f"Found {final_rows} duplicate records"
            elif request.action == "mark_duplicates":
                message = "Duplicates marked successfully"
            elif request.action == "remove_all":
                message = "All duplicate records removed"
            elif request.action == "keep_first":
                message = "Duplicates removed (kept first occurrence)"
            elif request.action == "keep_last":
                message = "Duplicates removed (kept last occurrence)"
            else:
                message = "Duplicates processed successfully"
            
            return DuplicatesHandleResponse(
                message=message,
                rows_before=initial_rows,
                rows_after=final_rows,
                duplicates_removed=initial_rows - final_rows,
                new_file=cleaned_name
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error handling duplicates: {str(e)}")

    # ============================================================================
    # FILE CLEANUP ENDPOINTS
    # ============================================================================

    # ============================================================================
    # STANDARDIZE CATEGORICAL/TEXT DATA - Normalization & Encoding
    # ============================================================================

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

    def _load_dataframe_for_processing(filename: str) -> pd.DataFrame:
        file_path = os.path.join(UPLOAD_DIR, filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found")
        _, ext = os.path.splitext(filename)
        try:
            if ext.lower() == ".csv":
                for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                    try:
                        return pd.read_csv(file_path, encoding=encoding)
                    except UnicodeDecodeError:
                        continue
                raise HTTPException(status_code=400, detail="Could not decode CSV file")
            elif ext.lower() in [".xlsx", ".xls"]:
                return pd.read_excel(file_path, engine="openpyxl")
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    def _select_standardize_columns(df: pd.DataFrame, filters: List[str], settings: StandardizeSettings) -> List[str]:
        cols = df.columns.tolist()
        candidates: List[str] = []
        text_cols = df.select_dtypes(include=["object", "string"]).columns.tolist()
        categorical_cols = [c for c in cols if (pd.api.types.is_categorical_dtype(df[c]) or (c in text_cols and df[c].nunique(dropna=True) <= settings.low_cardinality_threshold))]
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
        # unique preserve order
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

    def _encode_columns(df: pd.DataFrame, cols: List[str], encode: Optional[str], settings: StandardizeSettings) -> (pd.DataFrame, List[str]):
        if not encode or not cols:
            return df, []
        changed: List[str] = []
        if encode == "onehot":
            # If strict error handling, ensure no NaNs in target columns
            if settings.handle_unknown == "error":
                for c in cols:
                    if df[c].isna().any():
                        raise HTTPException(status_code=400, detail=f"Null/unknown values found in column '{c}' with handle_unknown='error'")
            # Include NA as separate column only if requested via handle_unknown=create_new
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
                # Convert to string, fill NaN with explicit placeholder if create_new else empty
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

    @app.post("/api/standardize/preview")
    async def standardize_preview(request: StandardizeRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
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

    @app.post("/api/standardize/apply")
    async def standardize_apply(request: StandardizeRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
            settings = request.settings or StandardizeSettings()
            df_processed, cols, logs, enc = _perform_standardize(df.copy(), request.actions, request.filters or [], settings)
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            name, ext = os.path.splitext(request.filename)
            out_name = f"standardized_{name}_{timestamp}{ext}"
            out_path = os.path.join(TEMP_DIR, out_name)
            if ext.lower() == ".csv":
                df_processed.to_csv(out_path, index=False, encoding="utf-8-sig")
            elif ext.lower() in [".xlsx", ".xls"]:
                df_processed.to_excel(out_path, index=False, engine="openpyxl")
            n = max(1, settings.preview_limit)
            preview = df_processed.head(n).fillna("").to_dict(orient="records")
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

    # ============================================================================
    # HANDLE OUTLIERS - Detection and Processing
    # ============================================================================

    class OutlierSettings(BaseModel):
        method: str = "iqr"  # iqr, zscore, modified_zscore, isolation_forest
        threshold: float = 3.0  # used for zscore/modified_zscore
        action: str = "flag"  # flag, replace, remove
        preview_limit: int = 10
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

    def _select_outlier_columns(df: pd.DataFrame, filters: List[str], settings: OutlierSettings) -> List[str]:
        num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if not filters or "Numeric Columns" in filters:
            candidates = num_cols
        else:
            candidates = []
        if "High Variance" in (filters or []):
            variances = df[num_cols].var(numeric_only=True)
            cutoff = variances.quantile(settings.high_variance_percentile)
            candidates.extend(variances[variances >= cutoff].index.tolist())
        if "Distribution Based" in (filters or []):
            skew = df[num_cols].skew(numeric_only=True)
            candidates.extend(skew[skew.abs() >= settings.skew_threshold].index.tolist())
        # unique preserve order
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
            # Fit per selected columns jointly for multivariate detection
            X = df[cols].fillna(df[cols].median())
            iso = IsolationForest(n_estimators=100, contamination='auto', random_state=42)
            preds = iso.fit_predict(X)  # -1 outlier, 1 inlier
            joint_mask = pd.Series(preds == -1, index=df.index)
            for c in cols:
                masks[c] = joint_mask
        else:
            raise HTTPException(status_code=400, detail=f"Unknown outlier method: {method}")
        return masks

    def _apply_outlier_action(df: pd.DataFrame, masks: Dict[str, pd.Series], cols: List[str], settings: OutlierSettings) -> (pd.DataFrame, int):
        action = (settings.action or "flag").lower()
        # Aggregate any outlier mask
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
            # Cap values within method-specific bounds where mask is true
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
                else:  # isolation_forest
                    # Use winsorization bounds based on quantiles
                    lower = s.quantile(0.01); upper = s.quantile(0.99)
                df.loc[m & (s < lower), c] = lower
                df.loc[m & (s > upper), c] = upper
        elif action == "remove":
            df.drop(index=df.index[any_mask], inplace=True)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
        return df, total_flagged

    @app.post("/api/outliers/preview")
    async def outliers_preview(request: OutlierRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
            settings = request.settings or OutlierSettings()
            if request.method:
                settings.method = request.method
            cols = _select_outlier_columns(df, request.filters or ["Numeric Columns"], settings)
            masks = _detect_outliers_mask(df, cols, settings)
            df_preview = df.copy()
            df_preview, flagged = _apply_outlier_action(df_preview, masks, cols, OutlierSettings(**{**settings.dict(), "action": "flag"})) if settings.action == "flag" else _apply_outlier_action(df_preview, masks, cols, settings)
            n = max(1, settings.preview_limit)
            preview = df_preview.head(n).fillna("").to_dict(orient="records")
            return OutlierResponse(
                message="Outlier preview generated",
                rows_before=len(df),
                rows_after=len(df_preview),
                outliers_flagged=sum(int(m.sum()) for m in masks.values()),
                columns_checked=cols,
                method_used=settings.method,
                action_applied=settings.action,
                new_file=None,
                preview_data=preview,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating outlier preview: {str(e)}")

    @app.post("/api/outliers/apply")
    async def outliers_apply(request: OutlierRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
            settings = request.settings or OutlierSettings()
            if request.method:
                settings.method = request.method
            cols = _select_outlier_columns(df, request.filters or ["Numeric Columns"], settings)
            masks = _detect_outliers_mask(df, cols, settings)
            df_processed = df.copy()
            df_processed, flagged = _apply_outlier_action(df_processed, masks, cols, settings)
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            name, ext = os.path.splitext(request.filename)
            out_name = f"outlier_handled_{name}_{timestamp}{ext}"
            out_path = os.path.join(TEMP_DIR, out_name)
            if ext.lower() == ".csv":
                df_processed.to_csv(out_path, index=False, encoding="utf-8-sig")
            elif ext.lower() in [".xlsx", ".xls"]:
                df_processed.to_excel(out_path, index=False, engine="openpyxl")
            n = max(1, settings.preview_limit)
            preview = df_processed.head(n).fillna("").to_dict(orient="records")
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

    # ============================================================================
    # NORMALIZE / SCALE DATA - Multiple Scaling Techniques
    # ============================================================================

    class NormalizeSettings(BaseModel):
        method: str = "standard"  # standard, minmax, robust, unit_vector, quantile
        feature_range: Optional[List[float]] = None  # for minmax, e.g., [0, 1] or [-1, 1]
        with_mean: bool = True  # center for standard/robust where applicable
        preview_limit: int = 10
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
        # unique preserve order
        unique: List[str] = []
        seen = set()
        for c in candidates:
            if c not in seen and c in num_cols:
                unique.append(c)
                seen.add(c)
        return unique

    def _apply_scaling(df: pd.DataFrame, cols: List[str], settings: NormalizeSettings) -> (pd.DataFrame, List[str]):
        method = (settings.method or "standard").lower()
        if not cols:
            return df, []
        X = df[cols].copy()
        # Keep track of NaNs to restore them after scaling
        nan_mask = X.isna()
        if method == "standard":
            try:
                from sklearn.preprocessing import StandardScaler
                scaler = StandardScaler(with_mean=settings.with_mean)
                # Impute with column medians for scaling, then restore NaNs
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
                # Normalizer works on rows; fill NaNs with 0, then restore
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

    @app.post("/api/normalize/preview")
    async def normalize_preview(request: NormalizeRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
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

    @app.post("/api/normalize/apply")
    async def normalize_apply(request: NormalizeRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
            settings = request.settings or NormalizeSettings()
            cols = _select_normalize_columns(df, request.filters or ["Numeric Columns"], settings)
            df_processed, scaled_cols = _apply_scaling(df.copy(), cols, settings)
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            name, ext = os.path.splitext(request.filename)
            out_name = f"normalized_{name}_{timestamp}{ext}"
            out_path = os.path.join(TEMP_DIR, out_name)
            if ext.lower() == ".csv":
                df_processed.to_csv(out_path, index=False, encoding="utf-8-sig")
            elif ext.lower() in [".xlsx", ".xls"]:
                df_processed.to_excel(out_path, index=False, engine="openpyxl")
            n = max(1, settings.preview_limit)
            preview = df_processed.head(n).fillna("").to_dict(orient="records")
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

    # ============================================================================
    # FEATURE ENGINEERING - Create and transform features
    # ============================================================================

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
        preview_limit: int = 10

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

    def _select_feature_columns(df: pd.DataFrame, filters: List[str], settings: FeatureSettings) -> List[str]:
        cols: List[str] = []
        if not filters:
            filters = []
        if "Numeric Features" in filters or not filters:
            cols.extend(df.select_dtypes(include=[np.number]).columns.tolist())
        if "Date Columns" in filters:
            # attempt to parse potential date columns by dtype or parseability
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
        # unique preserve order
        unique: List[str] = []
        seen = set()
        for c in cols:
            if c not in seen and c in df.columns:
                unique.append(c)
                seen.add(c)
        return unique

    def _fe_polynomial(df: pd.DataFrame, num_cols: List[str], settings: FeatureSettings) -> (pd.DataFrame, List[str]):
        if not num_cols:
            return df, []
        try:
            from sklearn.preprocessing import PolynomialFeatures
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PolynomialFeatures not available: {e}")
        poly = PolynomialFeatures(degree=max(1, settings.degree), include_bias=settings.include_bias, interaction_only=settings.interaction_only)
        X_df = df[num_cols]
        # Impute NaNs with column medians for transformation, and remember rows with any NaN
        row_nan_mask = X_df.isna().any(axis=1)
        X_filled = X_df.fillna(X_df.median(numeric_only=True))
        X_new = poly.fit_transform(X_filled.values)
        names = poly.get_feature_names_out(num_cols)
        # Exclude original terms if needed? We add only new columns beyond originals
        new_df = df.copy()
        new_cols_added: List[str] = []
        # Start from index 0 if include_bias; but we will only add columns not identical to existing
        for idx, name in enumerate(names):
            if name in new_df.columns:
                continue
            # Avoid duplicating original columns
            if name in num_cols:
                continue
            safe_name = name.replace(' ', '').replace('^', '^')
            new_df[safe_name] = X_new[:, idx]
            # Restore NaNs for rows where any original inputs were NaN
            new_df.loc[row_nan_mask, safe_name] = np.nan
            new_cols_added.append(safe_name)
        return new_df, new_cols_added

    def _fe_interaction_only(df: pd.DataFrame, num_cols: List[str], settings: FeatureSettings) -> (pd.DataFrame, List[str]):
        s = FeatureSettings(**{**settings.dict(), 'interaction_only': True, 'include_bias': settings.include_bias, 'degree': max(2, settings.degree)})
        return _fe_polynomial(df, num_cols, s)

    def _fe_binning(df: pd.DataFrame, cols: List[str], settings: FeatureSettings) -> (pd.DataFrame, List[str]):
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
            else:  # equal_width default
                binned = pd.cut(new_df[c], bins=max(1, settings.bins))
            name = f"{c}_bin"
            new_df[name] = binned.astype(str)
            created.append(name)
        return new_df, created

    def _fe_date_parts(df: pd.DataFrame, cols: List[str], settings: FeatureSettings) -> (pd.DataFrame, List[str]):
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

    def _fe_text(df: pd.DataFrame, cols: List[str], settings: FeatureSettings) -> (pd.DataFrame, List[str]):
        new_df = df.copy()
        created: List[str] = []
        opts = settings.text_options or {}
        use_tfidf = bool(opts.get('use_tfidf', False))
        max_features = int(opts.get('max_features', 100))
        # Basic metrics first
        for c in cols:
            if c not in new_df.columns:
                continue
            s = new_df[c].astype(str).fillna("")
            wc = s.str.split().apply(len)
            cl = s.str.len()
            name_wc = f"{c}_WordCount"; name_cl = f"{c}_CharLen"
            new_df[name_wc] = wc; new_df[name_cl] = cl
            created.extend([name_wc, name_cl])
        # Optional TF-IDF on concatenated text columns
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
            except Exception as e:
                # Skip TF-IDF if fails
                pass
        return new_df, created

    def _perform_feature_engineering(df: pd.DataFrame, request: FeatureRequest) -> (pd.DataFrame, List[str]):
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

    @app.post("/api/features/preview")
    async def features_preview(request: FeatureRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
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

    @app.post("/api/features/apply")
    async def features_apply(request: FeatureRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
            df_processed, created = _perform_feature_engineering(df.copy(), request)
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            name, ext = os.path.splitext(request.filename)
            out_name = f"features_{name}_{timestamp}{ext}"
            out_path = os.path.join(TEMP_DIR, out_name)
            if ext.lower() == ".csv":
                df_processed.to_csv(out_path, index=False, encoding="utf-8-sig")
            elif ext.lower() in [".xlsx", ".xls"]:
                df_processed.to_excel(out_path, index=False, engine="openpyxl")
            n = max(1, request.settings.preview_limit if request.settings else 10)
            preview = df_processed.head(n).fillna("").to_dict(orient="records")
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

    # ============================================================================
    # DAX QUERIES GENERATOR
    # ============================================================================

    class DaxSettings(BaseModel):
        min_queries: int = 20
        max_queries: int = 30
        preview_limit: int = 10

    class DaxRequest(BaseModel):
        filename: str
        settings: Optional[DaxSettings] = None

    class DaxItem(BaseModel):
        title: str
        description: str
        dax: str

    class DaxResponse(BaseModel):
        message: str
        count: int
        queries: List[DaxItem]
        new_file: Optional[str] = None

    def _sanitize_table_name(name: str) -> str:
        base = os.path.splitext(os.path.basename(name))[0]
        base = ''.join(ch if ch.isalnum() or ch=='_' else '_' for ch in base)
        return base or 'Table'

    def _profile_dataframe_for_dax(df: pd.DataFrame) -> Dict[str, Any]:
        info: Dict[str, Any] = {
            'numeric': df.select_dtypes(include=[np.number]).columns.tolist(),
            'datetime': [],
            'categorical': df.select_dtypes(include=['object', 'category']).columns.tolist(),
            'all': df.columns.tolist(),
        }
        # Heuristic date detection with safe sampling and suppressed warnings
        import warnings
        from pandas.api.types import is_datetime64_any_dtype, is_object_dtype
        date_name_hints = ("date", "time", "timestamp", "year", "month", "day")
        for c in df.columns:
            s = df[c]
            if is_datetime64_any_dtype(s):
                info['datetime'].append(c)
                continue
            # Only try parsing objects with name hints to avoid noisy parsing
            if is_object_dtype(s) and any(h in c.lower() for h in date_name_hints):
                sample = s.dropna().astype(str).head(200)
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    maybe = pd.to_datetime(sample, errors='coerce')
                ok_ratio = (~maybe.isna()).mean() if len(sample) else 0
                if ok_ratio >= 0.6:
                    info['datetime'].append(c)
        return info

    def _generate_dax_queries(table: str, prof: Dict[str, Any], min_q: int, max_q: int) -> List[DaxItem]:
        items: List[DaxItem] = []
        num = prof['numeric']
        cat = prof['categorical']
        dt = prof['datetime']
        # Measures
        for col in num[:5]:
            items.append(DaxItem(title=f"Total {col}", description=f"Sum of {col}", dax=f"Total {col} = SUM('{table}'[{col}])"))
            items.append(DaxItem(title=f"Average {col}", description=f"Average of {col}", dax=f"Average {col} = AVERAGE('{table}'[{col}])"))
            items.append(DaxItem(title=f"Count {col}", description=f"Count of {col}", dax=f"Count {col} = COUNT('{table}'[{col}])"))
            items.append(DaxItem(title=f"Distinct {col}", description=f"Distinct count of {col}", dax=f"Distinct {col} = DISTINCTCOUNT('{table}'[{col}])"))
        # Calculated Columns
        for col in cat[:3]:
            items.append(DaxItem(title=f"{col} Length", description=f"Length of text in {col}", dax=f"{col} Length = LEN('{table}'[{col}])"))
            items.append(DaxItem(title=f"{col} Upper", description=f"Uppercase of {col}", dax=f"{col} Upper = UPPER('{table}'[{col}])"))
        # Time intelligence if a date exists
        date_col = dt[0] if dt else None
        if date_col:
            items.append(DaxItem(title=f"YTD {date_col}", description="Year-to-date total for first numeric column", dax=f"YTD = TOTALYTD(SUM('{table}'[{num[0]}]), '{table}'[{date_col}])" if num else f"YTD = BLANK()"))
            items.append(DaxItem(title=f"MTD {date_col}", description="Month-to-date total", dax=f"MTD = TOTALMTD(SUM('{table}'[{num[0]}]), '{table}'[{date_col}])" if num else f"MTD = BLANK()"))
            items.append(DaxItem(title=f"QTD {date_col}", description="Quarter-to-date total", dax=f"QTD = TOTALQTD(SUM('{table}'[{num[0]}]), '{table}'[{date_col}])" if num else f"QTD = BLANK()"))
            items.append(DaxItem(title="Same Period Last Year", description="Compare last year same period", dax=f"SPLY = CALCULATE(SUM('{table}'[{num[0]}]), SAMEPERIODLASTYEAR('{table}'[{date_col}]))" if num else f"SPLY = BLANK()"))
            items.append(DaxItem(title="Running Total", description="Cumulative sum over time", dax=f"Running Total = CALCULATE(SUM('{table}'[{num[0]}]), FILTER(ALLSELECTED('{table}'[{date_col}]), '{table}'[{date_col}] <= MAX('{table}'[{date_col}])))" if num else f"Running Total = BLANK()"))
        # Aggregations, percentages, ranking
        if num:
            items.append(DaxItem(title=f"{num[0]} % of Total", description="Contribution to total", dax=f"{num[0]} % of Total = DIVIDE(SUM('{table}'[{num[0]}]), CALCULATE(SUM('{table}'[{num[0]}]), ALL('{table}')))"))
            items.append(DaxItem(title=f"Rank by {num[0]}", description="Ranking based on measure", dax=f"Rank by {num[0]} = RANKX(ALL('{table}'), SUM('{table}'[{num[0]}]),, DESC, Dense)"))
            items.append(DaxItem(title=f"Top 5 by {num[0]}", description="Top 5 records by value", dax=f"Top 5 by {num[0]} = CALCULATETABLE(TOPN(5, ALLSELECTED('{table}'), SUM('{table}'[{num[0]}]), DESC))"))
        # Logical/Conditional examples
        if num and cat:
            items.append(DaxItem(title="High/Low Flag", description="Flag high vs low values", dax=f"High/Low Flag = IF(SUM('{table}'[{num[0]}]) > AVERAGE('{table}'[{num[0]}]), \"High\", \"Low\")"))
        items.append(DaxItem(title="Filter Example", description="Measure filtered by a category", dax=f"Filtered Measure = CALCULATE(SUM('{table}'[{num[0]}]), '{table}'[{cat[0]}] = \"SomeValue\")" if num and cat else "Filtered Measure = BLANK()"))
        items.append(DaxItem(title="Switch Example", description="Bucketize values using SWITCH", dax=f"Bucket = SWITCH(TRUE(), SUM('{table}'[{num[0]}])>1000, \"High\", SUM('{table}'[{num[0]}])>500, \"Medium\", \"Low\")" if num else "Bucket = BLANK()"))
        # Ensure count within bounds
        target = max(min(max_q, 35), min_q)
        if len(items) < min_q:
            # pad with generic counts on columns
            for c in prof['all']:
                items.append(DaxItem(title=f"Count of {c}", description="Generic column count", dax=f"Count of {c} = COUNTROWS(FILTER('{table}', NOT(ISBLANK('{table}'[{c}]))) )"))
                if len(items) >= min_q:
                    break
        return items[:target]

    def _export_dax_report(filename_base: str, items: List[DaxItem]) -> str:
        """Try to export PDF; if reportlab unavailable, export a TXT instead."""
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Try PDF first
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas
            from reportlab.lib.units import cm
            out_name = f"dax_queries_{filename_base}_{timestamp}.pdf"
            out_path = os.path.join(TEMP_DIR, out_name)
            c = canvas.Canvas(out_path, pagesize=A4)
            width, height = A4
            y = height - 2*cm
            c.setFont("Helvetica-Bold", 16)
            c.drawString(2*cm, y, "DAX Queries Report")
            y -= 1*cm
            c.setFont("Helvetica", 10)
            for i, it in enumerate(items, 1):
                block = [f"{i}. {it.title}", it.description, it.dax]
                for line in block:
                    for chunk in [line[j:j+100] for j in range(0, len(line), 100)]:
                        if y < 2*cm:
                            c.showPage(); y = height - 2*cm; c.setFont("Helvetica", 10)
                        c.drawString(2*cm, y, chunk)
                        y -= 0.6*cm
                y -= 0.4*cm
            c.save()
            return out_name
        except Exception:
            # Fallback to TXT export (no external deps)
            out_name = f"dax_queries_{filename_base}_{timestamp}.txt"
            out_path = os.path.join(TEMP_DIR, out_name)
            try:
                with open(out_path, 'w', encoding='utf-8') as f:
                    f.write("DAX Queries Report\n\n")
                    for i, it in enumerate(items, 1):
                        f.write(f"{i}. {it.title}\n")
                        f.write(f"{it.description}\n")
                        f.write(f"{it.dax}\n\n")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to export DAX report: {e}")
            return out_name

    @app.post("/api/dax/generate")
    async def dax_generate(request: DaxRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
            settings = request.settings or DaxSettings()
            table = _sanitize_table_name(request.filename)
            prof = _profile_dataframe_for_dax(df)
            items = _generate_dax_queries(table, prof, settings.min_queries, settings.max_queries)
            pdf_file = _export_dax_report(os.path.splitext(os.path.basename(request.filename))[0], items)
            preview_n = max(1, settings.preview_limit)
            return DaxResponse(
                message="DAX queries generated",
                count=len(items),
                queries=items[:preview_n],
                new_file=pdf_file,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating DAX queries: {str(e)}")

    class DaxMeasuresSettings(BaseModel):
        min_measures: int = 20
        max_measures: int = 100
        preview_limit: int = 20

    class DaxMeasuresRequest(BaseModel):
        filename: str
        settings: Optional[DaxMeasuresSettings] = None

    class DaxMeasuresResponse(BaseModel):
        message: str
        count: int
        measures: List[DaxItem]
        new_file: Optional[str] = None

    def _generate_dax_measures(table: str, prof: Dict[str, Any], settings: DaxMeasuresSettings) -> List[DaxItem]:
        import random
        items: List[DaxItem] = []
        num = prof['numeric']
        cat = prof['categorical']
        dt = prof['datetime']

        # Basic aggregations for first few numeric columns
        for col in num[:8]:
            items.extend([
                DaxItem(title=f"Total {col}", description=f"Sum of {col}", dax=f"Total {col} = SUM('{table}'[{col}])"),
                DaxItem(title=f"Average {col}", description=f"Average of {col}", dax=f"Average {col} = AVERAGE('{table}'[{col}])"),
                DaxItem(title=f"Min {col}", description=f"Minimum of {col}", dax=f"Min {col} = MIN('{table}'[{col}])"),
                DaxItem(title=f"Max {col}", description=f"Maximum of {col}", dax=f"Max {col} = MAX('{table}'[{col}])"),
                DaxItem(title=f"Count {col}", description=f"Count of {col}", dax=f"Count {col} = COUNT('{table}'[{col}])"),
                DaxItem(title=f"Distinct {col}", description=f"Distinct count of {col}", dax=f"Distinct {col} = DISTINCTCOUNT('{table}'[{col}])"),
            ])

        # Time intelligence (use first numeric and date column if present)
        if dt and num:
            d = dt[0]
            m = num[0]
            items.extend([
                DaxItem(title=f"{m} YTD", description="Year-to-date total", dax=f"{m} YTD = TOTALYTD(SUM('{table}'[{m}]), '{table}'[{d}])"),
                DaxItem(title=f"{m} MTD", description="Month-to-date total", dax=f"{m} MTD = TOTALMTD(SUM('{table}'[{m}]), '{table}'[{d}])"),
                DaxItem(title=f"{m} QTD", description="Quarter-to-date total", dax=f"{m} QTD = TOTALQTD(SUM('{table}'[{m}]), '{table}'[{d}])"),
                DaxItem(title=f"{m} YoY Growth %", description="Year-over-year growth percentage", dax=f"{m} YoY Growth % = DIVIDE( (CALCULATE(SUM('{table}'[{m}])) - CALCULATE(SUM('{table}'[{m}]), SAMEPERIODLASTYEAR('{table}'[{d}]))) , CALCULATE(SUM('{table}'[{m}]), SAMEPERIODLASTYEAR('{table}'[{d}])) )"),
                DaxItem(title=f"{m} 3M Rolling Avg", description="3-month rolling average", dax=f"{m} 3M Rolling Avg = AVERAGEX(DATESINPERIOD('{table}'[{d}], MAX('{table}'[{d}]), -3, MONTH), CALCULATE(SUM('{table}'[{m}])))"),
            ])

        # Ratios and percentages (attempt to infer revenue/cost/qty columns)
        name_map = {c.lower(): c for c in prof['all']}
        revenue = next((name_map[k] for k in name_map if 'revenue' in k or 'sales' in k or 'amount' in k), num[0] if num else None)
        cost = next((name_map[k] for k in name_map if 'cost' in k or 'expense' in k), None)
        qty = next((name_map[k] for k in name_map if 'qty' in k or 'quantity' in k or 'units' in k), None)
        if revenue and num:
            items.append(DaxItem(title="Contribution %", description="Measure contribution to total revenue", dax=f"Contribution % = DIVIDE(SUM('{table}'[{revenue}]), CALCULATE(SUM('{table}'[{revenue}]), ALL('{table}')))"))
        if revenue and cost:
            items.append(DaxItem(title="Profit", description="Revenue minus cost", dax=f"Profit = SUM('{table}'[{revenue}]) - SUM('{table}'[{cost}])"))
            items.append(DaxItem(title="Profit Margin %", description="Profit as a percentage of revenue", dax=f"Profit Margin % = DIVIDE([Profit], SUM('{table}'[{revenue}]))"))
        if qty and revenue:
            items.append(DaxItem(title="Avg Price", description="Revenue per unit", dax=f"Avg Price = DIVIDE(SUM('{table}'[{revenue}]), SUM('{table}'[{qty}]))"))

        # Ranking and comparison
        if num:
            measure = revenue or num[0]
            items.append(DaxItem(title=f"Rank by {measure}", description="Rank entities by a measure", dax=f"Rank by {measure} = RANKX(ALL('{table}'), SUM('{table}'[{measure}]),, DESC, Dense)"))
            items.append(DaxItem(title=f"Top 10 by {measure}", description="Top 10 entities by measure", dax=f"Top 10 by {measure} = CALCULATETABLE(TOPN(10, ALL('{table}'), SUM('{table}'[{measure}]), DESC))"))

        # Conditional / logical
        if num:
            base = num[0]
            items.append(DaxItem(title="Above Avg Flag", description="Flag above-average rows", dax=f"Above Avg Flag = IF(SUM('{table}'[{base}]) > AVERAGE('{table}'[{base}]), 1, 0)"))
            if cat:
                items.append(DaxItem(title="Filter by Category Example", description="Filtered measure using CALCULATE/FILTER", dax=f"Filter by Category Example = CALCULATE(SUM('{table}'[{base}]), FILTER(ALL('{table}'), '{table}'[{cat[0]}] = \"SomeValue\"))"))
            items.append(DaxItem(title="Buckets via SWITCH", description="Categorize values with SWITCH(TRUE())", dax=f"Buckets via SWITCH = SWITCH(TRUE(), SUM('{table}'[{base}])>1000, \"High\", SUM('{table}'[{base}])>500, \"Medium\", \"Low\")"))

        # Ensure randomness and target within bounds
        target = max(20, min(100, settings.max_measures))
        target = max(settings.min_measures, target)
        # Randomly decide how many to return within [min, max]
        rand_target = random.randint(settings.min_measures, target)
        # Deduplicate by title and pad with generic measures if needed
        seen = set()
        unique_items: List[DaxItem] = []
        for it in items:
            if it.title not in seen:
                unique_items.append(it)
                seen.add(it.title)
            if len(unique_items) >= rand_target:
                break
        # Pad generically if needed
        i = 0
        while len(unique_items) < rand_target and i < len(num):
            col = num[i]
            candidate = DaxItem(title=f"StdDev {col}", description=f"Standard deviation of {col}", dax=f"StdDev {col} = STDEV.P('{table}'[{col}])")
            if candidate.title not in seen:
                unique_items.append(candidate)
                seen.add(candidate.title)
            i += 1
        return unique_items

    @app.post("/api/dax/measures")
    async def dax_measures(request: DaxMeasuresRequest):
        try:
            df = _load_dataframe_for_processing(request.filename)
            settings = request.settings or DaxMeasuresSettings()
            table = _sanitize_table_name(request.filename)
            prof = _profile_dataframe_for_dax(df)
            items = _generate_dax_measures(table, prof, settings)
            report_file = _export_dax_report(os.path.splitext(os.path.basename(request.filename))[0], items)
            preview_n = max(1, settings.preview_limit)
            return DaxMeasuresResponse(
                message="DAX measures generated",
                count=len(items),
                measures=items[:preview_n],
                new_file=report_file,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating DAX measures: {str(e)}")

    @app.post("/api/cleanup/processed-files")
    def cleanup_processed_files_endpoint():
        """Clean up processed files from uploads directory"""
        try:
            cleanup_processed_files()
            cleanup_old_files()
            return {"message": "Processed files cleaned up successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error during cleanup: {str(e)}")

    @app.get("/api/cleanup/status")
    def cleanup_status():
        """Get status of processed files in directories"""
        try:
            upload_files = len([f for f in os.listdir(UPLOAD_DIR) if os.path.isfile(os.path.join(UPLOAD_DIR, f))])
            temp_files = len([f for f in os.listdir(TEMP_DIR) if os.path.isfile(os.path.join(TEMP_DIR, f))])
            
            return {
                "upload_files": upload_files,
                "temp_files": temp_files,
                "upload_dir": UPLOAD_DIR,
                "temp_dir": TEMP_DIR
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error getting cleanup status: {str(e)}")
