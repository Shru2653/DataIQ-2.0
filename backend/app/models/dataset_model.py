from datetime import datetime
from typing import Optional, List
from beanie import Document
from pydantic import Field, BaseModel


class CleanedVersion(BaseModel):
    filename: str
    size: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Dataset(Document):
    user_id: str
    filename: str
    size: int = 0
    content_type: Optional[str] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    cleaned_versions: List[CleanedVersion] = Field(default_factory=list)

    class Settings:
        name = "datasets"
