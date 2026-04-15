from datetime import datetime
from typing import Optional, List
from beanie import Document
from pydantic import Field, BaseModel
from enum import Enum


class OperationType(str, Enum):
    """Standard operations applied to datasets"""
    ORIGINAL = "original"
    OUTLIERS_REMOVED = "outliers_removed"
    NORMALIZED = "normalized"
    STANDARDIZED = "standardized"
    ENCODED = "encoded"
    MISSING_VALUES_HANDLED = "missing_values_handled"
    DUPLICATES_REMOVED = "duplicates_removed"
    CLEANED = "cleaned"
    FEATURE_ENGINEERED = "feature_engineered"
    FINAL = "final"
    UNKNOWN = "unknown"


def get_human_readable_name(operation: str) -> str:
    """Convert operation type to human-readable name"""
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


class DatasetVersion(BaseModel):
    """Represents a single version of a dataset"""
    version: int
    operation: str = "unknown"
    filename: str
    size: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    parent_version: Optional[int] = None
    description: Optional[str] = None
    
    @property
    def human_readable_name(self) -> str:
        """Get human-readable operation name"""
        return get_human_readable_name(self.operation)


class CleanedVersion(BaseModel):
    """Legacy model - kept for backward compatibility"""
    filename: str
    size: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Dataset(Document):
    user_id: str
    filename: str
    dataset_name: str = ""  # Extracted/normalized dataset name
    size: int = 0
    content_type: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    cleaned_versions: List[CleanedVersion] = Field(default_factory=list)
    
    # New versioning fields
    versions: List[DatasetVersion] = Field(default_factory=list)
    
    class Settings:
        name = "datasets"
    
    @property
    def latest_version(self) -> Optional[DatasetVersion]:
        """Get the latest version"""
        if not self.versions:
            return None
        return max(self.versions, key=lambda v: v.created_at)
    
    @property
    def version_count(self) -> int:
        """Total number of versions"""
        return len(self.versions)
