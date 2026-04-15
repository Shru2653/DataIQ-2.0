"""
Dataset Versioning Routes

API endpoints for retrieving datasets organized by version history.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime

from app.models.user_model import UserInDB
from app.utils.dataset_utils import (
    group_files_by_dataset,
    format_operation_name,
    extract_dataset_info,
)
from app.utils.auth_utils import get_current_active_user
from app.utils.paths import ensure_dir, user_cleaned_dir, user_files_dir

router = APIRouter(prefix="/api/dataset-versions", tags=["Dataset Versioning"])


class DatasetVersionInfo:
    """Helper class for dataset version information"""
    def __init__(self, dataset_name: str, version: int, operation: str, 
                 filename: str, file_size: int, created_at: datetime, 
                 parent_version: int = None):
        self.dataset_name = dataset_name
        self.version = version
        self.operation = operation
        self.filename = filename
        self.file_size = file_size
        self.created_at = created_at
        self.parent_version = parent_version
        self.human_readable_name = format_operation_name(operation)
    
    def to_dict(self):
        return {
            "dataset_name": self.dataset_name,
            "version": self.version,
            "operation": self.operation,
            "human_readable_name": self.human_readable_name,
            "filename": self.filename,
            "file_size": self.file_size,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "parent_version": self.parent_version,
        }


def list_upload_files_with_metadata(current_user: UserInDB) -> List[dict]:
    """List the current user's raw and cleaned dataset files with metadata."""
    files = []
    allowed_suffixes = {".csv", ".xlsx", ".xls"}

    for folder in (user_files_dir(current_user.id), user_cleaned_dir(current_user.id)):
        ensure_dir(folder)
        for file_path in folder.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in allowed_suffixes:
                stat = file_path.stat()
                files.append({
                    "filename": file_path.name,
                    "size": stat.st_size,
                    "uploaded_at": datetime.fromtimestamp(stat.st_mtime),
                })
    return files


@router.get("/grouped")
async def get_datasets_grouped(current_user: UserInDB = Depends(get_current_active_user)):
    """
    Get all datasets grouped by name with version history.
    
    Returns:
    {
        "datasets": [
            {
                "dataset_name": "test_outliers_data",
                "created_at": "...",
                "updated_at": "...",
                "version_count": 3,
                "latest_version": {...},
                "versions": [...]
            }
        ]
    }
    """
    files = list_upload_files_with_metadata(current_user)
    
    if not files:
        return {
            "datasets": [],
            "total_count": 0,
        }
    
    # Group files by dataset
    grouped = group_files_by_dataset(files)
    
    datasets = []
    for dataset_name, versions in grouped.items():
        if not versions:
            continue
        
        dataset_dict = {
            "dataset_name": dataset_name,
            "version_count": len(versions),
            "created_at": versions[0].created_at.isoformat(),
            "updated_at": versions[-1].created_at.isoformat(),
            "latest_version": {
                "version": versions[-1].version,
                "operation": versions[-1].operation,
                "human_readable_name": format_operation_name(versions[-1].operation),
                "created_at": versions[-1].created_at.isoformat(),
                "filename": versions[-1].filename,
                "file_size": versions[-1].size,
            },
            "versions": [
                {
                    "version": v.version,
                    "operation": v.operation,
                    "human_readable_name": format_operation_name(v.operation),
                    "filename": v.filename,
                    "file_size": v.size,
                    "created_at": v.created_at.isoformat(),
                    "parent_version": v.parent_version,
                }
                for v in versions
            ],
        }
        datasets.append(dataset_dict)
    
    # Sort by most recently updated
    datasets.sort(key=lambda d: d["updated_at"], reverse=True)
    
    return {
        "datasets": datasets,
        "total_count": len(datasets),
    }


@router.get("/{dataset_name}")
async def get_dataset(
    dataset_name: str,
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Get a specific dataset with all its versions.
    
    Args:
        dataset_name: Name of the dataset
    
    Returns:
        Dataset with all versions
    """
    files = list_upload_files_with_metadata(current_user)
    grouped = group_files_by_dataset(files)
    
    if dataset_name not in grouped:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{dataset_name}' not found",
        )
    
    versions = grouped[dataset_name]
    
    dataset_dict = {
        "dataset_name": dataset_name,
        "version_count": len(versions),
        "created_at": versions[0].created_at.isoformat(),
        "updated_at": versions[-1].created_at.isoformat(),
        "versions": [
            {
                "version": v.version,
                "operation": v.operation,
                "human_readable_name": format_operation_name(v.operation),
                "filename": v.filename,
                "file_size": v.size,
                "created_at": v.created_at.isoformat(),
                "parent_version": v.parent_version,
            }
            for v in versions
        ],
    }
    
    return {"dataset": dataset_dict}


@router.get("/{dataset_name}/latest")
async def get_latest_version(
    dataset_name: str,
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Get the latest version of a dataset.
    
    Args:
        dataset_name: Name of the dataset
    
    Returns:
        Latest version information
    """
    files = list_upload_files_with_metadata(current_user)
    grouped = group_files_by_dataset(files)
    
    if dataset_name not in grouped:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{dataset_name}' not found",
        )
    
    versions = grouped[dataset_name]
    latest = versions[-1]
    
    return {
        "version": {
            "version": latest.version,
            "operation": latest.operation,
            "human_readable_name": format_operation_name(latest.operation),
            "filename": latest.filename,
            "file_size": latest.size,
            "created_at": latest.created_at.isoformat(),
            "parent_version": latest.parent_version,
        }
    }
