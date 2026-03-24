from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uuid
import io
import os
import pandas as pd

from app.services.chatbot_service import (
    process_query,
    save_uploaded_file,
    get_or_load_session,
    export_csv,
    UPLOAD_FOLDER,
    _sessions,
)

router = APIRouter()


# ── Request / Response Models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    filename: str | None = None
    query: str


class UploadResponse(BaseModel):
    session_id: str
    filename: str
    rows: int
    columns: int
    column_names: list[str]
    message: str


class ChatResponse(BaseModel):
    response: str
    chart: str | None = None
    type: str
    download_filename: str | None = None


# ── POST /upload ──────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a CSV or Excel file for the chatbot to analyse.
    Returns a session_id that must be passed to every /chat call.
    """
    allowed = (".csv", ".xlsx", ".xls")
    if not file.filename.lower().endswith(allowed):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(allowed)}",
        )

    session_id = str(uuid.uuid4())
    safe_name  = f"chatbot_{session_id[:8]}_{file.filename}"
    content    = await file.read()

    # Save to disk
    path = save_uploaded_file(content, safe_name)

    # Parse into DataFrame
    try:
        df = pd.read_excel(path) if safe_name.endswith((".xlsx", ".xls")) else pd.read_csv(path)
    except Exception as e:
        os.remove(path)
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    # Register session
    _sessions[session_id] = {
        "df":          df,
        "original_df": df.copy(),
        "filename":    safe_name,
        "last_column": None,
    }

    return UploadResponse(
        session_id   = session_id,
        filename     = safe_name,
        rows         = len(df),
        columns      = len(df.columns),
        column_names = df.columns.tolist(),
        message      = (
            f"✅ '{file.filename}' uploaded successfully — "
            f"{len(df):,} rows, {len(df.columns)} columns."
        ),
    )


# ── POST /chat ────────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Send a natural-language query about the loaded dataset.
    Supports text responses, base64 chart images, and download triggers.
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty.")

    result = process_query(
        session_id = req.session_id,
        filename   = req.filename,
        query      = req.query.strip(),
    )

    return ChatResponse(
        response          = result.get("response", ""),
        chart             = result.get("chart"),
        type              = result.get("type", "text"),
        download_filename = result.get("download_filename"),
    )


# ── GET /download ─────────────────────────────────────────────────────────────

@router.get("/download/{session_id}")
async def download_csv(session_id: str):
    """
    Stream the current (possibly cleaned) dataset as a CSV file download.
    """
    csv_bytes, msg = export_csv(session_id)

    if csv_bytes is None:
        raise HTTPException(status_code=404, detail=msg)

    sess     = _sessions.get(session_id, {})
    raw_name = sess.get("filename", "dataset.csv")
    # Strip the chatbot_ prefix and UUID fragment for a cleaner download name
    clean_name = raw_name
    if clean_name.startswith("chatbot_"):
        # "chatbot_<8chars>_original.csv" → "original_cleaned.csv"
        parts = clean_name.split("_", 2)
        clean_name = parts[2] if len(parts) == 3 else raw_name
    base, _ = os.path.splitext(clean_name)
    download_filename = f"{base}_cleaned.csv"

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type = "text/csv",
        headers    = {
            "Content-Disposition": f'attachment; filename="{download_filename}"',
            "Content-Length":      str(len(csv_bytes)),
        },
    )
