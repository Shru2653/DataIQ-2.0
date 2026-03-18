from pathlib import Path
from typing import Iterable
import shutil

from app.core.config import BASE_DIR, UPLOAD_DIR, TEMP_DIR

# Ensure directories exist on import
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"}
ALLOWED_DOC_EXTENSIONS = {".csv", ".xlsx", ".xls", ".pdf"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS.union(ALLOWED_DOC_EXTENSIONS)

def validate_filename(filename: str) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type '{suffix}' is not allowed.")

def save_upload(fileobj, dest_path: Path) -> None:
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(fileobj, buffer)

def list_upload_files() -> list[dict]:
    files: list[dict] = []
    for p in UPLOAD_DIR.iterdir():
        if p.is_file():
            files.append({
                "filename": p.name,
                "url": f"/uploads/{p.name}",
                "size": p.stat().st_size,
            })
    return files
