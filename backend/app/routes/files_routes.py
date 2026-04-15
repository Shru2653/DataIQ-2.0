from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse
import os
import shutil
import pandas as pd
from datetime import datetime

from app.core.config import UPLOAD_DIR, TEMP_DIR
from app.core.database import get_db
from app.services.dataset_service import register_upload
from app.services.file_service import ALLOWED_IMAGE_EXTENSIONS, ALLOWED_DOC_EXTENSIONS
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import ensure_dir, user_files_dir, user_cleaned_dir
import shutil as _shutil
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}


def _validate_filename(filename: str) -> None:
    _, ext = os.path.splitext(filename)
    allowed = ALLOWED_IMAGE_EXTENSIONS.union(ALLOWED_DOC_EXTENSIONS)
    if ext.lower() not in allowed:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' is not allowed.")


@router.post("/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    current_user: UserInDB = Depends(get_current_active_user),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    saved = []
    ufiles = user_files_dir(current_user.id)
    ensure_dir(ufiles)
    for f in files:
        _validate_filename(f.filename)
        dest_path = ufiles / f.filename

        base, ext = os.path.splitext(f.filename)
        counter = 1
        while dest_path.exists():
            new_name = f"{base}_{counter}{ext}"
            dest_path = ufiles / new_name
            counter += 1
        final_name = dest_path.name

        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)

        saved.append({
            "filename": final_name,
            "url": f"/api/files/files/{final_name}",
        })
        # Register in Dataset collection
        try:
            await register_upload(current_user.id, final_name, size=dest_path.stat().st_size, content_type=f.content_type)
        except Exception as e:
            logger.exception("register_upload failed; falling back to direct Motor upsert")
            # Fallback: direct upsert via Motor to ensure datasets list is populated
            db = get_db()
            await db["datasets"].update_one(
                {"user_id": current_user.id, "filename": final_name},
                {"$set": {
                    "user_id": current_user.id,
                    "filename": final_name,
                    "size": int(dest_path.stat().st_size),
                    "content_type": f.content_type,
                    "uploaded_at": datetime.utcnow(),
                }, "$setOnInsert": {"cleaned_versions": []}},
                upsert=True,
            )

    return {"uploaded": saved}


@router.get("/files")
def list_files(current_user: UserInDB = Depends(get_current_active_user)):
    files = []
    ufiles = user_files_dir(current_user.id)
    ensure_dir(ufiles)
    for name in os.listdir(ufiles):
        path = ufiles / name
        if path.is_file():
            files.append({
                "filename": name,
                "url": f"/api/files/files/{name}",
                "size": path.stat().st_size,
                "mtime": path.stat().st_mtime,
            })
    return {"files": files}


@router.get("/cleaned-files")
def list_cleaned_files(original: str | None = None, current_user: UserInDB = Depends(get_current_active_user)):
    """List cleaned/processed files stored in TEMP_DIR.

    Attempts to infer the original filename based on common naming patterns like
    "converted_<name>_YYYYmmdd_HHMMSS.ext" and returns metadata to help the UI
    group versions.
    """
    items: list[dict] = []
    uclean = user_cleaned_dir(current_user.id)
    ensure_dir(uclean)
    for name in os.listdir(uclean):
        path = uclean / name
        if not path.is_file():
            continue

        base, ext = os.path.splitext(name)
        inferred_original = None
        # Patterns like: <prefix>_<orig>_<timestamp>
        parts = base.split("_")
        if len(parts) >= 3:
            # take everything between first and last as original base
            inferred_original = "_".join(parts[1:-1]) + ext

        # Allow explicit filtering by original
        if original and inferred_original and inferred_original != original:
            continue

        stat = path.stat()
        items.append({
            "filename": name,
            "url": f"/api/files/cleaned/{name}",
            "size": stat.st_size,
            "mtime": stat.st_mtime,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "original": inferred_original,
        })

    # Sort newest first
    items.sort(key=lambda x: x.get("mtime", 0), reverse=True)
    return {"files": items}


@router.get("/raw-datasets")
def list_raw_datasets(current_user: UserInDB = Depends(get_current_active_user)):
    """List original uploaded (raw) datasets from the user's files directory."""
    files = []
    ufiles = user_files_dir(current_user.id)
    ensure_dir(ufiles)
    for name in os.listdir(ufiles):
        path = ufiles / name
        if path.is_file():
            files.append({
                "filename": name,
                "size": path.stat().st_size,
                "mtime": path.stat().st_mtime,
            })
    files.sort(key=lambda x: x.get("mtime", 0), reverse=True)
    return {"files": files}


@router.get("/cleaned-datasets")
def list_cleaned_datasets(current_user: UserInDB = Depends(get_current_active_user)):
    """List cleaned / processed datasets from the user's cleaned directory."""
    files = []
    uclean = user_cleaned_dir(current_user.id)
    ensure_dir(uclean)
    for name in os.listdir(uclean):
        path = uclean / name
        if path.is_file():
            files.append({
                "filename": name,
                "size": path.stat().st_size,
                "mtime": path.stat().st_mtime,
            })
    files.sort(key=lambda x: x.get("mtime", 0), reverse=True)
    return {"files": files}


@router.get("/datasets")
async def list_datasets(current_user: UserInDB = Depends(get_current_active_user)):
    from app.models.dataset_model import Dataset
    try:
        col = Dataset.get_motor_collection()
        raw = await col.find({"user_id": current_user.id, "filename": {"$exists": True}}).to_list(length=None)
        items = []
        for doc in raw:
            fname = doc.get("filename")
            if not fname:
                continue
            cleaned = doc.get("cleaned_versions") or []
            # Ensure cleaned list has filename/size/created_at keys
            norm_cleaned = []
            for cv in cleaned:
                if isinstance(cv, dict):
                    norm_cleaned.append({
                        "filename": cv.get("filename"),
                        "size": int(cv.get("size", 0) or 0),
                        "created_at": cv.get("created_at"),
                    })
                else:
                    # fallback
                    norm_cleaned.append({"filename": str(cv), "size": 0, "created_at": None})
            items.append({
                "filename": fname,
                "size": int(doc.get("size", 0) or 0),
                "content_type": doc.get("content_type"),
                "uploaded_at": doc.get("uploaded_at"),
                "cleaned_versions": norm_cleaned,
            })
        return {"datasets": items}
    except Exception as e:
        # As a last resort, return empty instead of 500 to keep UI functional
        logger.exception("list_datasets failed; returning empty list to keep UI functional")
        return {"datasets": []}


@router.post("/preview")
async def preview_file(file: UploadFile = File(...)):
    _validate_filename(file.filename)

    _, ext = os.path.splitext(file.filename)
    ext = ext.lower()

    if ext in {".csv", ".xlsx", ".xls"}:
        try:
            if ext == ".csv":
                df = pd.read_csv(file.file, nrows=10)
            else:
                df = pd.read_excel(file.file, engine="openpyxl", nrows=10)
            preview_rows = df.fillna("").to_dict(orient="records")
            columns = list(df.columns)
            return JSONResponse({
                "kind": "table",
                "columns": columns,
                "rows": preview_rows,
                "filename": file.filename,
            })
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    if ext in ALLOWED_IMAGE_EXTENSIONS:
        temp_name = f"preview_{file.filename}"
        dest_path = UPLOAD_DIR / temp_name
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"kind": "image", "url": f"/uploads/{temp_name}", "filename": file.filename}

    if ext == ".pdf":
        return {"kind": "pdf", "filename": file.filename, "note": "PDF preview not parsed; file accepted."}

    raise HTTPException(status_code=400, detail="Unsupported file type")


@router.get("/files/{kind}/{filename}")
def secure_download(kind: str, filename: str, current_user: UserInDB = Depends(get_current_active_user)):
    if kind not in {"files", "cleaned"}:
        raise HTTPException(status_code=400, detail="Invalid kind")
    base = user_files_dir(current_user.id) if kind == "files" else user_cleaned_dir(current_user.id)
    path = (base / filename).resolve()
    # Prevent path traversal outside of base
    if not str(path).startswith(str(base.resolve())):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@router.post("/admin/backfill-legacy")
async def backfill_legacy(user_migrate: dict, current_user: UserInDB = Depends(get_current_active_user)):
    """Assign legacy Dataset docs without user_id to current user and optionally migrate files.

    Body example:
    { "migrate_files": true }
    """
    migrate_files = bool(user_migrate.get("migrate_files", False))
    from app.models.dataset_model import Dataset
    col = Dataset.get_motor_collection()

    # Find legacy docs missing user_id
    legacy = await col.find({"user_id": {"$exists": False}}).to_list(length=None)
    updated = 0
    moved_originals = 0
    moved_cleaned = 0

    ufiles = user_files_dir(current_user.id)
    uclean = user_cleaned_dir(current_user.id)
    ensure_dir(ufiles)
    ensure_dir(uclean)

    for doc in legacy:
        fname = doc.get("filename")
        cleaned = doc.get("cleaned_versions") or []
        # Update user_id
        await col.update_one({"_id": doc["_id"]}, {"$set": {"user_id": current_user.id}})
        updated += 1

        if not migrate_files:
            continue

        # Move original if present in legacy folder
        if fname:
            src = (UPLOAD_DIR / fname)
            dst = (ufiles / fname)
            if src.exists() and src.is_file():
                try:
                    if not dst.exists():
                        _shutil.move(str(src), str(dst))
                        moved_originals += 1
                except Exception:
                    pass

        # Move cleaned versions
        for cv in cleaned:
            cfile = cv.get("filename") if isinstance(cv, dict) else str(cv)
            if not cfile:
                continue
            src_c = (TEMP_DIR / cfile)
            dst_c = (uclean / cfile)
            if src_c.exists() and src_c.is_file():
                try:
                    if not dst_c.exists():
                        _shutil.move(str(src_c), str(dst_c))
                        moved_cleaned += 1
                except Exception:
                    pass

    return {
        "updated_docs": updated,
        "moved_originals": moved_originals,
        "moved_cleaned": moved_cleaned,
    }
