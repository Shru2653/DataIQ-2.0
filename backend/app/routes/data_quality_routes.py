from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import numpy as np

from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir

router = APIRouter()


# ─── Request / Response models ────────────────────────────────────────────────

class DataQualityRequest(BaseModel):
    filename: str


class DataQualityResponse(BaseModel):
    rows: int
    columns: int
    missing_percent: float
    duplicates_percent: float
    completeness_score: float
    outlier_percent: float
    invalid_dates: int
    datatype_issues: int


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _load_dataframe(filename: str, current_user: UserInDB) -> pd.DataFrame:
    """
    Load a dataset from the user's files directory, falling back to the
    cleaned directory so that quality checks can be run on processed files too.
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


def _outlier_percent(df: pd.DataFrame) -> float:
    """
    Calculate the percentage of *rows* that contain at least one outlier
    in any numeric column, using the IQR (Tukey) method.

    A value is an outlier when it falls below  Q1 − 1.5 × IQR
                                             or above  Q3 + 1.5 × IQR.

    Columns with fewer than 4 non-null values, or with IQR == 0, are skipped
    because IQR-based detection is unreliable for such columns.
    """
    numeric_df = df.select_dtypes(include=[np.number])

    if numeric_df.empty or len(df) == 0:
        return 0.0

    # Boolean Series: True for every row that is an outlier in ≥ 1 column
    outlier_mask = pd.Series(False, index=df.index)

    for col in numeric_df.columns:
        series = numeric_df[col].dropna()

        # Need enough data points for a meaningful IQR
        if len(series) < 4:
            continue

        q1  = series.quantile(0.25)
        q3  = series.quantile(0.75)
        iqr = q3 - q1

        # Skip constant columns (IQR == 0) – every value would be flagged
        if iqr == 0:
            continue

        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr

        col_outlier = (numeric_df[col] < lower) | (numeric_df[col] > upper)
        outlier_mask = outlier_mask | col_outlier.fillna(False)

    outlier_row_count = int(outlier_mask.sum())
    return round((outlier_row_count / len(df)) * 100, 2)


def _detect_invalid_dates(df: pd.DataFrame) -> int:
    """
    Detect invalid date values in columns that appear to contain dates.

    Returns the total count of cells with invalid date formats across all
    potential date columns.

    Strategy:
    1. Identify columns that might contain dates (object/string dtype + have date-like keywords or patterns)
    2. Try to parse each value with pd.to_datetime
    3. Count values that fail to parse (excluding already-null values)
    """
    invalid_count = 0

    # Iterate through object/string columns
    for col in df.select_dtypes(include=['object', 'string']).columns:
        series = df[col]

        # Skip if column is entirely null
        if series.isna().all():
            continue

        # Heuristic: check if column name or sample values suggest dates
        col_lower = col.lower()
        has_date_keyword = any(kw in col_lower for kw in ['date', 'time', 'day', 'month', 'year', 'dob', 'birth', 'join', 'created', 'updated'])

        # Sample non-null values to check for date patterns
        sample_values = series.dropna().head(10).astype(str)
        has_date_pattern = False

        for val in sample_values:
            # Simple pattern check: contains dashes/slashes and digits (typical date format)
            if any(sep in val for sep in ['-', '/', '.']) and any(c.isdigit() for c in val):
                has_date_pattern = True
                break

        # Only process if column appears to be date-related
        if not (has_date_keyword or has_date_pattern):
            continue

        # Try parsing each non-null value
        for val in series.dropna():
            try:
                pd.to_datetime(val, errors='raise')
            except (ValueError, TypeError, pd.errors.OutOfBoundsDatetime):
                invalid_count += 1

    return invalid_count


def _detect_datatype_issues(df: pd.DataFrame) -> int:
    """
    Detect columns with mixed data types (e.g., numeric columns containing strings,
    or columns that should be consistent but have type conflicts).

    Returns the count of columns with type inconsistencies.

    Strategy:
    1. For object/string columns: check if they contain a mix of numeric-parseable and non-numeric values
    2. Count columns where >10% of values are numeric-parseable but not all are
    """
    issues_count = 0

    # Check object/string columns for mixed numeric/text content
    for col in df.select_dtypes(include=['object', 'string']).columns:
        series = df[col].dropna()

        if len(series) == 0:
            continue

        # Try to convert to numeric and see how many succeed
        numeric_converted = pd.to_numeric(series, errors='coerce')
        successful_conversions = numeric_converted.notna().sum()
        total_non_null = len(series)

        if total_non_null == 0:
            continue

        conversion_rate = successful_conversions / total_non_null

        # Flag as issue if:
        # - Some values (>10%) can be parsed as numeric but not all (indicating mixed types)
        # - Avoid flagging intentional text columns (conversion_rate < 10%)
        # - Avoid flagging pure numeric columns that are already converted (conversion_rate == 100%)
        if 0.1 < conversion_rate < 0.9:
            issues_count += 1

    return issues_count


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/api/data-quality", response_model=DataQualityResponse)
async def get_data_quality(
    request: DataQualityRequest,
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Analyse a dataset and return eight data-quality metrics:

    1. rows               – total row count
    2. columns            – total column count
    3. missing_percent    – % of all cells that are null / NaN
    4. duplicates_percent – % of ALL duplicate rows (including first occurrence)
    5. completeness_score – inverse of missing_percent (non-null cells / total cells × 100)
    6. outlier_percent    – % of rows containing ≥ 1 IQR-based outlier in any numeric column
    7. invalid_dates      – count of cells with invalid date formats in date-like columns
    8. datatype_issues    – count of columns with mixed numeric/string types
    """
    try:
        df = _load_dataframe(request.filename, current_user)

        total_rows    = len(df)
        total_columns = len(df.columns)

        if total_rows == 0:
            return DataQualityResponse(
                rows=0,
                columns=total_columns,
                missing_percent=0.0,
                duplicates_percent=0.0,
                completeness_score=100.0,
                outlier_percent=0.0,
                invalid_dates=0,
                datatype_issues=0,
            )

        # ── Missing values ─────────────────────────────────────────────────
        total_cells   = total_rows * total_columns
        missing_cells = int(df.isnull().sum().sum())

        missing_percent    = round((missing_cells / total_cells) * 100, 2) if total_cells > 0 else 0.0
        completeness_score = round(((total_cells - missing_cells) / total_cells) * 100, 2) if total_cells > 0 else 100.0

        # ── Duplicate rows ─────────────────────────────────────────────────
        # Exclude ID-like columns from duplicate detection
        all_cols = df.columns.tolist()
        id_like_columns = ['id', 'ID', 'Id', '_id', 'index', 'INDEX', 'Index']
        subset_cols = [col for col in all_cols if col not in id_like_columns]

        # Fallback to all columns if no non-ID columns exist
        if not subset_cols:
            subset_cols = None

        # df.duplicated(keep=False) marks ALL occurrences as True (not just subsequent ones)
        duplicate_rows     = int(df.duplicated(subset=subset_cols, keep=False).sum())
        duplicates_percent = round((duplicate_rows / total_rows) * 100, 2)

        # ── Outliers (IQR) ─────────────────────────────────────────────────
        outlier_pct = _outlier_percent(df)

        # ── Invalid dates ──────────────────────────────────────────────────
        invalid_dates_count = _detect_invalid_dates(df)

        # ── Data type issues ───────────────────────────────────────────────
        datatype_issues_count = _detect_datatype_issues(df)

        return DataQualityResponse(
            rows=total_rows,
            columns=total_columns,
            missing_percent=missing_percent,
            duplicates_percent=duplicates_percent,
            completeness_score=completeness_score,
            outlier_percent=outlier_pct,
            invalid_dates=invalid_dates_count,
            datatype_issues=datatype_issues_count,
        )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error while calculating data-quality metrics: {exc}",
        )
