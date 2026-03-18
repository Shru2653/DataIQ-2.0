"""
Drift Detection Service

Compares two datasets (previous / baseline vs. current) to detect:
  1. New columns added
  2. Columns removed
  3. Data-type changes on shared columns
  4. Numeric distribution drift via the Kolmogorov-Smirnov two-sample test
"""

import numpy as np
import pandas as pd
from scipy import stats
from typing import Any, Dict, List


# ─── Schema change detection ──────────────────────────────────────────────────

def detect_schema_changes(
    df_prev: pd.DataFrame,
    df_curr: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Identify structural differences between two DataFrames.

    Returns
    -------
    dict with keys:
        new_columns      – columns present in *current* but absent in *previous*
        removed_columns  – columns present in *previous* but absent in *current*
        type_changes     – list of {column, previous_type, current_type} dicts
                           for every shared column whose pandas dtype changed
    """
    prev_cols: set = set(df_prev.columns)
    curr_cols: set = set(df_curr.columns)

    new_columns: List[str] = sorted(curr_cols - prev_cols)
    removed_columns: List[str] = sorted(prev_cols - curr_cols)

    type_changes: List[Dict[str, str]] = []
    for col in sorted(prev_cols & curr_cols):
        prev_type = str(df_prev[col].dtype)
        curr_type = str(df_curr[col].dtype)
        if prev_type != curr_type:
            type_changes.append(
                {
                    "column": col,
                    "previous_type": prev_type,
                    "current_type": curr_type,
                }
            )

    return {
        "new_columns": new_columns,
        "removed_columns": removed_columns,
        "type_changes": type_changes,
    }


# ─── Drift detection ──────────────────────────────────────────────────────────

def detect_numeric_drift(
    df_prev: pd.DataFrame,
    df_curr: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """
    Run a Kolmogorov-Smirnov two-sample test on every numeric column that
    appears in *both* datasets.

    Status mapping
    --------------
    stable          p_value >= 0.05                          (no significant drift)
    warning         p_value <  0.05 AND ks_statistic <  0.3 (moderate drift)
    drift_detected  p_value <  0.05 AND ks_statistic >= 0.3 (high drift)

    Results are sorted: drift_detected → warning → stable,
    then by descending drift_score within each tier.
    """
    prev_numeric: set = set(df_prev.select_dtypes(include=[np.number]).columns)
    curr_numeric: set = set(df_curr.select_dtypes(include=[np.number]).columns)
    common_numeric: List[str] = sorted(prev_numeric & curr_numeric)

    results: List[Dict[str, Any]] = []

    for col in common_numeric:
        prev_vals = df_prev[col].dropna().to_numpy(dtype=float)
        curr_vals = df_curr[col].dropna().to_numpy(dtype=float)

        # KS test requires at least 2 observations in each sample
        if len(prev_vals) < 2 or len(curr_vals) < 2:
            continue

        try:
            ks_stat, p_value = stats.ks_2samp(prev_vals, curr_vals)
        except Exception:
            continue

        ks_stat = float(ks_stat)
        p_value = float(p_value)

        if p_value >= 0.05:
            status = "stable"
        elif ks_stat >= 0.3:
            status = "drift_detected"
        else:
            status = "warning"

        results.append(
            {
                "column": col,
                "drift_score": round(ks_stat, 4),
                "p_value": round(p_value, 4),
                "status": status,
            }
        )

    # Sort: highest severity first, then by descending drift_score
    _order = {"drift_detected": 0, "warning": 1, "stable": 2}
    results.sort(key=lambda r: (_order.get(r["status"], 3), -r["drift_score"]))

    return results


# ─── Top-level entry point ────────────────────────────────────────────────────

def run_drift_analysis(
    df_prev: pd.DataFrame,
    df_curr: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Run the complete drift and schema-change analysis.

    Parameters
    ----------
    df_prev : baseline / previous DataFrame
    df_curr : current / new DataFrame

    Returns
    -------
    {
        "schema_changes": {
            "new_columns":     [...],
            "removed_columns": [...],
            "type_changes":    [{column, previous_type, current_type}, ...]
        },
        "drift_results": [
            {column, drift_score, p_value, status}, ...
        ],
        "summary": {
            "total_columns_checked": int,
            "drifted_columns":       int,
            "warning_columns":       int,
            "stable_columns":        int,
            "schema_changes_count":  int
        }
    }
    """
    schema_changes = detect_schema_changes(df_prev, df_curr)
    drift_results = detect_numeric_drift(df_prev, df_curr)

    drifted = sum(1 for r in drift_results if r["status"] == "drift_detected")
    warnings = sum(1 for r in drift_results if r["status"] == "warning")
    stable = sum(1 for r in drift_results if r["status"] == "stable")

    schema_changes_count = (
        len(schema_changes["new_columns"])
        + len(schema_changes["removed_columns"])
        + len(schema_changes["type_changes"])
    )

    summary = {
        "total_columns_checked": len(drift_results),
        "drifted_columns": drifted,
        "warning_columns": warnings,
        "stable_columns": stable,
        "schema_changes_count": schema_changes_count,
    }

    return {
        "schema_changes": schema_changes,
        "drift_results": drift_results,
        "summary": summary,
    }
