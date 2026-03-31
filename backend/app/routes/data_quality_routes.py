from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
import numpy as np

from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir

router = APIRouter()


# ─── Request / Response models ────────────────────────────────────────────────

class DataQualityRequest(BaseModel):
    filename: str


# ✅ NEW: Individual risk issue
class RiskIssue(BaseModel):
    issue: str
    value: str
    severity: str          # "high" | "medium" | "low"
    suggestion: str
    detail: Optional[str] = None


# ✅ UPDATED: Original 8 fields kept exactly — 3 new risk fields appended
class DataQualityResponse(BaseModel):
    # Original 8 fields (UNCHANGED)
    rows: int
    columns: int
    missing_percent: float
    duplicates_percent: float
    completeness_score: float
    outlier_percent: float
    invalid_dates: int
    datatype_issues: int
    # New risk-aware fields
    risk_issues: List[RiskIssue] = []
    risk_score: int = 100
    risk_summary: str = ""


# ─── Internal helpers (ALL ORIGINAL — completely unchanged) ───────────────────

def _load_dataframe(filename: str, current_user: UserInDB) -> pd.DataFrame:
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
    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.empty or len(df) == 0:
        return 0.0
    outlier_mask = pd.Series(False, index=df.index)
    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if len(series) < 4:
            continue
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr     = q3 - q1
        if iqr == 0:
            continue
        col_outlier  = (numeric_df[col] < q1 - 1.5 * iqr) | (numeric_df[col] > q3 + 1.5 * iqr)
        outlier_mask = outlier_mask | col_outlier.fillna(False)
    return round((int(outlier_mask.sum()) / len(df)) * 100, 2)


def _detect_invalid_dates(df: pd.DataFrame) -> int:
    invalid_count = 0
    for col in df.select_dtypes(include=['object', 'string']).columns:
        series = df[col]
        if series.isna().all():
            continue
        col_lower        = col.lower()
        has_date_keyword = any(kw in col_lower for kw in [
            'date','time','day','month','year','dob','birth','join','created','updated'])
        sample_values    = series.dropna().head(10).astype(str)
        has_date_pattern = any(
            any(sep in v for sep in ['-','/','.']) and any(c.isdigit() for c in v)
            for v in sample_values
        )
        if not (has_date_keyword or has_date_pattern):
            continue
        for val in series.dropna():
            try:
                pd.to_datetime(val, errors='raise')
            except (ValueError, TypeError, pd.errors.OutOfBoundsDatetime):
                invalid_count += 1
    return invalid_count


def _detect_datatype_issues(df: pd.DataFrame) -> int:
    issues_count = 0
    for col in df.select_dtypes(include=['object', 'string']).columns:
        series = df[col].dropna()
        if len(series) == 0:
            continue
        numeric_converted = pd.to_numeric(series, errors='coerce')
        conversion_rate   = numeric_converted.notna().sum() / len(series)
        if 0.1 < conversion_rate < 0.9:
            issues_count += 1
    return issues_count


# ─── NEW: Risk helpers ────────────────────────────────────────────────────────

def _build_risk_issues(
    df: pd.DataFrame,
    missing_percent: float,
    duplicates_percent: float,
    outlier_pct: float,
    invalid_dates_count: int,
    datatype_issues_count: int,
) -> List[RiskIssue]:
    """Derive RiskIssue list from already-computed metrics — no extra file I/O."""
    issues: List[RiskIssue] = []

    # 1. Missing values
    if missing_percent > 0:
        missing_cols = df.columns[df.isnull().any()].tolist()
        col_hint     = ", ".join(missing_cols[:4])
        if len(missing_cols) > 4:
            col_hint += f" +{len(missing_cols)-4} more"
        severity = "high" if missing_percent > 30 else "medium" if missing_percent > 10 else "low"
        issues.append(RiskIssue(
            issue      = "Missing Values",
            value      = f"{missing_percent:.1f}%",
            severity   = severity,
            suggestion = "Fill using mean/median for numeric columns, mode for categorical, or drop rows with >50% missing.",
            detail     = f"Affected columns: {col_hint}" if col_hint else None,
        ))

    # 2. Duplicates
    if duplicates_percent > 0:
        dup_count = int(df.duplicated(keep=False).sum())
        severity  = "high" if duplicates_percent > 20 else "medium"
        issues.append(RiskIssue(
            issue      = "Duplicate Rows",
            value      = f"{dup_count:,} rows ({duplicates_percent:.1f}%)",
            severity   = severity,
            suggestion = "Remove duplicates with df.drop_duplicates(). Choose keep='first' or keep='last'.",
        ))

    # 3. Categorical imbalance
    imbalanced = []
    for col in df.select_dtypes(include=["object", "category"]).columns:
        vc      = df[col].value_counts(normalize=True)
        max_pct = float(vc.iloc[0]) * 100 if len(vc) > 0 else 0
        if max_pct > 80 and df[col].nunique() > 1:
            imbalanced.append((col, max_pct))
    if imbalanced:
        worst_col, worst_pct = max(imbalanced, key=lambda x: x[1])
        issues.append(RiskIssue(
            issue      = "Class Imbalance",
            value      = f"{worst_pct:.0f}% dominant in '{worst_col}'",
            severity   = "high" if worst_pct > 90 else "medium",
            suggestion = "Use SMOTE, oversampling, or undersampling to balance classes before ML training.",
            detail     = "Imbalanced: " + ", ".join(c for c, _ in imbalanced[:3]),
        ))

    # 4. Outliers
    if outlier_pct > 0:
        issues.append(RiskIssue(
            issue      = "Outliers Detected",
            value      = f"{outlier_pct:.1f}% of rows",
            severity   = "medium" if outlier_pct > 15 else "low",
            suggestion = "Cap outliers using IQR clipping, or apply log/robust normalization before modeling.",
        ))

    # 5. Invalid dates
    if invalid_dates_count > 0:
        issues.append(RiskIssue(
            issue      = "Invalid Dates",
            value      = f"{invalid_dates_count} cell(s)",
            severity   = "medium" if invalid_dates_count > 5 else "low",
            suggestion = "Standardise date formats using pd.to_datetime() with dayfirst/yearfirst flags.",
        ))

    # 6. Data type issues
    if datatype_issues_count > 0:
        issues.append(RiskIssue(
            issue      = "Mixed Data Types",
            value      = f"{datatype_issues_count} column(s)",
            severity   = "medium" if datatype_issues_count > 2 else "low",
            suggestion = "Cast columns to their intended type with pd.to_numeric() or astype().",
        ))

    return issues


_SEVERITY_PENALTY = {"high": 30, "medium": 15, "low": 5}

def _compute_risk_score(issues: List[RiskIssue]) -> int:
    return max(0, 100 - sum(_SEVERITY_PENALTY.get(i.severity, 0) for i in issues))


def _risk_summary(issues: List[RiskIssue]) -> str:
    high_n   = sum(1 for i in issues if i.severity == "high")
    medium_n = sum(1 for i in issues if i.severity == "medium")
    if not issues:
        return "✅ No issues detected. Dataset is clean and ready for analysis."
    if high_n:
        return f"🚨 {high_n} high-risk issue(s) detected. Immediate attention required before modeling."
    if medium_n:
        return f"⚠️ {medium_n} medium-risk issue(s) found. Review recommended before modeling."
    return f"ℹ️ {len(issues)} minor issue(s) found. Dataset is mostly clean."


# ─── Endpoint (same URL /api/data-quality — response extended) ───────────────

@router.post("/api/data-quality", response_model=DataQualityResponse)
async def get_data_quality(
    request: DataQualityRequest,
    current_user: UserInDB = Depends(get_current_active_user),
):
    try:
        df = _load_dataframe(request.filename, current_user)

        total_rows    = len(df)
        total_columns = len(df.columns)

        if total_rows == 0:
            return DataQualityResponse(
                rows=0, columns=total_columns,
                missing_percent=0.0, duplicates_percent=0.0,
                completeness_score=100.0, outlier_percent=0.0,
                invalid_dates=0, datatype_issues=0,
                risk_issues=[], risk_score=100,
                risk_summary="✅ File is empty — no issues to report.",
            )

        # ── Original metric computation (100% unchanged) ──────────────────
        total_cells        = total_rows * total_columns
        missing_cells      = int(df.isnull().sum().sum())
        missing_percent    = round((missing_cells / total_cells) * 100, 2) if total_cells else 0.0
        completeness_score = round(((total_cells - missing_cells) / total_cells) * 100, 2) if total_cells else 100.0

        id_like_cols       = ['id','ID','Id','_id','index','INDEX','Index']
        subset_cols        = [c for c in df.columns if c not in id_like_cols] or None
        duplicate_rows     = int(df.duplicated(subset=subset_cols, keep=False).sum())
        duplicates_percent = round((duplicate_rows / total_rows) * 100, 2)

        outlier_pct           = _outlier_percent(df)
        invalid_dates_count   = _detect_invalid_dates(df)
        datatype_issues_count = _detect_datatype_issues(df)

        # ── New risk analysis (reuses values — zero extra computation) ─────
        risk_issues  = _build_risk_issues(
            df, missing_percent, duplicates_percent,
            outlier_pct, invalid_dates_count, datatype_issues_count,
        )
        risk_score   = _compute_risk_score(risk_issues)
        risk_summary = _risk_summary(risk_issues)

        return DataQualityResponse(
            rows=total_rows, columns=total_columns,
            missing_percent=missing_percent,
            duplicates_percent=duplicates_percent,
            completeness_score=completeness_score,
            outlier_percent=outlier_pct,
            invalid_dates=invalid_dates_count,
            datatype_issues=datatype_issues_count,
            risk_issues=risk_issues,
            risk_score=risk_score,
            risk_summary=risk_summary,
        )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error while calculating data-quality metrics: {exc}",
        )