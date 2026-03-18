"""
Drift Detection Routes

Exposes POST /api/drift-analysis which compares two user-owned datasets
and returns schema changes + numeric distribution drift results.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd

from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir
from app.services.drift_detection import run_drift_analysis

router = APIRouter()


# ─── Request / Response models ────────────────────────────────────────────────

class DriftAnalysisRequest(BaseModel):
    previous_filename: str
    current_filename: str


class TypeChange(BaseModel):
    column: str
    previous_type: str
    current_type: str


class SchemaChanges(BaseModel):
    new_columns: List[str]
    removed_columns: List[str]
    type_changes: List[TypeChange]


class DriftResult(BaseModel):
    column: str
    drift_score: float
    p_value: float
    status: str  # "stable" | "warning" | "drift_detected"


class DriftSummary(BaseModel):
    total_columns_checked: int
    drifted_columns: int
    warning_columns: int
    stable_columns: int
    schema_changes_count: int


class DriftAnalysisResponse(BaseModel):
    previous_filename: str
    current_filename: str
    schema_changes: SchemaChanges
    drift_results: List[DriftResult]
    summary: DriftSummary


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _load_dataframe(filename: str, current_user: UserInDB) -> pd.DataFrame:
    """
    Load a dataset from the user's files directory, falling back to the
    cleaned directory.  Tries multiple encodings for CSV files.
    """
    files_dir   = user_files_dir(current_user.id)
    cleaned_dir = user_cleaned_dir(current_user.id)
    ensure_dir(files_dir)
    ensure_dir(cleaned_dir)

    file_path = files_dir / filename
    if not file_path.exists():
        alt = cleaned_dir / filename
        if alt.exists():
            file_path = alt
        else:
            raise HTTPException(
                status_code=404,
                detail=f"File '{filename}' not found in uploaded or cleaned directories.",
            )

    ext = file_path.suffix.lower()
    try:
        if ext == ".csv":
            for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                try:
                    return pd.read_csv(file_path, encoding=encoding, low_memory=False)
                except UnicodeDecodeError:
                    continue
            raise HTTPException(
                status_code=400,
                detail="Could not decode CSV file with any supported encoding.",
            )

        elif ext in {".xlsx", ".xls"}:
            return pd.read_excel(file_path, engine="openpyxl")

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format '{ext}'. Only CSV and Excel files are supported.",
            )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {exc}")


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/api/drift-analysis", response_model=DriftAnalysisResponse)
async def analyze_drift(
    request: DriftAnalysisRequest,
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Compare two datasets and detect data drift and schema changes.

    Detects
    -------
    1. New columns   – present in *current* but not in *previous*
    2. Removed columns – present in *previous* but not in *current*
    3. Type changes  – shared columns whose pandas dtype changed
    4. Distribution drift – Kolmogorov-Smirnov two-sample test on all numeric
       columns shared by both datasets

    Drift status per column
    -----------------------
    stable         p_value >= 0.05                          (no significant drift)
    warning        p_value <  0.05 AND ks_statistic <  0.3 (moderate drift)
    drift_detected p_value <  0.05 AND ks_statistic >= 0.3 (high drift)
    """
    if request.previous_filename == request.current_filename:
        raise HTTPException(
            status_code=400,
            detail="previous_filename and current_filename must be different files.",
        )

    try:
        df_prev = _load_dataframe(request.previous_filename, current_user)
        df_curr = _load_dataframe(request.current_filename, current_user)

        if len(df_prev) == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Previous dataset '{request.previous_filename}' is empty.",
            )
        if len(df_curr) == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Current dataset '{request.current_filename}' is empty.",
            )

        results = run_drift_analysis(df_prev, df_curr)

        schema = results["schema_changes"]
        return DriftAnalysisResponse(
            previous_filename=request.previous_filename,
            current_filename=request.current_filename,
            schema_changes=SchemaChanges(
                new_columns=schema["new_columns"],
                removed_columns=schema["removed_columns"],
                type_changes=[TypeChange(**tc) for tc in schema["type_changes"]],
            ),
            drift_results=[DriftResult(**r) for r in results["drift_results"]],
            summary=DriftSummary(**results["summary"]),
        )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error during drift analysis: {exc}",
        )
