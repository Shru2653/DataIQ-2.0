from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import pandas as pd

from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir
from app.services.dataset_service import add_cleaned_version, resolve_original_filename
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB

router = APIRouter()


class DuplicatesPreviewRequest(BaseModel):
    filename: str
    subset: Optional[List[str]] = None
    preview_limit: int = 100


class DuplicateRecord(BaseModel):
    row_index: int
    data: Dict[str, Any]


class DuplicatesPreviewResponse(BaseModel):
    total_rows: int
    total_columns: int
    duplicate_count: int
    duplicate_percentage: float
    unique_duplicate_groups: int
    columns_checked: List[str]
    preview: List[DuplicateRecord]


class DuplicatesHandleRequest(BaseModel):
    filename: str
    action: str  # find_duplicates, remove_all, keep_first, keep_last, mark_duplicates
    subset: Optional[List[str]] = None


class DuplicatesHandleResponse(BaseModel):
    message: str
    rows_before: int
    rows_after: int
    duplicates_removed: int
    new_file: str


@router.post("/api/duplicates/preview")
async def preview_duplicates(request: DuplicatesPreviewRequest, current_user: UserInDB = Depends(get_current_active_user)):
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
                raise HTTPException(status_code=404, detail="File not found")

        try:
            if file_path.suffix.lower() == '.csv':
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

        subset_cols = request.subset if request.subset else df.columns.tolist()
        missing_cols = [col for col in subset_cols if col not in df.columns]
        if missing_cols:
            raise HTTPException(status_code=400, detail=f"Columns not found: {missing_cols}")

        total_rows = len(df)
        duplicate_mask = df.duplicated(subset=subset_cols, keep=False)
        duplicate_rows = df[duplicate_mask]
        duplicate_count = len(duplicate_rows)
        duplicate_percentage = (duplicate_count / total_rows * 100) if total_rows > 0 else 0

        unique_duplicate_groups = 0
        if duplicate_count > 0:
            grouped = df[duplicate_mask].groupby(subset_cols).size()
            unique_duplicate_groups = len(grouped)

        sample_duplicates: List[DuplicateRecord] = []
        if duplicate_count > 0:
            limit = max(1, int(request.preview_limit)) if request.preview_limit else 100
            sample_df = duplicate_rows.head(limit)
            for _, row in sample_df.iterrows():
                sample_duplicates.append(DuplicateRecord(row_index=int(row.name), data=row.to_dict()))

        return DuplicatesPreviewResponse(
            total_rows=total_rows,
            total_columns=len(df.columns),
            duplicate_count=duplicate_count,
            duplicate_percentage=round(duplicate_percentage, 2),
            unique_duplicate_groups=unique_duplicate_groups,
            columns_checked=subset_cols,
            preview=sample_duplicates,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing duplicates: {str(e)}")


@router.post("/api/duplicates/handle")
async def handle_duplicates(request: DuplicatesHandleRequest, current_user: UserInDB = Depends(get_current_active_user)):
    print(request)
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

        ext = file_path.suffix
        if ext.lower() == '.csv':
            for encoding in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']:
                try:
                    df = pd.read_csv(file_path, encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(status_code=400, detail="Could not decode CSV file")
        elif ext.lower() in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path, engine='openpyxl')
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")

        initial_rows = len(df)

        if request.subset:
            subset_cols = request.subset
        else:
            all_cols = df.columns.tolist()
            id_like_columns = ['id', 'ID', 'Id', '_id', 'index', 'INDEX', 'Index']
            subset_cols = [col for col in all_cols if col not in id_like_columns]
            if not subset_cols:
                subset_cols = all_cols

        invalid_cols = [col for col in subset_cols if col not in df.columns]
        if invalid_cols:
            raise HTTPException(status_code=400, detail=f"Invalid columns: {', '.join(invalid_cols)}")

        df_processed = df.copy()

        if request.action == "find_duplicates":
            dup_mask = df_processed.duplicated(subset=subset_cols, keep=False)
            df_processed = df_processed[dup_mask]
        elif request.action == "remove_all":
            df_processed = df_processed.drop_duplicates(subset=subset_cols, keep=False)
        elif request.action == "keep_first":
            df_processed = df_processed.drop_duplicates(subset=subset_cols, keep='first')
        elif request.action == "keep_last":
            df_processed = df_processed.drop_duplicates(subset=subset_cols, keep='last')
        elif request.action == "mark_duplicates":
            df_processed['is_duplicate'] = df_processed.duplicated(subset=subset_cols, keep=False)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported action: {request.action}")

        final_rows = len(df_processed)

        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Resolve root original to avoid nested prefixes when input is a cleaned file
        root_original = await resolve_original_filename(current_user.id, request.filename)
        base, ext2 = os.path.splitext(root_original)
        if request.action == "find_duplicates":
            cleaned_name = f"duplicates_{base}_{timestamp}{ext2}"
        elif request.action == "mark_duplicates":
            cleaned_name = f"marked_{base}_{timestamp}{ext2}"
        else:
            cleaned_name = f"deduped_{base}_{timestamp}{ext2}"
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(cleaned_dir)
        cleaned_path = cleaned_dir / cleaned_name

        if ext2.lower() == '.csv':
            df_processed.to_csv(cleaned_path, index=False, encoding='utf-8-sig')
        elif ext2.lower() in ['.xlsx', '.xls']:
            df_processed.to_excel(cleaned_path, index=False, engine='openpyxl')

        # Register cleaned version under the root original
        try:
            await add_cleaned_version(current_user.id, root_original, cleaned_name)
        except Exception:
            pass

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
            new_file=cleaned_name,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error handling duplicates: {str(e)}")
