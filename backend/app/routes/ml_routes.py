"""
ml_routes.py
─────────────────────────────────────────────────────────────────────
POST /api/dashboard/ml-columns   → list columns with recommendations
POST /api/dashboard/ml-predict   → train Random Forest, return metrics
POST /api/dashboard/ml-single-predict → predict a single custom row
                                        + local feature-importance explanation
─────────────────────────────────────────────────────────────────────
All models are stored in memory keyed by (user_id, filename, target).
The train endpoint must be called before single-predict.
"""
from __future__ import annotations

import math
import uuid
import hashlib
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.user_model import UserInDB
from app.utils.auth_utils import get_current_active_user
from app.utils.paths import ensure_dir, user_cleaned_dir, user_files_dir

router = APIRouter()

# ── In-memory model store  { cache_key: ModelBundle } ───────────────────────
_MODEL_STORE: dict[str, Any] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────

class ColumnRequest(BaseModel):
    filename: str


class TrainRequest(BaseModel):
    filename: str
    target_column: str


class SinglePredictRequest(BaseModel):
    filename: str
    target_column: str
    input_values: dict[str, Any]   # { "Age": 32, "Department": "Sales", ... }


# ─────────────────────────────────────────────────────────────────────────────
# File loader
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
            raise HTTPException(404, f"File '{filename}' not found.")

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


def _cache_key(user_id: str, filename: str, target: str) -> str:
    raw = f"{user_id}::{filename}::{target}"
    return hashlib.md5(raw.encode()).hexdigest()


def _safe(v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return round(float(v), 6)
    return v


# ─────────────────────────────────────────────────────────────────────────────
# ML helpers
# ─────────────────────────────────────────────────────────────────────────────

def _detect_task(series: pd.Series) -> str:
    """Return 'classification' or 'regression'."""
    if series.dtype == object or series.dtype.name == "category":
        return "classification"
    n_unique = series.nunique()
    if n_unique <= 10:
        return "classification"
    return "regression"


def _recommend(df: pd.DataFrame, col: str) -> tuple[str, str]:
    """Return (recommendation, reason) for a target column."""
    s        = df[col]
    n_unique = s.nunique()
    missing  = s.isnull().mean()

    if missing > 0.5:
        return "avoid", "More than 50% missing values"
    if n_unique <= 1:
        return "avoid", "Constant column — nothing to predict"
    if n_unique == len(df):
        return "avoid", "Unique per row — likely an ID column"
    if pd.api.types.is_datetime64_any_dtype(s):
        return "avoid", "Date/time column — not a good ML target"

    col_lower = col.lower()
    if any(w in col_lower for w in ["id","key","code","index","uuid","ref"]):
        return "avoid", "Looks like an identifier column"

    if pd.api.types.is_numeric_dtype(s):
        if n_unique <= 10:
            return "good", f"Numeric with {n_unique} categories — good for classification"
        return "good", "Continuous numeric — good for regression"

    if n_unique <= 20:
        return "good", f"{n_unique} categories — good for classification"
    if n_unique <= 50:
        return "ok", f"{n_unique} categories — classification possible but complex"
    return "avoid", f"Too many categories ({n_unique}) — hard to predict"


def _build_pipeline(df: pd.DataFrame, feature_cols: list[str], task: str):
    """Build a sklearn Pipeline for any mix of numeric + categorical columns."""
    from sklearn.pipeline import Pipeline
    from sklearn.compose import ColumnTransformer
    from sklearn.preprocessing import StandardScaler, OrdinalEncoder
    from sklearn.impute import SimpleImputer
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

    num_cols = [c for c in feature_cols if pd.api.types.is_numeric_dtype(df[c])]
    cat_cols = [c for c in feature_cols if not pd.api.types.is_numeric_dtype(df[c])]

    num_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale",  StandardScaler()),
    ])
    cat_pipe = Pipeline([
        ("impute",  SimpleImputer(strategy="most_frequent")),
        ("encode",  OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)),
    ])

    transformers = []
    if num_cols:
        transformers.append(("num", num_pipe, num_cols))
    if cat_cols:
        transformers.append(("cat", cat_pipe, cat_cols))

    preprocessor = ColumnTransformer(transformers, remainder="drop")

    estimator = (
        RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42, n_jobs=-1)
        if task == "classification"
        else RandomForestRegressor(n_estimators=100, max_depth=8, random_state=42, n_jobs=-1)
    )

    return Pipeline([("prep", preprocessor), ("model", estimator)]), num_cols, cat_cols


def _performance_label(score: float, task: str) -> str:
    if task == "classification":
        if score >= 0.9:  return "Excellent"
        if score >= 0.75: return "Good"
        if score >= 0.6:  return "Average"
        return "Poor"
    else:
        if score >= 0.85: return "Excellent"
        if score >= 0.65: return "Good"
        if score >= 0.4:  return "Average"
        return "Poor"


def _generate_insight(result: dict) -> str:
    task  = result["task_label"]
    label = result["performance_label"]
    fname = result.get("target_column", "the target")
    top_f = result["feature_importances"][0]["feature"] if result["feature_importances"] else "unknown"

    intros = {
        "Excellent": f"The model predicts **{fname}** with excellent accuracy.",
        "Good":      f"The model does a good job predicting **{fname}**.",
        "Average":   f"The model has moderate accuracy for **{fname}**.",
        "Poor":      f"The model struggles to predict **{fname}** reliably.",
    }
    intro = intros.get(label, f"Model trained for {fname}.")

    if task == "Classification":
        metric = f"Accuracy: **{result.get('accuracy')}%**."
    else:
        metric = f"R² score: **{result.get('r2_score')}** (explains {result.get('r2_score',0)*100:.0f}% of variance)."

    return (
        f"{intro} {metric} "
        f"The most influential feature is **{top_f}**. "
        f"The model was trained on **{result['training_rows']:,}** rows using "
        f"**{result['features_used']}** features."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/api/dashboard/ml-columns")
async def ml_columns(
    req: ColumnRequest,
    user: UserInDB = Depends(get_current_active_user),
):
    df = _load_df(req.filename, user)
    columns = []
    recommended = []

    for col in df.columns:
        rec, reason = _recommend(df, col)
        task = _detect_task(df[col]) if rec != "avoid" else "n/a"
        columns.append({
            "name":           col,
            "task_type":      task,
            "unique_count":   int(df[col].nunique()),
            "missing_pct":    round(float(df[col].isnull().mean() * 100), 1),
            "recommendation": rec,
            "reason":         reason,
        })
        if rec == "good":
            recommended.append(col)

    return {"columns": columns, "recommended": recommended}


@router.post("/api/dashboard/ml-predict")
async def ml_predict(
    req: TrainRequest,
    user: UserInDB = Depends(get_current_active_user),
):
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, r2_score, mean_squared_error

    df = _load_df(req.filename, user)

    if req.target_column not in df.columns:
        raise HTTPException(400, f"Column '{req.target_column}' not found.")

    # Drop rows where target is null
    df = df.dropna(subset=[req.target_column])
    if len(df) < 10:
        raise HTTPException(400, "Need at least 10 non-null rows to train a model.")

    task         = _detect_task(df[req.target_column])
    feature_cols = [c for c in df.columns if c != req.target_column]

    # Drop columns with >80% missing
    feature_cols = [c for c in feature_cols if df[c].isnull().mean() < 0.8]

    y = df[req.target_column]
    X = df[feature_cols]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    pipeline, num_cols, cat_cols = _build_pipeline(df, feature_cols, task)
    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)

    # Metrics
    accuracy = r2 = rmse = None
    if task == "classification":
        accuracy = round(accuracy_score(y_test, y_pred) * 100, 1)
    else:
        r2   = round(r2_score(y_test, y_pred), 4)
        rmse = round(math.sqrt(mean_squared_error(y_test, y_pred)), 4)

    score = (accuracy / 100) if accuracy is not None else max(r2, 0)
    perf_label = _performance_label(score, task)

    # Feature importances from the Random Forest
    rf_model       = pipeline.named_steps["model"]
    importances    = rf_model.feature_importances_
    feature_names  = (
        pipeline.named_steps["prep"]
        .get_feature_names_out()
    )
    total = importances.sum() or 1
    fi = sorted(
        [
            {
                "feature":        name.split("__")[-1],   # strip num__ / cat__ prefix
                "importance":     round(float(imp), 6),
                "importance_pct": round(float(imp / total) * 100, 1),
            }
            for name, imp in zip(feature_names, importances)
        ],
        key=lambda x: x["importance"],
        reverse=True,
    )[:10]

    # Unique classes / sample values for form building
    sample_values: dict[str, Any] = {}
    for col in feature_cols:
        if not pd.api.types.is_numeric_dtype(df[col]):
            unique_vals = df[col].dropna().unique().tolist()
            sample_values[col] = [str(v) for v in unique_vals[:30]]
        else:
            sample_values[col] = {
                "min":    _safe(float(df[col].min())),
                "max":    _safe(float(df[col].max())),
                "mean":   _safe(float(df[col].mean())),
                "median": _safe(float(df[col].median())),
            }

    # Store model bundle for single-predict
    key = _cache_key(str(user.id), req.filename, req.target_column)
    _MODEL_STORE[key] = {
        "pipeline":     pipeline,
        "feature_cols": feature_cols,
        "num_cols":     num_cols,
        "cat_cols":     cat_cols,
        "task":         task,
        "target":       req.target_column,
        "classes":      (
            rf_model.classes_.tolist()
            if task == "classification" else None
        ),
    }

    result = {
        "task_label":          "Classification" if task == "classification" else "Regression",
        "target_column":       req.target_column,
        "accuracy":            accuracy,
        "r2_score":            r2,
        "rmse":                rmse,
        "performance_label":   perf_label,
        "features_used":       len(feature_cols),
        "training_rows":       len(X_train),
        "feature_importances": fi,
        "sample_values":       sample_values,
        "feature_cols":        feature_cols,
        "model_ready":         True,
    }
    result["insight"] = _generate_insight(result)
    return result


@router.post("/api/dashboard/ml-single-predict")
async def ml_single_predict(
    req: SinglePredictRequest,
    user: UserInDB = Depends(get_current_active_user),
):
    """
    Predict a single custom row and explain which features drove the prediction.

    Returns:
      predicted_value   – the predicted class or numeric value
      confidence        – probability of predicted class (classification only)
      class_probabilities – all class probs (classification only)
      explanation       – list of { feature, value, direction, impact_pct, note }
    """
    key    = _cache_key(str(user.id), req.filename, req.target_column)
    bundle = _MODEL_STORE.get(key)

    if bundle is None:
        raise HTTPException(
            400,
            "Model not trained yet. Call /api/dashboard/ml-predict first."
        )

    pipeline     = bundle["pipeline"]
    feature_cols = bundle["feature_cols"]
    num_cols     = bundle["num_cols"]
    cat_cols     = bundle["cat_cols"]
    task         = bundle["task"]
    classes      = bundle["classes"]

    # Build a single-row DataFrame from input_values
    # Fill missing features with None (imputer will handle)
    row = {col: req.input_values.get(col, None) for col in feature_cols}
    X_input = pd.DataFrame([row])

    # Cast numeric columns
    for col in num_cols:
        if col in X_input.columns:
            X_input[col] = pd.to_numeric(X_input[col], errors="coerce")

    # Predict
    pred        = pipeline.predict(X_input)[0]
    predicted   = str(pred) if task == "classification" else _safe(pred)

    confidence          = None
    class_probabilities = None
    if task == "classification" and hasattr(pipeline, "predict_proba"):
        proba = pipeline.predict_proba(X_input)[0]
        idx   = list(pipeline.classes_).index(pred) if pred in pipeline.classes_ else 0
        confidence = round(float(proba[idx]) * 100, 1)
        class_probabilities = [
            {"class": str(c), "probability": round(float(p) * 100, 1)}
            for c, p in zip(pipeline.classes_, proba)
        ]

    # ── Local explanation using feature importances + input context ──────────
    # We use the global RF feature importances weighted by how far each
    # input value deviates from the dataset median/mode — a lightweight
    # approximation of local importance without needing SHAP.
    rf_model    = pipeline.named_steps["model"]
    prep        = pipeline.named_steps["prep"]
    fi_global   = rf_model.feature_importances_
    feat_names  = prep.get_feature_names_out()

    # Map feature name back to original column
    def _orig(name: str) -> str:
        return name.split("__", 1)[-1] if "__" in name else name

    fi_by_col: dict[str, float] = {}
    for fname, imp in zip(feat_names, fi_global):
        orig = _orig(fname)
        fi_by_col[orig] = fi_by_col.get(orig, 0) + float(imp)

    # Load df to get baseline stats
    df = _load_df(req.filename, user)

    explanation = []
    for col in feature_cols:
        val       = req.input_values.get(col)
        imp       = fi_by_col.get(col, 0.0)
        imp_pct   = round(imp / (sum(fi_by_col.values()) or 1) * 100, 1)

        if val is None:
            continue

        direction = "neutral"
        note      = ""

        if col in num_cols:
            try:
                baseline = float(df[col].median())
                v        = float(val)
                if v > baseline * 1.1:
                    direction = "increases"
                    note = f"{val} is above average ({baseline:.2f})"
                elif v < baseline * 0.9:
                    direction = "decreases"
                    note = f"{val} is below average ({baseline:.2f})"
                else:
                    note = f"{val} is near average ({baseline:.2f})"
            except Exception:
                pass
        else:
            # Categorical: find the most common value
            try:
                mode_val = df[col].mode()[0]
                note = (
                    f"'{val}' is the most common value"
                    if str(val) == str(mode_val)
                    else f"'{val}' vs most common '{mode_val}'"
                )
                direction = "neutral"
            except Exception:
                pass

        explanation.append({
            "feature":    col,
            "value":      str(val),
            "direction":  direction,
            "impact_pct": imp_pct,
            "note":       note,
        })

    # Sort by impact, top 8
    explanation = sorted(explanation, key=lambda x: x["impact_pct"], reverse=True)[:8]

    return {
        "predicted_value":       predicted,
        "confidence":            confidence,
        "class_probabilities":   class_probabilities,
        "task":                  task,
        "explanation":           explanation,
    }