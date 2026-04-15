from fastapi import APIRouter, HTTPException, Depends
import os

from app.core.config import UPLOAD_DIR, TEMP_DIR
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB

router = APIRouter()


@router.post("/cleanup/processed-files")
def cleanup_processed_files_endpoint(current_user: UserInDB = Depends(get_current_active_user)):
    try:
        # Only remove preview/temp artifacts in this user's cleaned dir that match a safe prefix
        uclean = user_cleaned_dir(current_user.id)
        ensure_dir(uclean)
        removed = []
        safe_prefixes = ("preview_",)
        for name in os.listdir(uclean):
            if name.startswith(safe_prefixes):
                path = uclean / name
                try:
                    if path.is_file():
                        os.remove(path)
                        removed.append(name)
                except Exception:
                    continue
        return {"message": "User cleaned previews removed", "removed": removed}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during cleanup: {str(e)}")


@router.get("/cleanup/status")
def cleanup_status(current_user: UserInDB = Depends(get_current_active_user)):
    try:
        ufiles = user_files_dir(current_user.id)
        uclean = user_cleaned_dir(current_user.id)
        ensure_dir(ufiles); ensure_dir(uclean)
        upload_files = len([f for f in os.listdir(ufiles) if (ufiles / f).is_file()])
        temp_files = len([f for f in os.listdir(uclean) if (uclean / f).is_file()])
        return {
            "upload_files": upload_files,
            "temp_files": temp_files,
            "upload_dir": str(ufiles),
            "temp_dir": str(uclean),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting cleanup status: {str(e)}")
