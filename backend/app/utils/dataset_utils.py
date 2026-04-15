"""
Dataset Versioning Utilities

Functions for parsing filenames, extracting dataset information,
and grouping files by dataset.
"""

import re
from typing import Dict, Tuple, Optional, List
from datetime import datetime
from app.models.dataset_model import OperationType, DatasetVersion


def extract_dataset_info(filename: str) -> Tuple[str, str, Optional[str]]:
    """
    Extract dataset name and operation from filename.
    
    Examples:
        outlier_handled_test_outliers_data_20260406_204307.csv
        → dataset_name = "test_outliers_data"
        → operation = "outliers_removed"
        → timestamp = "20260406_204307"
    
    Args:
        filename: The original filename (without directory)
    
    Returns:
        (dataset_name, operation, timestamp_str)
    """
    if not filename:
        return "", OperationType.UNKNOWN.value, None
    
    # Remove extension
    name_without_ext = filename.rsplit(".", 1)[0]
    
    # Pattern: [operation_prefix]_[dataset_name]_[timestamp]
    # or just: [dataset_name]
    
    # Try to extract timestamp (yyyymmdd_hhmmss or yyyymmdd_hhmm format)
    timestamp_pattern = r"(\d{8}_\d{4,6})$"
    timestamp_match = re.search(timestamp_pattern, name_without_ext)
    timestamp_str = None
    
    if timestamp_match:
        timestamp_str = timestamp_match.group(1)
        without_timestamp = name_without_ext[: timestamp_match.start()].rstrip("_")
    else:
        without_timestamp = name_without_ext
    
    # Known operation prefixes
    operation_prefixes = {
        "outlier_handled": OperationType.OUTLIERS_REMOVED.value,
        "outliers_removed": OperationType.OUTLIERS_REMOVED.value,
        "normalized": OperationType.NORMALIZED.value,
        "standardized": OperationType.STANDARDIZED.value,
        "encoded": OperationType.ENCODED.value,
        "missing_handled": OperationType.MISSING_VALUES_HANDLED.value,
        "duplicates_removed": OperationType.DUPLICATES_REMOVED.value,
        "cleaned": OperationType.CLEANED.value,
        "feature_engineered": OperationType.FEATURE_ENGINEERED.value,
    }
    
    operation = OperationType.UNKNOWN.value
    dataset_name = without_timestamp
    
    # Try to match operation prefix
    for prefix, op in operation_prefixes.items():
        if without_timestamp.startswith(prefix):
            operation = op
            # Remove prefix from dataset name
            dataset_name = without_timestamp[len(prefix):].lstrip("_")
            break
    
    # Clean up dataset name (remove extra underscores, normalize)
    dataset_name = re.sub(r"_+", "_", dataset_name).strip("_").lower()
    
    # If no dataset name, use original
    if not dataset_name:
        dataset_name = name_without_ext.lower()
    
    return dataset_name, operation, timestamp_str


def parse_timestamp(timestamp_str: Optional[str]) -> datetime:
    """
    Parse timestamp string to datetime.
    
    Formats supported:
        20260406_204307 → 2026-04-06 20:43:07
        20260406_2043 → 2026-04-06 20:43:00
    """
    if not timestamp_str:
        return datetime.utcnow()
    
    try:
        # Format: yyyymmdd_hhmmss or yyyymmdd_hhmm
        parts = timestamp_str.split("_")
        if len(parts) != 2:
            return datetime.utcnow()
        
        date_part, time_part = parts
        
        # Pad time part if necessary
        if len(time_part) == 4:
            time_part += "00"
        elif len(time_part) != 6:
            return datetime.utcnow()
        
        datetime_str = f"{date_part}{time_part}"
        return datetime.strptime(datetime_str, "%Y%m%d%H%M%S")
    except Exception:
        return datetime.utcnow()


def infer_operation_from_filename(filename: str) -> str:
    """
    Infer the operation type from filename.
    If no clear operation is detected, returns ORIGINAL.
    """
    _, operation, _ = extract_dataset_info(filename)
    return operation if operation != OperationType.UNKNOWN.value else OperationType.ORIGINAL.value


def create_version_from_file(
    filename: str,
    file_size: int,
    parent_version: Optional[int] = None,
    file_modification_time: Optional[datetime] = None,
) -> DatasetVersion:
    """
    Create a DatasetVersion object from a file.
    
    Args:
        filename: The file name
        file_size: Size in bytes
        parent_version: Version number of parent (if applicable)
        file_modification_time: File's modification timestamp
    
    Returns:
        DatasetVersion object
    """
    dataset_name, operation, timestamp_str = extract_dataset_info(filename)
    
    if file_modification_time is None:
        created_at = parse_timestamp(timestamp_str)
    else:
        created_at = file_modification_time
    
    # If still unknown operation, mark as original
    if operation == OperationType.UNKNOWN.value:
        operation = OperationType.ORIGINAL.value
    
    return DatasetVersion(
        version=1,  # Will be set by grouping logic
        operation=operation,
        filename=filename,
        size=file_size,
        created_at=created_at,
        parent_version=parent_version,
        description=None,
    )


def group_files_by_dataset(files: List[Dict]) -> Dict[str, List[DatasetVersion]]:
    """
    Group files by dataset name.
    
    Args:
        files: List of file dictionaries with 'filename', 'size', 'uploaded_at'
    
    Returns:
        Dictionary mapping dataset_name → list of DatasetVersion objects
    """
    grouped: Dict[str, List[DatasetVersion]] = {}
    
    for file_dict in files:
        filename = file_dict.get("filename", "")
        dataset_name, _, _ = extract_dataset_info(filename)
        
        if not dataset_name:
            continue
        
        if dataset_name not in grouped:
            grouped[dataset_name] = []
        
        version = create_version_from_file(
            filename=filename,
            file_size=file_dict.get("size", 0),
            file_modification_time=file_dict.get("uploaded_at"),
        )
        grouped[dataset_name].append(version)
    
    # Sort by timestamp and assign version numbers
    for dataset_name, versions in grouped.items():
        versions.sort(key=lambda v: v.created_at)
        for idx, version in enumerate(versions, start=1):
            version.version = idx
            # Set parent version for subsequent versions
            if idx > 1:
                version.parent_version = idx - 1
    
    return grouped


def format_operation_name(operation: str) -> str:
    """Convert operation code to human-readable name"""
    mapping = {
        "original": "Original Dataset",
        "outliers_removed": "Outliers Removed",
        "normalized": "Normalized",
        "standardized": "Standardized",
        "encoded": "Encoded",
        "missing_values_handled": "Missing Values Handled",
        "duplicates_removed": "Duplicates Removed",
        "cleaned": "Cleaned Data",
        "feature_engineered": "Feature Engineered",
        "final": "Final Dataset",
    }
    return mapping.get(operation, operation.replace("_", " ").title())


def build_version_description(operation: str, parent_version: Optional[int] = None) -> str:
    """Build a description for a version"""
    desc = f"Applied {format_operation_name(operation).lower()}"
    if parent_version:
        desc += f" to v{parent_version}"
    return desc
