"""
dashboard_routes.py
Endpoints:
  POST /api/dashboard/auto        — main dashboard
  POST /api/dashboard/compare     — compare two datasets
  POST /api/dashboard/ml-columns  — score columns for ML suitability
  POST /api/dashboard/ml-predict  — train AutoML model + return training results
  POST /api/dashboard/ml-predict-single — predict a single row using trained model
"""

from __future__ import annotations

import math
import threading
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
# In-memory model store  (user_id → model session)
# ─────────────────────────────────────────────────────────────────────────────
_model_store: Dict[str, Any] = {}
_store_lock = threading.Lock()


def _store_model(user_id: str, session: dict):
    with _store_lock:
        _model_store[str(user_id)] = session


def _get_model(user_id: str) -> Optional[dict]:
    with _store_lock:
        return _model_store.get(str(user_id))


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────

class DashboardRequest(BaseModel):
    filename: str

class CompareRequest(BaseModel):
    filename_a: str
    filename_b: str

class MLRequest(BaseModel):
    filename: str
    target_column: str

class MLColumnsRequest(BaseModel):
    filename: str

class SinglePredictRequest(BaseModel):
    feature_values: Dict[str, Any]   # { "column_name": value, ... }

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

class FeatureImportance(BaseModel):
    feature: str
    importance: float
    importance_pct: float

class MLColumnInfo(BaseModel):
    name: str
    dtype: str
    unique_count: int
    task_type: str
    recommendation: str
    reason: str

class MLColumnsResponse(BaseModel):
    columns: List[MLColumnInfo]
    recommended: List[str]

# Feature input spec — what the frontend needs to build the prediction form
class FeatureInputSpec(BaseModel):
    name: str                          # original column name
    encoded_name: str                  # name after encoding (may differ for OHE)
    input_type: str                    # "numeric" | "categorical" | "binary"
    options: Optional[List[str]] = None   # for categorical dropdowns
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean_val: Optional[float] = None
    default_value: Any = None

class MLResponse(BaseModel):
    target_column: str
    model_type: str
    task_label: str
    accuracy: Optional[float] = None
    r2_score: Optional[float] = None
    rmse: Optional[float] = None
    performance_label: str = ""
    performance_color: str = ""
    feature_importances: List[FeatureImportance]
    top_feature: str
    insight: str
    dataset_rows: int
    dataset_cols: int
    features_used: int
    training_rows: int
    feature_input_specs: List[FeatureInputSpec] = []   # NEW: for prediction form
    model_ready: bool = True

# Prediction factor
class PredictionFactor(BaseModel):
    feature: str
    value: Any
    impact: str      # "high" | "medium" | "low"
    direction: str   # "increases" | "decreases" | "neutral"
    importance_pct: float

class SinglePredictResponse(BaseModel):
    predicted_value: str
    predicted_raw: Any
    confidence: Optional[float] = None
    probabilities: Optional[Dict[str, float]] = None
    explanation_summary: str
    top_factor: str
    other_factors: List[str]
    factors: List[PredictionFactor]
    simple_reason: str


# ─────────────────────────────────────────────────────────────────────────────
# File loading
# ─────────────────────────────────────────────────────────────────────────────

def _load_df(filename: str, user: UserInDB) -> pd.DataFrame:
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

        is_num = pd.api.types.is_numeric_dtype(series) and not is_dt
        is_cat = (not is_num and not is_dt) or (is_num and unique_cnt <= 20)

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
        s = df[col].dropna()
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
# Column scoring for ML
# ─────────────────────────────────────────────────────────────────────────────

_ID_PATTERNS   = {"id","_id","index","idx","no","sr","num","uuid","key","code","row"}
_DATE_PATTERNS = {"year","date","time","month","day","created","updated","timestamp","dob"}
_BAD_WORDS     = _ID_PATTERNS | _DATE_PATTERNS

def _score_target_column(col: str, series: pd.Series, total_rows: int) -> tuple[str, str, str]:
    col_lower  = col.lower().strip()
    unique_cnt = int(series.nunique(dropna=True))
    missing    = series.isna().mean()
    is_numeric = pd.api.types.is_numeric_dtype(series)
    words      = set(col_lower.replace("-","_").split("_"))

    if words & _BAD_WORDS:
        return "regression" if is_numeric else "classification", "avoid", \
               f"'{col}' looks like an ID or date column — not meaningful to predict"
    if unique_cnt == total_rows:
        return "regression" if is_numeric else "classification", "avoid", \
               "Every row has a unique value — likely an identifier, not a target"
    if missing > 0.5:
        return "regression" if is_numeric else "classification", "avoid", \
               f"{missing*100:.0f}% missing values — too much data missing"
    if unique_cnt <= 1:
        return "regression" if is_numeric else "classification", "avoid", \
               "Only one unique value — constant column, useless as a target"

    if not is_numeric or unique_cnt <= 20:
        if unique_cnt == 2:   return "classification", "good", f"Binary target ({unique_cnt} classes) — ideal for classification"
        if unique_cnt <= 10:  return "classification", "good", f"Categorical target ({unique_cnt} classes) — good for classification"
        if unique_cnt <= 20:  return "classification", "ok",   f"{unique_cnt} categories — manageable for classification"
        return "classification", "avoid", f"Too many categories ({unique_cnt}) — consider a numeric target instead"

    good_words = {"price","salary","wage","income","revenue","sales","amount","total","score",
                  "rating","rate","percent","age","weight","height","distance","quantity",
                  "count","duration","temperature","population","value"}
    if words & good_words:
        return "regression", "good", f"Numeric target with {unique_cnt} unique values — great for regression"
    return "regression", "ok", f"Numeric column with {unique_cnt} unique values — suitable for regression"


# ─────────────────────────────────────────────────────────────────────────────
# AutoML preprocessing
# ─────────────────────────────────────────────────────────────────────────────

def _automl_preprocess(df: pd.DataFrame, target_col: str):
    df = df.copy()
    df = df.dropna(subset=[target_col])
    if len(df) < 10:
        raise ValueError("Not enough rows with non-null target (need ≥ 10).")

    y          = df[target_col]
    unique_cnt = int(y.nunique())
    is_num_tgt = pd.api.types.is_numeric_dtype(y)

    if not is_num_tgt or unique_cnt <= 20:
        task_type = "classification"
        y = y.astype(str)
    else:
        task_type = "regression"
        y = pd.to_numeric(y, errors="coerce")
        df = df[y.notna()]
        y  = y[y.notna()]

    X = df.drop(columns=[target_col])

    cols_to_drop = []
    for col in X.columns:
        s     = X[col]
        words = set(col.lower().replace("-","_").split("_"))
        if words & _BAD_WORDS:                         cols_to_drop.append(col); continue
        if s.nunique() == len(df):                     cols_to_drop.append(col); continue
        if pd.api.types.is_datetime64_any_dtype(s):    cols_to_drop.append(col); continue
        if s.nunique() <= 1:                           cols_to_drop.append(col); continue
    X = X.drop(columns=cols_to_drop, errors="ignore")

    if X.empty:
        raise ValueError("No usable feature columns remaining after filtering.")

    num_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = X.select_dtypes(exclude=[np.number]).columns.tolist()

    # Track fill values for prediction
    fill_values: Dict[str, Any] = {}
    for col in num_cols:
        med = X[col].median()
        fill_values[col] = med
        X[col] = X[col].fillna(med)

    cat_info: Dict[str, List[str]] = {}   # col → categories
    for col in cat_cols:
        mode = X[col].mode()
        fill_values[col] = mode[0] if not mode.empty else "Unknown"
        X[col] = X[col].fillna(fill_values[col])
        cat_info[col] = sorted(X[col].unique().tolist()[:50])

    # Drop high-cardinality categoricals
    high_card  = [c for c in cat_cols if X[c].nunique() > 50]
    X          = X.drop(columns=high_card, errors="ignore")
    cat_cols   = [c for c in cat_cols if c not in high_card]
    for c in high_card:
        cat_info.pop(c, None)

    if cat_cols:
        X = pd.get_dummies(X, columns=cat_cols, drop_first=False, dtype=float)

    X = X.select_dtypes(include=[np.number])
    if X.empty:
        raise ValueError("No numeric features available after encoding.")

    return X, y, X.columns.tolist(), task_type, fill_values, cat_info, num_cols


# ─────────────────────────────────────────────────────────────────────────────
# Performance labels
# ─────────────────────────────────────────────────────────────────────────────

def _perf_label_clf(acc):
    if acc >= 85: return "Excellent", "green"
    if acc >= 70: return "Good",      "blue"
    if acc >= 55: return "Average",   "amber"
    return             "Poor",       "red"

def _perf_label_reg(r2):
    if r2 >= 0.85: return "Excellent", "green"
    if r2 >= 0.65: return "Good",      "blue"
    if r2 >= 0.40: return "Average",   "amber"
    return              "Poor",       "red"

def _generate_insight(target, task_type, perf_label, top_features, accuracy=None, r2=None, rmse=None, n_rows=0, n_features=0):
    top3 = ", ".join([f['feature'] for f in top_features[:3]])
    if task_type == "classifier":
        qual = {
            "Excellent": f"Excellent — correctly predicts '{target}' {accuracy}% of the time.",
            "Good":      f"Good performance — {accuracy}% accuracy.",
            "Average":   f"Average performance ({accuracy}% accuracy). Some patterns are captured.",
            "Poor":      f"Poor ({accuracy}% accuracy). '{target}' may be hard to predict from this data.",
        }.get(perf_label, "")
    else:
        pct = round(r2*100,1) if r2 else 0
        qual = {
            "Excellent": f"Excellent fit — explains {pct}% of variation in '{target}'.",
            "Good":      f"Good fit — explains {pct}% of the variation.",
            "Average":   f"Moderate fit ({pct}% variance explained).",
            "Poor":      f"Weak fit (R²={r2}). '{target}' may not be well-predicted.",
        }.get(perf_label, "")
    return f"{qual} Trained on {n_rows:,} rows using {n_features} features. Most influential factors: {top3}."


# ─────────────────────────────────────────────────────────────────────────────
# Build feature input specs for prediction form
# ─────────────────────────────────────────────────────────────────────────────

def _build_feature_specs(
    df_original: pd.DataFrame,
    feature_names: List[str],       # encoded feature names (after OHE)
    cat_info: Dict[str, List[str]], # original col → categories
    num_cols: List[str],
    target_col: str,
    fill_values: Dict[str, Any],
    fi_list: List[FeatureImportance],
) -> List[FeatureInputSpec]:
    """
    Build form specs for TOP-10 most important original (pre-OHE) features.
    Categorical columns encoded via OHE are collapsed back to a single dropdown.
    """
    specs: List[FeatureInputSpec] = []
    seen_originals: set = set()

    # Map importance back to original columns
    orig_importance: Dict[str, float] = {}
    for fi in fi_list:
        enc = fi.feature
        # Find the original column name for this encoded feature
        orig = enc
        for cat_col in cat_info:
            if enc.startswith(cat_col + "_") or enc == cat_col:
                orig = cat_col
                break
        orig_importance[orig] = orig_importance.get(orig, 0) + fi.importance

    # Sort original columns by total importance descending
    sorted_orig = sorted(orig_importance.items(), key=lambda x: x[1], reverse=True)

    for orig_col, _ in sorted_orig[:10]:
        if orig_col in seen_originals or orig_col == target_col:
            continue
        seen_originals.add(orig_col)

        if orig_col in cat_info:
            options = cat_info[orig_col]
            default = fill_values.get(orig_col, options[0] if options else "")
            specs.append(FeatureInputSpec(
                name         = orig_col,
                encoded_name = orig_col,
                input_type   = "categorical",
                options      = options,
                default_value= str(default),
            ))
        elif orig_col in num_cols:
            s = pd.to_numeric(df_original[orig_col], errors="coerce").dropna()
            specs.append(FeatureInputSpec(
                name          = orig_col,
                encoded_name  = orig_col,
                input_type    = "numeric",
                min_val       = float(s.min()) if not s.empty else None,
                max_val       = float(s.max()) if not s.empty else None,
                mean_val      = float(s.mean()) if not s.empty else None,
                default_value = float(s.median()) if not s.empty else 0,
            ))

    return specs


# ─────────────────────────────────────────────────────────────────────────────
# Single-row prediction + explanation
# ─────────────────────────────────────────────────────────────────────────────

def _build_single_prediction_row(
    feature_values: Dict[str, Any],
    session: dict,
) -> pd.DataFrame:
    """
    Convert user-supplied {col: value} into a properly encoded row
    that matches the model's expected features.
    """
    cat_info     = session["cat_info"]
    fill_values  = session["fill_values"]
    feature_cols = session["feature_cols"]   # final encoded feature names
    num_cols     = session["num_cols"]

    # Start with fill values for all original numeric columns
    row: Dict[str, Any] = {}
    for col in num_cols:
        row[col] = feature_values.get(col, fill_values.get(col, 0))
        try:
            row[col] = float(row[col])
        except (ValueError, TypeError):
            row[col] = fill_values.get(col, 0)

    # Build DataFrame for encoding
    row_df = pd.DataFrame([row])

    # Add categorical columns and one-hot encode them
    cat_cols_present = [c for c in cat_info if c in feature_cols or
                        any(fc.startswith(c + "_") for fc in feature_cols)]

    if cat_cols_present:
        for col in cat_cols_present:
            val = feature_values.get(col, fill_values.get(col, cat_info[col][0] if cat_info[col] else "Unknown"))
            row_df[col] = str(val)
        row_df = pd.get_dummies(row_df, columns=cat_cols_present, drop_first=False, dtype=float)

    # Align to training features — add missing cols as 0, drop extras
    for fc in feature_cols:
        if fc not in row_df.columns:
            row_df[fc] = 0.0
    row_df = row_df[feature_cols]

    return row_df


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 1 — /api/dashboard/auto
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/api/dashboard/auto", response_model=DashboardResponse)
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
        categorical_summary[col] = _jsonify(vc.to_dict())

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
# ENDPOINT 2 — /api/dashboard/ml-columns
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/api/dashboard/ml-columns", response_model=MLColumnsResponse)
async def get_ml_columns(request: MLColumnsRequest, current_user: UserInDB = Depends(get_current_active_user)):
    df    = _load_df(request.filename, current_user)
    total = len(df)
    cols  = []
    for col in df.columns:
        task, rec, reason = _score_target_column(col, df[col], total)
        cols.append(MLColumnInfo(name=col, dtype=str(df[col].dtype),
            unique_count=int(df[col].nunique(dropna=True)),
            task_type=task, recommendation=rec, reason=reason))
    return MLColumnsResponse(columns=cols, recommended=[c.name for c in cols if c.recommendation=="good"])


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 3 — /api/dashboard/ml-predict  (train + store model)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/api/dashboard/ml-predict", response_model=MLResponse)
async def ml_predict(request: MLRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import accuracy_score, r2_score, mean_squared_error
        from sklearn.preprocessing import LabelEncoder
    except ImportError:
        raise HTTPException(500, "scikit-learn not installed. Run: pip install scikit-learn")

    df = _load_df(request.filename, current_user)
    if request.target_column not in df.columns:
        raise HTTPException(400, f"Column '{request.target_column}' not found.")

    task_type_hint, rec, reason = _score_target_column(request.target_column, df[request.target_column], len(df))
    if rec == "avoid":
        raise HTTPException(400, f"'{request.target_column}' is not suitable: {reason}")

    try:
        X, y, feature_cols, task_type, fill_values, cat_info, num_cols = _automl_preprocess(df, request.target_column)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if len(X) < 20:
        raise HTTPException(400, f"Not enough rows ({len(X)}). Need at least 20.")

    test_size = min(0.25, max(0.1, 50 / len(X)))
    le = None
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42,
            stratify=y if task_type=="classification" and y.nunique()<=20 else None)
    except Exception:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)

    n_est = min(200, max(50, len(X_train)//10))

    if task_type == "classification":
        le = LabelEncoder()
        y_train_enc = le.fit_transform(y_train.astype(str))
        y_test_enc  = le.transform(y_test.astype(str))
        model       = RandomForestClassifier(n_estimators=n_est, max_depth=10, min_samples_leaf=2, random_state=42, n_jobs=-1)
        model.fit(X_train, y_train_enc)
        y_pred      = model.predict(X_test)
        accuracy    = round(float(accuracy_score(y_test_enc, y_pred)) * 100, 1)
        r2 = rmse   = None
        perf_label, perf_color = _perf_label_clf(accuracy)
        model_type  = "classifier"; task_label = "Classification"
    else:
        model = RandomForestRegressor(n_estimators=n_est, max_depth=10, min_samples_leaf=2, random_state=42, n_jobs=-1)
        model.fit(X_train, y_train)
        y_pred    = model.predict(X_test)
        r2        = round(float(r2_score(y_test, y_pred)), 4)
        rmse      = round(float(mean_squared_error(y_test, y_pred)**0.5), 4)
        accuracy  = None
        perf_label, perf_color = _perf_label_reg(r2)
        model_type = "regressor"; task_label = "Regression"

    importances = model.feature_importances_
    total_imp   = importances.sum() or 1.0
    feat_pairs  = sorted(zip(feature_cols, importances.tolist()), key=lambda x: x[1], reverse=True)
    top_feature = feat_pairs[0][0] if feat_pairs else "N/A"
    fi_list     = [FeatureImportance(feature=f, importance=round(imp,6), importance_pct=round(imp/total_imp*100,1))
                   for f, imp in feat_pairs[:15]]

    insight = _generate_insight(request.target_column, model_type, perf_label,
        [fi.dict() for fi in fi_list], accuracy=accuracy, r2=r2, rmse=rmse,
        n_rows=len(X_train), n_features=len(feature_cols))

    # Store model session for prediction
    _store_model(current_user.id, {
        "model":        model,
        "le":           le,
        "task_type":    task_type,
        "feature_cols": feature_cols,
        "cat_info":     cat_info,
        "fill_values":  fill_values,
        "num_cols":     num_cols,
        "target_col":   request.target_column,
        "fi_list":      fi_list,
        "df_original":  df,
    })

    feature_input_specs = _build_feature_specs(
        df_original=df, feature_names=feature_cols, cat_info=cat_info,
        num_cols=num_cols, target_col=request.target_column,
        fill_values=fill_values, fi_list=fi_list)

    return MLResponse(
        target_column=request.target_column, model_type=model_type, task_label=task_label,
        accuracy=accuracy, r2_score=r2, rmse=rmse,
        performance_label=perf_label, performance_color=perf_color,
        feature_importances=fi_list, top_feature=top_feature, insight=insight,
        dataset_rows=len(df), dataset_cols=len(df.columns),
        features_used=len(feature_cols), training_rows=len(X_train),
        feature_input_specs=[s.dict() for s in feature_input_specs],
        model_ready=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 4 — /api/dashboard/ml-predict-single  (predict one row)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/api/dashboard/ml-predict-single", response_model=SinglePredictResponse)
async def ml_predict_single(request: SinglePredictRequest, current_user: UserInDB = Depends(get_current_active_user)):
    session = _get_model(current_user.id)
    if session is None:
        raise HTTPException(400, "No trained model found. Please train the model first by clicking 'Train & Predict'.")

    model       = session["model"]
    le          = session["le"]
    task_type   = session["task_type"]
    feature_cols = session["feature_cols"]
    fi_list     = session["fi_list"]
    target_col  = session["target_col"]

    # Build prediction row
    row_df = _build_single_prediction_row(request.feature_values, session)

    # Predict
    if task_type == "classification":
        pred_enc   = model.predict(row_df)[0]
        pred_proba = model.predict_proba(row_df)[0]
        classes    = le.classes_
        pred_label = le.inverse_transform([pred_enc])[0]
        confidence = round(float(pred_proba.max()) * 100, 1)
        probs      = {str(cls): round(float(p)*100, 1) for cls, p in zip(classes, pred_proba)}
        predicted_raw   = pred_label
        predicted_value = str(pred_label)
    else:
        pred_val      = float(model.predict(row_df)[0])
        predicted_raw = round(pred_val, 4)
        predicted_value = f"{pred_val:,.4f}".rstrip("0").rstrip(".")
        confidence    = None
        probs         = None

    # Per-feature impact using tree leaf node contribution approximation
    # We use feature importance × |feature_value - median| as a proxy for local impact
    factors: List[PredictionFactor] = []
    fi_map = {fi.feature: fi.importance_pct for fi in fi_list}

    df_orig = session["df_original"]

    for spec_name, spec_val in request.feature_values.items():
        # Find encoded importance for this original column
        imp_pct = 0.0
        for enc_name, enc_imp in fi_map.items():
            if enc_name == spec_name or enc_name.startswith(spec_name + "_"):
                imp_pct += enc_imp

        if imp_pct < 0.5:  # skip very low importance
            continue

        # Determine direction (only meaningful for numeric)
        direction = "neutral"
        if spec_name in session["num_cols"]:
            try:
                col_med  = float(df_orig[spec_name].median())
                col_val  = float(spec_val)
                direction = "increases" if col_val > col_med else "decreases" if col_val < col_med else "neutral"
            except (ValueError, TypeError, KeyError):
                pass

        impact = "high" if imp_pct >= 10 else "medium" if imp_pct >= 4 else "low"

        factors.append(PredictionFactor(
            feature=spec_name, value=spec_val,
            impact=impact, direction=direction, importance_pct=round(imp_pct, 1)
        ))

    factors.sort(key=lambda x: x.importance_pct, reverse=True)

    # Build explanation
    top_factor     = factors[0].feature if factors else "N/A"
    other_factors  = [f.feature for f in factors[1:4]]

    if task_type == "classification":
        conf_str = f"Confidence: {confidence}%"
        simple_reason = (
            f"Based on the values you entered, the model predicts '{predicted_value}' "
            f"with {confidence}% confidence. "
            f"The most influential factor is '{top_factor}' "
            f"({factors[0].importance_pct}% importance)."
            if factors else
            f"The model predicts '{predicted_value}' with {confidence}% confidence."
        )
    else:
        simple_reason = (
            f"Based on the values you entered, the model estimates '{target_col}' = {predicted_value}. "
            f"The most influential factor is '{top_factor}' ({factors[0].importance_pct}% importance)."
            if factors else
            f"The model estimates '{target_col}' = {predicted_value}."
        )

    explanation_summary = (
        f"Prediction: {predicted_value}"
        + (f" (confidence {confidence}%)" if confidence is not None else "")
        + f" | Top factor: {top_factor}"
    )

    return SinglePredictResponse(
        predicted_value=predicted_value, predicted_raw=predicted_raw,
        confidence=confidence, probabilities=probs,
        explanation_summary=explanation_summary,
        top_factor=top_factor, other_factors=other_factors,
        factors=factors, simple_reason=simple_reason,
    )


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 5 — /api/dashboard/compare
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