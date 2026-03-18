from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd

from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir
from app.services.cleaning_recommendations import generate_recommendations, get_recommendation_summary

router = APIRouter()


# ─── Request / Response models ────────────────────────────────────────────────

class CleaningRecommendationsRequest(BaseModel):
    filename: str


class RecommendationItem(BaseModel):
    issue: str
    severity: str
    recommendation: str
    column: str | None = None
    affected_rows: int | None = None
    action_type: str | None = None


class CleaningRecommendationsResponse(BaseModel):
    recommendations: List[RecommendationItem]
    summary: Dict[str, int]


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _load_dataframe(filename: str, current_user: UserInDB) -> pd.DataFrame:
    """
    Load a dataset from the user's files directory, falling back to the
    cleaned directory so that recommendations can be generated for processed files too.
    Tries multiple encodings for CSV files.
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
            raise HTTPException(status_code=400, detail="Could not decode CSV file with any supported encoding.")

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

@router.post("/api/cleaning-recommendations", response_model=CleaningRecommendationsResponse)
async def get_cleaning_recommendations(
    request: CleaningRecommendationsRequest,
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Analyze a dataset and generate actionable cleaning recommendations.

    Detects the following data quality issues:
    1. Missing values (with fill strategies based on data type)
    2. Duplicate rows (excluding ID columns)
    3. Invalid date formats in date-like columns
    4. Columns with high null percentage (>50%)
    5. Mixed data types (numeric/text) in columns

    Returns:
        List of recommendations sorted by severity (high -> medium -> low)
        Each recommendation includes:
        - issue: description of the problem
        - severity: high/medium/low
        - recommendation: suggested fix
        - column: affected column name (if applicable)
        - affected_rows: number of rows impacted
        - action_type: category of action (fill_missing, remove_duplicates, etc.)
    """
    try:
        df = _load_dataframe(request.filename, current_user)

        if len(df) == 0:
            return CleaningRecommendationsResponse(
                recommendations=[],
                summary={"total": 0, "high": 0, "medium": 0, "low": 0}
            )

        # Generate all recommendations
        recommendations = generate_recommendations(df)

        # Create summary
        summary = get_recommendation_summary(recommendations)

        # Convert to response model
        recommendation_items = [
            RecommendationItem(
                issue=rec["issue"],
                severity=rec["severity"],
                recommendation=rec["recommendation"],
                column=rec.get("column"),
                affected_rows=rec.get("affected_rows"),
                action_type=rec.get("action_type")
            )
            for rec in recommendations
        ]

        return CleaningRecommendationsResponse(
            recommendations=recommendation_items,
            summary=summary
        )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error while generating cleaning recommendations: {exc}",
        )
