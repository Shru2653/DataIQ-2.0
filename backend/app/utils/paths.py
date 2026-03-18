from pathlib import Path
from app.core.config import UPLOAD_DIR

FILES_SUBDIR = "files"
CLEANED_SUBDIR = "cleaned"


def get_user_root_dir(user_id: str) -> Path:
    return (UPLOAD_DIR / str(user_id)).resolve()


def user_files_dir(user_id: str) -> Path:
    return get_user_root_dir(user_id) / FILES_SUBDIR


def user_cleaned_dir(user_id: str) -> Path:
    return get_user_root_dir(user_id) / CLEANED_SUBDIR


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
