from __future__ import annotations
from pathlib import Path
from typing import Optional
from datetime import datetime
from beanie import PydanticObjectId

from app.models.dataset_model import Dataset, CleanedVersion
from app.core.database import get_db
from app.utils.paths import user_files_dir, user_cleaned_dir


async def register_upload(user_id: str, filename: str, size: int = 0, content_type: Optional[str] = None) -> Dataset:
    ds = await Dataset.find_one((Dataset.user_id == user_id) & (Dataset.filename == filename))
    if ds:
        # Update size/content_type on re-upload (keeps cleaned history)
        ds.size = size or ds.size
        if content_type:
            ds.content_type = content_type
        await ds.save()
        return ds
    ds = Dataset(user_id=user_id, filename=filename, size=size or 0, content_type=content_type)
    await ds.insert()
    return ds


async def resolve_original_filename(user_id: str, name: str) -> str:
    try:
        db = get_db()
        doc = await db["datasets"].find_one({
            "user_id": user_id,
            "$or": [
                {"filename": name},
                {"cleaned_versions.filename": name},
            ],
        })
        if doc and doc.get("filename"):
            return doc["filename"]
    except Exception:
        pass
    return name


async def add_cleaned_version(user_id: str, original_filename: str, cleaned_filename: str) -> Optional[Dataset]:
    # Step 0: resolve the root original if caller passed a cleaned file name
    try:
        db = get_db()
        doc = await db["datasets"].find_one({
            "user_id": user_id,
            "$or": [
                {"filename": original_filename},
                {"cleaned_versions.filename": original_filename},
            ],
        })
        if doc and doc.get("filename"):
            original_filename = doc["filename"]
    except Exception:
        # best-effort; continue with provided original_filename
        pass

    try:
        ds = await Dataset.find_one((Dataset.user_id == user_id) & (Dataset.filename == original_filename))
        if not ds:
            # Fallback: auto-register the original if missing
            orig_path = user_files_dir(user_id) / original_filename
            size = orig_path.stat().st_size if orig_path.exists() else 0
            ds = Dataset(user_id=user_id, filename=original_filename, size=size)
            await ds.insert()
            # ds.cleaned_versions will be [] thanks to default_factory

        # Defensive check in case the field is null in an old document
        if ds.cleaned_versions is None:
            ds.cleaned_versions = []

        # Determine cleaned file size
        cpath = user_cleaned_dir(user_id) / cleaned_filename
        size = cpath.stat().st_size if cpath.exists() else 0
        ds.cleaned_versions.append(CleanedVersion(filename=cleaned_filename, size=size, created_at=datetime.utcnow()))
        
        await ds.save() # This is the preferred, type-safe way
        return ds
        
    except Exception as e:
        # Log the Beanie error to see why it failed
        print(f"Beanie save failed (error: {e}). Using motor fallback.")
        try:
            db = get_db()
            cpath = user_cleaned_dir(user_id) / cleaned_filename
            size = cpath.stat().st_size if cpath.exists() else 0

            # --- START: REVISED MOTOR FALLBACK ---
            
            # Step 1: Ensure the document exists with an empty array if new
            await db["datasets"].update_one(
                {"user_id": user_id, "filename": original_filename},
                {
                    "$setOnInsert": {
                        "user_id": user_id,
                        "filename": original_filename,
                        "size": (user_files_dir(user_id) / original_filename).stat().st_size if (user_files_dir(user_id) / original_filename).exists() else 0,
                        "uploaded_at": datetime.utcnow(),
                        "content_type": None,
                        "cleaned_versions": [], # Set to empty array ONLY on insert
                    },
                },
                upsert=True,
            )

            # Step 2: Now that the doc is guaranteed to exist, push the new item
            await db["datasets"].update_one(
                {"user_id": user_id, "filename": original_filename},
                {
                    "$push": {
                        "cleaned_versions": {
                            "filename": cleaned_filename,
                            "size": int(size),
                            "created_at": datetime.utcnow(),
                        }
                    }
                }
                # No upsert=True here, we know it exists from Step 1
            )
            # --- END: REVISED MOTOR FALLBACK ---

        except Exception as motor_e:
            # If this fails, something is very wrong
            print(f"CRITICAL: Motor fallback for add_cleaned_version FAILED: {motor_e}")
            pass
        return None
