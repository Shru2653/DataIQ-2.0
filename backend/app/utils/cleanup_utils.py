import os
import re
import shutil
from pathlib import Path

from app.core.config import UPLOAD_DIR, TEMP_DIR

PROCESSED_PATTERNS = [
    r'^cleaned_.*_\d{8}_\d{6}\.(csv|xlsx|xls)$',
    r'^deduped_.*_\d{8}_\d{6}\.(csv|xlsx|xls)$',
    r'^duplicates_.*_\d{8}_\d{6}\.(csv|xlsx|xls)$',
    r'^marked_.*_\d{8}_\d{6}\.(csv|xlsx|xls)$',
    r'^preview_.*\.(png|jpg|jpeg|gif|bmp|webp)$'
]

def cleanup_processed_files() -> int:
    removed = 0
    for name in os.listdir(UPLOAD_DIR):
        p = UPLOAD_DIR / name
        if p.is_file():
            for pattern in PROCESSED_PATTERNS:
                if re.match(pattern, name, re.IGNORECASE):
                    p.unlink(missing_ok=True)
                    removed += 1
                    break
    return removed

def cleanup_temp_directory() -> None:
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

def cleanup_old_temp_files(max_age_seconds: int = 3600) -> int:
    import time
    now = time.time()
    removed = 0
    for name in os.listdir(TEMP_DIR):
        p = TEMP_DIR / name
        if p.is_file():
            age = now - p.stat().st_ctime
            if age > max_age_seconds:
                p.unlink(missing_ok=True)
                removed += 1
    return removed
