"""
dashboard_routes.py
Endpoints:
  POST /api/dashboard/auto        — main dashboard
  POST /api/dashboard/compare     — compare two datasets
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.user_model import UserInDB
from app.utils.auth_utils import get_current_active_user
from app.utils.paths import ensure_dir, user_cleaned_dir, user_files_dir

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────

class DashboardRequest(BaseModel):
    filename: str

class CompareRequest(BaseModel):
    filename_a: str
    filename_b: str

class ColumnMeta(BaseModel):
    dtype: str
    is_numeric: bool
    is_datetime: bool
    is_categorical: bool
    missing_percent: float
    unique_count: int
    sample_values: List[Any] = []

class SchemaResponse(BaseModel):
    row_count: int
    column_count: int
    columns: Dict[str, ColumnMeta]

class KPI(BaseModel):
    label: str
    value: str
    sub: Optional[str] = None
    color: str = "blue"

class ChartSpec(BaseModel):
    id: str
    title: str
    type: str
    column: str
    traces: List[Dict[str, Any]]
    layout: Dict[str, Any] = {}
    anomaly_message: Optional[str] = None

class StatisticsResponse(BaseModel):
    numeric_summary: Dict[str, Dict[str, Any]]
    categorical_summary: Dict[str, Dict[str, Any]]
    correlation_matrix: Optional[Dict[str, Dict[str, float]]] = None
    outlier_counts: Dict[str, int] = {}
    kpis: List[KPI]
    charts: List[ChartSpec]
    numeric_columns: List[str] = []

class DashboardResponse(BaseModel):
    statistics: StatisticsResponse
    schema: SchemaResponse

class DatasetSummary(BaseModel):
    filename: str
    row_count: int
    column_count: int
    missing_percent: float
    duplicate_percent: float
    numeric_cols: int
    categorical_cols: int
    numeric_summary: Dict[str, Dict[str, Any]]
    shared_column_comparison: List[Dict[str, Any]]

class CompareResponse(BaseModel):
    dataset_a: DatasetSummary
    dataset_b: DatasetSummary
    shared_columns: List[str]
    only_in_a: List[str]
    only_in_b: List[str]


# ─────────────────────────────────────────────────────────────────────────────
# File loading
# ─────────────────────────────────────────────────────────────────────────────

def _load_df(filename: str, user: UserInDB) -> pd.DataFrame:
    if not filename or filename != Path(filename).name:
        raise HTTPException(400, "Invalid filename.")

    files_dir   = user_files_dir(user.id)
    cleaned_dir = user_cleaned_dir(user.id)
    ensure_dir(files_dir)
    ensure_dir(cleaned_dir)

    path = files_dir / filename
    if not path.exists():
        alt = cleaned_dir / filename
        if alt.exists():
            path = alt
        else:
            raise HTTPException(404, f"File '{filename}' not found. Please upload it on the Home page first.")

    ext = path.suffix.lower()
    try:
        if ext == ".csv":
            for enc in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                try:
                    return pd.read_csv(path, encoding=enc, low_memory=False)
                except UnicodeDecodeError:
                    continue
            raise HTTPException(400, "Cannot decode CSV.")
        elif ext in {".xlsx", ".xls"}:
            return pd.read_excel(path, engine="openpyxl")
        else:
            raise HTTPException(400, f"Unsupported file type: {ext}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, f"Failed to read file: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Column classification
# ─────────────────────────────────────────────────────────────────────────────

def _classify_columns(df: pd.DataFrame) -> Dict[str, ColumnMeta]:
    meta: Dict[str, ColumnMeta] = {}
    for col in df.columns:
        series      = df[col]
        missing_pct = round(series.isna().mean() * 100, 2)
        unique_cnt  = int(series.nunique(dropna=True))
        sample      = series.dropna().head(5).tolist()

        is_dt = False
        if pd.api.types.is_datetime64_any_dtype(series):
            is_dt = True
        elif series.dtype == object:
            date_hints = ["date","time","day","month","year","created","updated","dob"]
            if any(h in col.lower() for h in date_hints):
                try:
                    parsed = pd.to_datetime(series, errors="coerce", infer_datetime_format=True)
                    if parsed.notna().mean() > 0.7:
                        is_dt = True
                except Exception:
                    pass

        is_bool = pd.api.types.is_bool_dtype(series)
        is_num = pd.api.types.is_numeric_dtype(series) and not is_dt and not is_bool
        is_cat = is_bool or (not is_num and not is_dt) or (is_num and unique_cnt <= 20)

        meta[col] = ColumnMeta(
            dtype=str(series.dtype), is_numeric=bool(is_num),
            is_datetime=bool(is_dt), is_categorical=bool(is_cat),
            missing_percent=missing_pct, unique_count=unique_cnt,
            sample_values=[str(v) if not isinstance(v, (int, float, bool)) else v for v in sample],
        )
    return meta


def _outlier_counts(df: pd.DataFrame, num_cols: List[str]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for col in num_cols:
        if pd.api.types.is_bool_dtype(df[col]):
            continue
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(s) < 4: continue
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr     = q3 - q1
        if iqr == 0: continue
        n = int(((s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)).sum())
        if n > 0: counts[col] = n
    return counts


def _fmt(v: Any, decimals: int = 2) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)): return "N/A"
    if isinstance(v, float):  return f"{v:,.{decimals}f}"
    if isinstance(v, int):    return f"{v:,}"
    return str(v)


def _build_kpis(df, col_meta, outlier_cnts):
    kpis = []
    kpis.append(KPI(label="Total Rows",    value=f"{len(df):,}",         color="blue"))
    kpis.append(KPI(label="Total Columns", value=f"{len(df.columns):,}", color="purple"))
    total_cells   = len(df) * len(df.columns)
    total_missing = int(df.isna().sum().sum())
    missing_pct   = round(total_missing / total_cells * 100, 1) if total_cells else 0
    kpis.append(KPI(label="Missing Values", value=f"{missing_pct}%",
                    sub=f"{total_missing:,} cells", color="red" if missing_pct > 10 else "green"))
    dup = int(df.duplicated().sum())
    kpis.append(KPI(label="Duplicate Rows", value=f"{dup:,}", color="amber" if dup > 0 else "green"))
    for col in [c for c,m in col_meta.items() if m.is_numeric][:4]:
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if s.empty: continue
        kpis.append(KPI(label=f"Avg {col}", value=_fmt(s.mean()),
                        sub=f"max {_fmt(s.max())} · min {_fmt(s.min())}", color="blue"))
    for col in [c for c,m in col_meta.items() if m.is_categorical and not m.is_numeric][:2]:
        vc = df[col].value_counts()
        if vc.empty: continue
        kpis.append(KPI(label=f"Top {col}", value=str(vc.index[0])[:20],
                        sub=f"{round(vc.iloc[0]/len(df)*100,1)}% of rows", color="green"))
    if outlier_cnts:
        kpis.append(KPI(label="Outlier Rows", value=f"{sum(outlier_cnts.values()):,}",
                        sub=f"across {len(outlier_cnts)} column(s)", color="amber"))
    return kpis


PALETTE = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899","#84cc16"]

def _histogram_traces(s, col, bounds):
    traces = [{"type":"histogram","x":s.dropna().tolist(),"name":col,
                "marker":{"color":"rgba(59,130,246,0.7)","line":{"color":"#2563eb","width":1}},"autobinx":True}]
    if bounds:
        lo, hi = bounds
        out = s[(s < lo) | (s > hi)].dropna().tolist()
        if out:
            traces.append({"type":"scatter","mode":"markers","x":out,"y":[0]*len(out),"name":"Outliers",
                           "marker":{"color":"#ef4444","size":10,"symbol":"circle-open","line":{"width":2}}})
    return traces

def _box_traces(s, col):
    return [{"type":"box","y":s.dropna().tolist(),"name":col,"boxpoints":"outliers",
             "marker":{"color":"#8b5cf6","outliercolor":"#ef4444","size":5},
             "line":{"color":"#7c3aed"},"fillcolor":"rgba(139,92,246,0.15)"}]

def _bar_traces(vc, col):
    top = vc.head(15)
    return [{"type":"bar","x":top.index.astype(str).tolist(),"y":top.values.tolist(),"name":col,
             "marker":{"color":[PALETTE[i%len(PALETTE)] for i in range(len(top))],"line":{"color":"white","width":1}}}]

def _pie_traces(vc):
    top = vc.head(10)
    return [{"type":"pie","labels":top.index.astype(str).tolist(),"values":top.values.tolist(),
             "hoverinfo":"label+percent+value","textinfo":"percent","textposition":"inside",
             "marker":{"colors":PALETTE[:len(top)],"line":{"color":"white","width":2}}}]

def _line_traces(df, date_col, num_cols):
    traces = []
    try:
        tmp = df[[date_col]+num_cols].copy()
        tmp[date_col] = pd.to_datetime(tmp[date_col], errors="coerce", infer_datetime_format=True)
        tmp = tmp.dropna(subset=[date_col]).sort_values(date_col)
        tmp = tmp.groupby(date_col)[num_cols].sum().reset_index()
        for i, nc in enumerate(num_cols[:3]):
            color  = PALETTE[i%len(PALETTE)]
            x_vals = tmp[date_col].astype(str).tolist()
            y_vals = tmp[nc].tolist()
            traces.append({"type":"scatter","mode":"lines+markers","name":nc,"x":x_vals,"y":y_vals,
                           "line":{"color":color,"width":2},"marker":{"size":4}})
            ma = tmp[nc].rolling(7, min_periods=1).mean()
            traces.append({"type":"scatter","mode":"lines","name":f"{nc} (7-pt MA)","x":x_vals,"y":ma.tolist(),
                           "line":{"color":color,"width":2,"dash":"dot"}})
    except Exception:
        pass
    return traces

def _heatmap_traces(corr):
    cols = corr.columns.tolist()
    z    = [[round(corr.loc[r,c],3) for c in cols] for r in cols]
    return [{"type":"heatmap","x":cols,"y":cols,"z":z,"colorscale":"RdBu","zmid":0,
             "text":[[f"{v:.2f}" for v in row] for row in z],"texttemplate":"%{text}",
             "textfont":{"size":10},"hoverongaps":False}]

def _build_charts(df, col_meta, outlier_cnts, corr_df):
    charts = []
    chart_id = 0
    def nxt():
        nonlocal chart_id; chart_id += 1; return f"chart_{chart_id}"

    num_cols  = [c for c,m in col_meta.items() if m.is_numeric]
    cat_cols  = [c for c,m in col_meta.items() if m.is_categorical and not m.is_numeric]
    date_cols = [c for c,m in col_meta.items() if m.is_datetime]

    for col in num_cols[:6]:
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if s.empty: continue
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr     = q3 - q1
        bounds  = (q1-1.5*iqr, q3+1.5*iqr) if iqr > 0 else None
        anom    = f"⚠️ {outlier_cnts[col]} outliers" if col in outlier_cnts else None
        charts.append(ChartSpec(id=nxt(), title=f"Distribution — {col}", type="histogram", column=col,
            traces=_histogram_traces(s,col,bounds), anomaly_message=anom,
            layout={"xaxis":{"title":col},"yaxis":{"title":"Frequency"}}))
        charts.append(ChartSpec(id=nxt(), title=f"Box Plot — {col}", type="box", column=col,
            traces=_box_traces(s,col), anomaly_message=anom, layout={"yaxis":{"title":col}}))

    for col in cat_cols[:5]:
        vc = df[col].value_counts().dropna()
        if vc.empty: continue
        charts.append(ChartSpec(id=nxt(), title=f"Frequency — {col}", type="bar", column=col,
            traces=_bar_traces(vc,col), layout={"xaxis":{"title":col,"tickangle":-35},"yaxis":{"title":"Count"}}))
        if vc.nunique() <= 12:
            charts.append(ChartSpec(id=nxt(), title=f"Breakdown — {col}", type="pie", column=col, traces=_pie_traces(vc)))

    if date_cols and num_cols:
        traces = _line_traces(df, date_cols[0], num_cols[:3])
        if traces:
            charts.append(ChartSpec(id=nxt(), title=f"Trend Over Time — {date_cols[0]}", type="line",
                column=date_cols[0], traces=traces,
                layout={"xaxis":{"title":date_cols[0]},"yaxis":{"title":"Value"},"legend":{"orientation":"h"}}))

    if corr_df is not None and len(corr_df) >= 2:
        charts.append(ChartSpec(id=nxt(), title="Correlation Heatmap", type="heatmap", column="correlation",
            traces=_heatmap_traces(corr_df),
            layout={"xaxis":{"side":"bottom"},"yaxis":{"autorange":"reversed"}}))
    return charts


def _jsonify(obj):
    if isinstance(obj, dict):        return {k: _jsonify(v) for k,v in obj.items()}
    if isinstance(obj, list):        return [_jsonify(v) for v in obj]
    if isinstance(obj, np.integer):  return int(obj)
    if isinstance(obj, np.floating):
        v = float(obj)
        return None if (math.isnan(v) or math.isinf(v)) else v
    if isinstance(obj, np.ndarray):  return [_jsonify(v) for v in obj.tolist()]
    if isinstance(obj, pd.Timestamp): return obj.isoformat()
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 1 — /api/dashboard/auto
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/api/dashboard/auto", response_model=DashboardResponse)
@router.post("/dashboard/auto", response_model=DashboardResponse, include_in_schema=False)
async def auto_dashboard(request: DashboardRequest, current_user: UserInDB = Depends(get_current_active_user)):
    df = _load_df(request.filename, current_user)
    if df.empty: raise HTTPException(400, "File is empty.")

    col_meta = _classify_columns(df)
    num_cols = [c for c,m in col_meta.items() if m.is_numeric]
    cat_cols = [c for c,m in col_meta.items() if m.is_categorical and not m.is_numeric]

    numeric_summary: Dict[str, Dict[str, Any]] = {}
    if num_cols: numeric_summary = _jsonify(df[num_cols].describe().to_dict())

    categorical_summary: Dict[str, Dict[str, Any]] = {}
    for col in cat_cols[:10]:
        vc = df[col].value_counts().head(20)
        categorical_summary[col] = {str(k): _jsonify(v) for k, v in vc.to_dict().items()}

    corr_df            = df[num_cols].corr() if len(num_cols) >= 2 else None
    correlation_matrix = _jsonify(corr_df.to_dict()) if corr_df is not None else None
    outlier_cnts       = _outlier_counts(df, num_cols)
    kpis               = _build_kpis(df, col_meta, outlier_cnts)
    charts             = _build_charts(df, col_meta, outlier_cnts, corr_df)

    return DashboardResponse(
        statistics=StatisticsResponse(
            numeric_summary=numeric_summary, categorical_summary=categorical_summary,
            correlation_matrix=correlation_matrix, outlier_counts=outlier_cnts,
            kpis=[k.dict() for k in kpis], charts=[c.dict() for c in charts],
            numeric_columns=num_cols,
        ),
        schema=SchemaResponse(row_count=len(df), column_count=len(df.columns), columns=col_meta),
    )


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 2 — /api/dashboard/compare
# ─────────────────────────────────────────────────────────────────────────────

def _dataset_summary(df: pd.DataFrame, filename: str) -> DatasetSummary:
    total_cells = len(df) * len(df.columns) or 1
    num_cols    = df.select_dtypes(include=[np.number]).columns.tolist()
    return DatasetSummary(
        filename=filename, row_count=len(df), column_count=len(df.columns),
        missing_percent=round(df.isna().sum().sum()/total_cells*100, 2),
        duplicate_percent=round(df.duplicated().sum()/len(df)*100, 2) if len(df) else 0,
        numeric_cols=len(num_cols),
        categorical_cols=len(df.select_dtypes(exclude=[np.number]).columns),
        numeric_summary=_jsonify(df[num_cols].describe().to_dict()) if num_cols else {},
        shared_column_comparison=[],
    )

@router.post("/api/dashboard/compare", response_model=CompareResponse)
@router.post("/dashboard/compare", response_model=CompareResponse, include_in_schema=False)
async def compare_datasets(request: CompareRequest, current_user: UserInDB = Depends(get_current_active_user)):
    df_a   = _load_df(request.filename_a, current_user)
    df_b   = _load_df(request.filename_b, current_user)
    cols_a = set(df_a.columns); cols_b = set(df_b.columns)
    shared = sorted(cols_a & cols_b)
    sum_a  = _dataset_summary(df_a, request.filename_a)
    sum_b  = _dataset_summary(df_b, request.filename_b)

    shared_comparison = []
    for col in shared[:20]:
        row: Dict[str, Any] = {"column": col}
        for label, dff in [("a", df_a), ("b", df_b)]:
            s = dff[col]
            row[f"dtype_{label}"]   = str(s.dtype)
            row[f"missing_{label}"] = round(s.isna().mean()*100, 1)
            if pd.api.types.is_numeric_dtype(s):
                row[f"mean_{label}"] = _jsonify(s.mean())
                row[f"std_{label}"]  = _jsonify(s.std())
                row[f"min_{label}"]  = _jsonify(s.min())
                row[f"max_{label}"]  = _jsonify(s.max())
            else:
                vc = s.value_counts()
                row[f"unique_{label}"] = int(s.nunique())
                row[f"top_{label}"]    = str(vc.index[0]) if not vc.empty else "N/A"
        shared_comparison.append(row)

    sum_a.shared_column_comparison = shared_comparison
    sum_b.shared_column_comparison = shared_comparison
    return CompareResponse(
        dataset_a=sum_a, dataset_b=sum_b, shared_columns=shared,
        only_in_a=sorted(cols_a-cols_b), only_in_b=sorted(cols_b-cols_a),
    )
