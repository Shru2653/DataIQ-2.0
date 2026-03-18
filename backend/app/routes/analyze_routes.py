from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
import os
from datetime import datetime

from app.services.filter_service import load_dataset_user
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB

router = APIRouter()


class AutoDashboardRequest(BaseModel):
    filename: str


def sanitize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Sanitize dataframe by handling NaN, Inf, and extreme values"""
    # Replace empty strings with NaN
    df = df.replace(r"^\s*$", pd.NA, regex=True)

    # Replace infinity with NaN
    df = df.replace([np.inf, -np.inf], np.nan)

    return df


def safe_numeric_conversion(series: pd.Series) -> pd.Series:
    """Safely convert series to numeric with overflow protection"""
    converted = pd.to_numeric(series, errors='coerce')

    # Cap extreme values to prevent overflow
    max_safe = 1e15
    min_safe = -1e15
    converted = converted.clip(lower=min_safe, upper=max_safe)

    return converted


def make_json_safe(obj):
    """Recursively convert objects to be JSON serializable with allow_nan=False.

    - Replace NaN/Inf with None
    - Convert numpy types to native Python
    - Clamp extreme floats to a safe bound
    """
    max_abs = 1e308  # near JSON float practical limit
    if obj is None:
        return None
    # numpy scalars
    if isinstance(obj, (np.floating,)):
        val = float(obj)
        if not np.isfinite(val):
            return None
        if val > max_abs:
            return max_abs
        if val < -max_abs:
            return -max_abs
        return val
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, float):
        if not np.isfinite(obj):
            return None
        if obj > max_abs:
            return max_abs
        if obj < -max_abs:
            return -max_abs
        return obj
    if isinstance(obj, (list, tuple)):
        return [make_json_safe(x) for x in obj]
    if isinstance(obj, dict):
        return {k: make_json_safe(v) for k, v in obj.items()}
    return obj


def detect_business_kpis(df: pd.DataFrame, numeric_cols: List[str]) -> List[str]:
    """Detect business-relevant KPIs using keyword matching and variance analysis"""

    # Business metric keywords (priority order)
    kpi_keywords = [
        ['sales', 'revenue', 'income', 'profit', 'earning'],
        ['amount', 'total', 'sum', 'value', 'price'],
        ['quantity', 'count', 'volume', 'units'],
        ['cost', 'expense', 'spend'],
        ['margin', 'rate', 'percentage', 'ratio']
    ]

    scored_cols = []

    for col in numeric_cols:
        col_lower = col.lower()
        score = 0

        # Score based on keyword matching
        for idx, keyword_group in enumerate(kpi_keywords):
            for keyword in keyword_group:
                if keyword in col_lower:
                    score += (10 - idx * 2)  # Higher priority keywords get higher scores
                    break

        # Add variance score (high variance = more interesting metric)
        try:
            series = safe_numeric_conversion(df[col])
            if series.notna().sum() > 0:
                variance = series.var(skipna=True)
                if not pd.isna(variance) and variance > 0:
                    score += min(5, np.log10(variance + 1))
        except:
            pass

        scored_cols.append((col, score))

    # Sort by score and return top columns
    scored_cols.sort(key=lambda x: x[1], reverse=True)

    # Return top 4 or all if less than 4
    return [col for col, score in scored_cols[:min(4, len(scored_cols))]]


def calculate_kpis(df: pd.DataFrame, numeric_cols: List[str]) -> List[Dict[str, Any]]:
    """Calculate KPIs with proper type detection and formatting"""

    # Get smart KPI selection
    selected_kpis = detect_business_kpis(df, numeric_cols)

    kpis = []
    for col in selected_kpis:
        series = safe_numeric_conversion(df[col])
        valid_series = series.dropna()

        if len(valid_series) == 0:
            continue

        # Detect metric type
        col_lower = col.lower()
        metric_type = "number"
        if any(k in col_lower for k in ['sales', 'revenue', 'price', 'cost', 'amount', 'profit']):
            metric_type = "currency"
        elif any(k in col_lower for k in ['quantity', 'count', 'units', 'volume']):
            metric_type = "count"
        elif any(k in col_lower for k in ['rate', 'percentage', 'margin', 'percent']):
            metric_type = "percentage"

        # Calculate basic stats with safety checks
        total_val = float(valid_series.sum())
        avg_val = float(valid_series.mean())
        min_val = float(valid_series.min())
        max_val = float(valid_series.max())

        # Calculate trend if we have enough data points
        trend = "stable"
        trend_percent = 0.0
        if len(valid_series) >= 2:
            try:
                first_half = valid_series.iloc[:len(valid_series)//2].mean()
                second_half = valid_series.iloc[len(valid_series)//2:].mean()
                if first_half > 0:
                    trend_percent = ((second_half - first_half) / first_half) * 100
                    if trend_percent > 5:
                        trend = "increasing"
                    elif trend_percent < -5:
                        trend = "decreasing"
            except:
                pass

        kpis.append({
            "key": col,
            "label": col.replace('_', ' ').title(),
            "type": metric_type,
            "total": total_val,
            "avg": avg_val,
            "min": min_val,
            "max": max_val,
            "count": int(len(valid_series)),
            "trend": trend,
            "trend_percent": round(trend_percent, 2)
        })

    return kpis


def calculate_statistics(df: pd.DataFrame, numeric_cols: List[str]) -> Dict[str, Any]:
    """Calculate advanced statistics including correlation and outliers"""

    stats = {}

    # Numeric summary
    if numeric_cols:
        numeric_df = df[numeric_cols].apply(safe_numeric_conversion)
        stats['numeric_summary'] = numeric_df.describe().round(2).to_dict()

        # Correlation matrix (top 5 columns to avoid overwhelming)
        if len(numeric_cols) >= 2:
            top_cols = numeric_cols[:min(5, len(numeric_cols))]
            corr_matrix = numeric_df[top_cols].corr().round(3)
            stats['correlation_matrix'] = corr_matrix.to_dict()

        # Outlier detection using IQR method
        outlier_counts = {}
        for col in numeric_cols:
            series = safe_numeric_conversion(df[col]).dropna()
            if len(series) > 0:
                Q1 = series.quantile(0.25)
                Q3 = series.quantile(0.75)
                IQR = Q3 - Q1
                outliers = ((series < (Q1 - 1.5 * IQR)) | (series > (Q3 + 1.5 * IQR))).sum()
                if outliers > 0:
                    outlier_counts[col] = int(outliers)

        stats['outlier_counts'] = outlier_counts

    return stats


def calculate_data_quality(df: pd.DataFrame) -> Dict[str, Any]:
    """Calculate data quality metrics"""

    total_cells = df.size
    missing_cells = df.isna().sum().sum()
    missing_percent = (missing_cells / total_cells * 100) if total_cells > 0 else 0

    # Find duplicate rows
    duplicate_count = int(df.duplicated().sum())

    # Columns with high missing rates (>20%)
    columns_with_issues = []
    for col in df.columns:
        missing_pct = (df[col].isna().sum() / len(df) * 100) if len(df) > 0 else 0
        if missing_pct > 20:
            columns_with_issues.append({
                "column": col,
                "missing_percent": round(missing_pct, 2)
            })

    return {
        "total_missing_percent": round(missing_percent, 2),
        "duplicate_count": duplicate_count,
        "columns_with_issues": columns_with_issues
    }


def generate_insights(df: pd.DataFrame, kpis: List[Dict], statistics: Dict, data_quality: Dict) -> List[str]:
    """Generate automatic insights from the data"""

    insights = []

    # KPI trend insights
    for kpi in kpis:
        if kpi.get('trend') == 'increasing' and abs(kpi.get('trend_percent', 0)) > 10:
            insights.append(f"{kpi['label']} showing {abs(kpi['trend_percent']):.1f}% growth trend")
        elif kpi.get('trend') == 'decreasing' and abs(kpi.get('trend_percent', 0)) > 10:
            insights.append(f"{kpi['label']} declining by {abs(kpi['trend_percent']):.1f}%")

    # Outlier insights
    if statistics.get('outlier_counts'):
        for col, count in statistics['outlier_counts'].items():
            if count > 0:
                insights.append(f"{count} outliers detected in {col}")

    # Data quality insights
    if data_quality['total_missing_percent'] > 10:
        insights.append(f"Data quality concern: {data_quality['total_missing_percent']:.1f}% missing values")

    if data_quality['duplicate_count'] > 0:
        insights.append(f"{data_quality['duplicate_count']} duplicate records found")

    # Correlation insights
    if statistics.get('correlation_matrix'):
        corr_matrix = statistics['correlation_matrix']
        for col1 in corr_matrix:
            for col2 in corr_matrix[col1]:
                if col1 < col2:  # Avoid duplicates
                    corr_val = corr_matrix[col1][col2]
                    if abs(corr_val) > 0.7 and not pd.isna(corr_val):
                        insights.append(f"Strong correlation ({corr_val:.2f}) between {col1} and {col2}")

    return insights[:10]  # Limit to top 10 insights


def generate_charts(df: pd.DataFrame, numeric_cols: List[str], datetime_cols: List[str],
                    categorical_cols: List[str], primary_measures: List[str]) -> List[Dict[str, Any]]:
    """Generate intelligent chart recommendations"""

    charts = []

    # 1. Time Series Chart (if datetime exists)
    if datetime_cols and primary_measures:
        dcol = datetime_cols[0]
        measure = primary_measures[0]

        s_num = safe_numeric_conversion(df[measure])
        df_ts = df[[dcol]].copy()
        df_ts[measure] = s_num
        df_ts = df_ts.dropna(subset=[dcol])

        try:
            df_ts = df_ts.groupby(pd.Grouper(key=dcol, freq="MS"))[measure].sum().reset_index()

            # Add rolling average for trend
            if len(df_ts) >= 3:
                df_ts['rolling_avg'] = df_ts[measure].rolling(window=3, min_periods=1).mean()

            df_ts[dcol] = df_ts[dcol].dt.strftime("%Y-%m")

            charts.append({
                "type": "line",
                "title": f"{measure.replace('_', ' ').title()} Over Time",
                "xKey": dcol,
                "yKeys": [measure] + (['rolling_avg'] if 'rolling_avg' in df_ts.columns else []),
                "data": df_ts.to_dict(orient="records"),
            })
        except Exception as e:
            pass

    # 2. Category Bar Chart (Top 10)
    if categorical_cols and primary_measures:
        ccol = categorical_cols[0]
        measure = primary_measures[0]

        s_num = safe_numeric_conversion(df[measure])
        grp = (
            pd.DataFrame({ccol: df[ccol], measure: s_num})
            .dropna(subset=[ccol])
            .groupby(ccol, dropna=False)[measure]
            .sum()
            .sort_values(ascending=False)
            .head(10)
            .reset_index()
        )

        charts.append({
            "type": "bar",
            "title": f"Top 10 {ccol.replace('_', ' ').title()} by {measure.replace('_', ' ').title()}",
            "xKey": ccol,
            "yKeys": [measure],
            "data": grp.to_dict(orient="records"),
        })

        # 3. Pie Chart (Top 5 for better readability)
        grp_pie = grp.head(5)
        charts.append({
            "type": "pie",
            "title": f"Distribution by {ccol.replace('_', ' ').title()} (Top 5)",
            "nameKey": ccol,
            "valueKey": measure,
            "data": grp_pie.to_dict(orient="records"),
        })

    # 4. Grouped Bar Chart (Multiple measures)
    if len(primary_measures) >= 2 and categorical_cols:
        ccol = categorical_cols[0]
        measures = primary_measures[:3]

        s_dict = {m: safe_numeric_conversion(df[m]) for m in measures}
        data = pd.DataFrame({ccol: df[ccol]} | s_dict).dropna(subset=[ccol])
        grp = data.groupby(ccol, dropna=False).sum(numeric_only=True).reset_index().head(10)

        charts.append({
            "type": "grouped_bar",
            "title": f"Comparison by {ccol.replace('_', ' ').title()}",
            "xKey": ccol,
            "yKeys": measures,
            "data": grp.to_dict(orient="records"),
        })

    # 5. Histogram for primary measure distribution
    if primary_measures:
        measure = primary_measures[0]
        s_num = safe_numeric_conversion(df[measure]).dropna()

        if len(s_num) > 0:
            hist_data = pd.cut(s_num, bins=20).value_counts().sort_index()
            hist_records = [
                {"range": f"{interval.left:.0f}-{interval.right:.0f}", "count": int(count)}
                for interval, count in hist_data.items()
            ]

            charts.append({
                "type": "histogram",
                "title": f"{measure.replace('_', ' ').title()} Distribution",
                "xKey": "range",
                "yKeys": ["count"],
                "data": hist_records,
            })

    # 6. Scatter plot for correlated variables
    if len(numeric_cols) >= 2:
        # Find most correlated pair
        try:
            numeric_df = df[numeric_cols[:5]].apply(safe_numeric_conversion)
            corr_matrix = numeric_df.corr()

            max_corr = 0
            best_pair = None
            for i, col1 in enumerate(corr_matrix.columns):
                for j, col2 in enumerate(corr_matrix.columns):
                    if i < j:
                        corr_val = abs(corr_matrix.loc[col1, col2])
                        if not pd.isna(corr_val) and corr_val > max_corr:
                            max_corr = corr_val
                            best_pair = (col1, col2)

            if best_pair and max_corr > 0.3:
                col1, col2 = best_pair
                scatter_df = df[[col1, col2]].copy()
                scatter_df[col1] = safe_numeric_conversion(scatter_df[col1])
                scatter_df[col2] = safe_numeric_conversion(scatter_df[col2])
                scatter_df = scatter_df.dropna()

                # Sample for performance
                if len(scatter_df) > 1000:
                    scatter_df = scatter_df.sample(1000, random_state=42)

                charts.append({
                    "type": "scatter",
                    "title": f"{col1} vs {col2} (r={max_corr:.2f})",
                    "xKey": col1,
                    "yKeys": [col2],
                    "data": scatter_df.to_dict(orient="records"),
                })
        except Exception as e:
            pass

    return charts


@router.post("/api/auto-dashboard/analyze")
async def auto_dashboard_analyze(request: AutoDashboardRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        # Load and sanitize data
        df = load_dataset_user(current_user.id, request.filename)
        df = sanitize_dataframe(df)

        # Sample large datasets for performance
        original_rows = len(df)
        if original_rows > 10000:
            df = df.sample(10000, random_state=42)

        # Infer column types
        inferred: Dict[str, Any] = {}
        for col in df.columns:
            s = df[col]
            dtype = str(s.dtype)
            is_num = pd.api.types.is_numeric_dtype(s)
            is_date = pd.api.types.is_datetime64_any_dtype(s)

            # Try to parse as datetime if not already
            if not is_date and not is_num:
                try:
                    parsed = pd.to_datetime(s, errors="coerce")
                    if parsed.notna().sum() > max(int(0.5 * len(s)), 10):
                        df[col] = parsed
                        is_date = True
                        dtype = "datetime64[ns]"
                except Exception:
                    pass

            is_cat = (not is_num) and (not is_date)

            inferred[col] = {
                "dtype": dtype,
                "is_numeric": is_num,
                "is_datetime": is_date,
                "is_categorical": is_cat,
                "missing_percent": float((s.isna().sum() / len(df) * 100.0) if len(df) else 0.0),
            }

        # Categorize columns
        numeric_cols = [c for c in df.columns if inferred[c]["is_numeric"]]
        metric_numeric_cols = [
            c
            for c in numeric_cols
            if not pd.api.types.is_bool_dtype(df[c])
        ]
        datetime_cols = [c for c in df.columns if inferred[c]["is_datetime"]]
        categorical_cols = [c for c in df.columns if inferred[c]["is_categorical"]]

        # Get primary measures (smart KPI detection)
        primary_measures = (
            detect_business_kpis(df, metric_numeric_cols)
            if metric_numeric_cols
            else []
        )

        # Calculate KPIs
        kpis = calculate_kpis(df, metric_numeric_cols)

        # Calculate statistics
        statistics = calculate_statistics(df, metric_numeric_cols)

        # Calculate data quality
        data_quality = calculate_data_quality(df)

        # Generate charts
        charts = generate_charts(
            df,
            metric_numeric_cols,
            datetime_cols,
            categorical_cols,
            primary_measures,
        )

        # Generate insights
        insights = generate_insights(df, kpis, statistics, data_quality)

        # Build schema
        schema = {
            "columns": {c: inferred[c] for c in df.columns},
            "row_count": original_rows,
            "sampled_rows": len(df) if original_rows > 10000 else original_rows,
            "column_count": int(len(df.columns)),
        }

        response = {
            "filename": request.filename,
            "kpis": kpis,
            "charts": charts,
            "statistics": statistics,
            "data_quality": data_quality,
            "insights": insights,
            "schema": schema,
        }
        return make_json_safe(response)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed auto dashboard analysis: {str(e)}")


@router.post("/analyze")
async def analyze_dataset(file: UploadFile = File(...)):
    """Analyze uploaded file for data quality and structure"""
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    name, ext = os.path.splitext(file.filename)
    ext = ext.lower()
    if ext not in {".csv", ".xlsx", ".xls"}:
        raise HTTPException(status_code=400, detail="Invalid file format. Use CSV/XLSX/XLS.")

    try:
        if ext == ".csv":
            df = pd.read_csv(file.file)
        else:
            df = pd.read_excel(file.file, engine="openpyxl")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    df = sanitize_dataframe(df)

    result_columns = {}
    total_missing = int(df.isna().sum().sum())

    for col in df.columns:
        series = df[col]
        missing_count = int(series.isna().sum())
        non_missing_count = int(series.notna().sum())
        missing_percent = float((missing_count / (missing_count + non_missing_count) * 100.0) if (missing_count + non_missing_count) else 0.0)
        dtype = str(series.dtype)
        sample_values = [str(v) for v in series.dropna().astype(str).head(3).tolist()]

        strategies = []
        if dtype.startswith("float") or dtype.startswith("int"):
            strategies = ["mean", "median", "drop"]
        elif dtype.startswith("datetime"):
            strategies = ["ffill", "bfill", "drop"]
        else:
            strategies = ["mode", "custom", "drop"]

        result_columns[col] = {
            "missing_count": missing_count,
            "missing_percent": round(missing_percent, 2),
            "non_missing_count": non_missing_count,
            "dtype": dtype,
            "sample_values": sample_values,
            "suggested_strategies": strategies,
        }

    return {
        "total_missing": total_missing,
        "columns": result_columns,
    }



# from fastapi import APIRouter, UploadFile, File, HTTPException
# from fastapi.responses import JSONResponse
# from pydantic import BaseModel
# from typing import List, Dict, Any, Optional
# import pandas as pd
# import numpy as np

# from app.services.filter_service import load_dataset

# router = APIRouter()


# class AutoDashboardRequest(BaseModel):
#     filename: str


# @router.post("/api/auto-dashboard/analyze")
# async def auto_dashboard_analyze(request: AutoDashboardRequest):
#     try:
#         df = load_dataset(request.filename)
#         df = df.replace(r"^\s*$", pd.NA, regex=True)

#         inferred: Dict[str, Any] = {}
#         for col in df.columns:
#             s = df[col]
#             dtype = str(s.dtype)
#             is_num = pd.api.types.is_numeric_dtype(s)
#             is_date = pd.api.types.is_datetime64_any_dtype(s)
#             if not is_date:
#                 try:
#                     parsed = pd.to_datetime(s, errors="coerce")
#                     if parsed.notna().sum() > max(int(0.5 * len(s)), 10):
#                         df[col] = parsed
#                         is_date = True
#                 except Exception:
#                     pass
#             is_cat = (not is_num) and (not is_date)
#             inferred[col] = {
#                 "dtype": dtype,
#                 "is_numeric": is_num,
#                 "is_datetime": is_date,
#                 "is_categorical": is_cat,
#                 "missing_percent": float((s.isna().sum() / len(df) * 100.0) if len(df) else 0.0),
#             }

#         numeric_cols = [c for c in df.columns if inferred[c]["is_numeric"]]
#         datetime_cols = [c for c in df.columns if inferred[c]["is_datetime"]]
#         categorical_cols = [c for c in df.columns if inferred[c]["is_categorical"]]

#         kpis = []
#         for c in numeric_cols[:4]:
#             series = pd.to_numeric(df[c], errors="coerce")
#             kpis.append({
#                 "key": c,
#                 "total": float(series.sum(skipna=True)) if series.notna().any() else 0.0,
#                 "avg": float(series.mean(skipna=True)) if series.notna().any() else 0.0,
#                 "min": float(series.min(skipna=True)) if series.notna().any() else 0.0,
#                 "max": float(series.max(skipna=True)) if series.notna().any() else 0.0,
#                 "count": int(series.notna().sum()),
#             })

#         charts: List[Dict[str, Any]] = []
#         primary_measure = numeric_cols[0] if numeric_cols else None

#         if datetime_cols and primary_measure is not None:
#             dcol = datetime_cols[0]
#             s_num = pd.to_numeric(df[primary_measure], errors="coerce")
#             df_ts = df[[dcol]].copy()
#             df_ts[primary_measure] = s_num
#             df_ts = df_ts.dropna(subset=[dcol])
#             try:
#                 df_ts = df_ts.groupby(pd.Grouper(key=dcol, freq="MS"))[primary_measure].sum().reset_index()
#                 df_ts[dcol] = df_ts[dcol].dt.strftime("%Y-%m")
#                 charts.append({
#                     "type": "line",
#                     "title": f"{primary_measure} over time",
#                     "xKey": dcol,
#                     "yKeys": [primary_measure],
#                     "data": df_ts.to_dict(orient="records"),
#                 })
#             except Exception:
#                 pass

#         if categorical_cols and primary_measure is not None:
#             ccol = categorical_cols[0]
#             s_num = pd.to_numeric(df[primary_measure], errors="coerce")
#             grp = (
#                 pd.DataFrame({ccol: df[ccol], primary_measure: s_num})
#                 .dropna(subset=[ccol])
#                 .groupby(ccol, dropna=False)[primary_measure]
#                 .sum()
#                 .sort_values(ascending=False)
#                 .head(10)
#                 .reset_index()
#             )
#             charts.append({
#                 "type": "bar",
#                 "title": f"{primary_measure} by {ccol}",
#                 "xKey": ccol,
#                 "yKeys": [primary_measure],
#                 "data": grp.to_dict(orient="records"),
#             })
#             charts.append({
#                 "type": "pie",
#                 "title": f"Share by {ccol}",
#                 "nameKey": ccol,
#                 "valueKey": primary_measure,
#                 "data": grp.to_dict(orient="records"),
#             })

#         if len(numeric_cols) >= 2 and categorical_cols:
#             ccol = categorical_cols[0]
#             s_dict = {m: pd.to_numeric(df[m], errors="coerce") for m in numeric_cols[:3]}
#             data = pd.DataFrame({ccol: df[ccol]} | s_dict).dropna(subset=[ccol])
#             grp = data.groupby(ccol, dropna=False).sum(numeric_only=True).reset_index().head(10)
#             charts.append({
#                 "type": "grouped_bar",
#                 "title": f"Measures by {ccol}",
#                 "xKey": ccol,
#                 "yKeys": numeric_cols[:3],
#                 "data": grp.to_dict(orient="records"),
#             })

#         schema = {
#             "columns": {c: inferred[c] for c in df.columns},
#             "row_count": int(len(df)),
#             "column_count": int(len(df.columns)),
#         }

#         return {
#             "filename": request.filename,
#             "kpis": kpis,
#             "charts": charts,
#             "schema": schema,
#         }
#     except HTTPException:
#         raise
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Failed auto dashboard analysis: {str(e)}")


# @router.post("/analyze")
# async def analyze_dataset(file: UploadFile = File(...)):
#     if not file or not file.filename:
#         raise HTTPException(status_code=400, detail="No file provided")

#     name, ext = os.path.splitext(file.filename)
#     ext = ext.lower()
#     if ext not in {".csv", ".xlsx", ".xls"}:
#         raise HTTPException(status_code=400, detail="Invalid file format. Use CSV/XLSX/XLS.")

#     try:
#         if ext == ".csv":
#             df = pd.read_csv(file.file)
#         else:
#             df = pd.read_excel(file.file, engine="openpyxl")
#     except Exception as e:
#         raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

#     df = df.replace(r"^\s*$", pd.NA, regex=True)

#     result_columns = {}
#     total_missing = int(df.isna().sum().sum())

#     for col in df.columns:
#         series = df[col]
#         missing_count = int(series.isna().sum())
#         non_missing_count = int(series.notna().sum())
#         missing_percent = float((missing_count / (missing_count + non_missing_count) * 100.0) if (missing_count + non_missing_count) else 0.0)
#         dtype = str(series.dtype)
#         sample_values = [str(v) for v in series.dropna().astype(str).head(3).tolist()]
#         strategies = []
#         if dtype.startswith("float") or dtype.startswith("int"):
#             strategies = ["mean", "median", "drop"]
#         elif dtype.startswith("datetime"):
#             strategies = ["ffill", "bfill", "drop"]
#         else:
#             strategies = ["mode", "custom", "drop"]

#         result_columns[col] = {
#             "missing_count": missing_count,
#             "missing_percent": round(missing_percent, 2),
#             "non_missing_count": non_missing_count,
#             "dtype": dtype,
#             "sample_values": sample_values,
#             "suggested_strategies": strategies,
#         }

#     return {
#         "total_missing": total_missing,
#         "columns": result_columns,
#     }
