"""
Cleaning Recommendations Service

Analyzes datasets and generates actionable recommendations for fixing
data quality issues including missing values, duplicates, invalid dates,
high null columns, and mixed data types.
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional


def detect_missing_values(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detect columns with missing values and generate recommendations.

    Returns recommendations for filling missing values based on data type:
    - Numeric columns: suggest median fill
    - Categorical columns: suggest mode or forward fill
    - High missing %: suggest dropping column
    """
    recommendations = []

    for col in df.columns:
        missing_count = df[col].isnull().sum()

        if missing_count > 0:
            total_rows = len(df)
            missing_percent = round((missing_count / total_rows) * 100, 2)

            # Determine severity based on missing percentage
            if missing_percent > 50:
                severity = "high"
                recommendation = f"Consider dropping this column (>{missing_percent}% missing)"
            elif missing_percent > 20:
                severity = "medium"
                # Suggest fill strategy based on data type
                if pd.api.types.is_numeric_dtype(df[col]):
                    recommendation = f"Fill {missing_count} missing values using median"
                else:
                    recommendation = f"Fill {missing_count} missing values using forward fill or mode"
            else:
                severity = "low"
                if pd.api.types.is_numeric_dtype(df[col]):
                    recommendation = f"Fill {missing_count} missing values using mean or median"
                else:
                    recommendation = f"Fill {missing_count} missing values using mode or forward fill"

            recommendations.append({
                "issue": f"Missing values in '{col}' column ({missing_count} missing, {missing_percent}%)",
                "severity": severity,
                "recommendation": recommendation,
                "column": col,
                "affected_rows": missing_count,
                "action_type": "fill_missing"
            })

    return recommendations


def detect_duplicates(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detect duplicate rows and generate recommendations.

    Excludes ID-like columns from duplicate detection to avoid false negatives.
    """
    recommendations = []

    # Exclude ID columns
    all_cols = df.columns.tolist()
    id_like_columns = ['id', 'ID', 'Id', '_id', 'index', 'INDEX', 'Index']
    subset_cols = [col for col in all_cols if col not in id_like_columns]

    if not subset_cols:
        subset_cols = None

    # Count duplicates
    duplicate_mask = df.duplicated(subset=subset_cols, keep=False)
    duplicate_count = int(duplicate_mask.sum())

    if duplicate_count > 0:
        total_rows = len(df)
        duplicate_percent = round((duplicate_count / total_rows) * 100, 2)

        # Determine severity
        if duplicate_percent > 10:
            severity = "high"
        elif duplicate_percent > 5:
            severity = "medium"
        else:
            severity = "low"

        recommendations.append({
            "issue": f"Duplicate rows detected ({duplicate_count} rows, {duplicate_percent}%)",
            "severity": severity,
            "recommendation": "Remove duplicate rows, keeping the first occurrence",
            "affected_rows": duplicate_count,
            "action_type": "remove_duplicates"
        })

    return recommendations


def detect_invalid_dates(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detect invalid date formats in date-like columns.

    Identifies columns that appear to contain dates and checks for parsing failures.
    """
    recommendations = []

    # Check object/string columns for date-like content
    for col in df.select_dtypes(include=['object', 'string']).columns:
        series = df[col]

        # Skip if entirely null
        if series.isna().all():
            continue

        # Check if column looks like a date column
        col_lower = col.lower()
        has_date_keyword = any(kw in col_lower for kw in
            ['date', 'time', 'day', 'month', 'year', 'dob', 'birth', 'join', 'created', 'updated'])

        # Check sample values for date patterns
        sample_values = series.dropna().head(10).astype(str)
        has_date_pattern = False

        for val in sample_values:
            if any(sep in val for sep in ['-', '/', '.']) and any(c.isdigit() for c in val):
                has_date_pattern = True
                break

        if not (has_date_keyword or has_date_pattern):
            continue

        # Count invalid dates
        invalid_count = 0
        for val in series.dropna():
            try:
                pd.to_datetime(val, errors='raise')
            except (ValueError, TypeError, pd.errors.OutOfBoundsDatetime):
                invalid_count += 1

        if invalid_count > 0:
            total_non_null = series.notna().sum()
            invalid_percent = round((invalid_count / total_non_null) * 100, 2) if total_non_null > 0 else 0

            # Determine severity
            if invalid_percent > 10:
                severity = "high"
                recommendation = f"Remove {invalid_count} rows with invalid dates or replace with null"
            elif invalid_percent > 5:
                severity = "medium"
                recommendation = f"Convert {invalid_count} invalid dates to standard format or set to null"
            else:
                severity = "low"
                recommendation = f"Fix or remove {invalid_count} invalid date entries"

            recommendations.append({
                "issue": f"Invalid date format in '{col}' column ({invalid_count} invalid entries)",
                "severity": severity,
                "recommendation": recommendation,
                "column": col,
                "affected_rows": invalid_count,
                "action_type": "fix_dates"
            })

    return recommendations


def detect_high_null_columns(df: pd.DataFrame, threshold: float = 50.0) -> List[Dict[str, Any]]:
    """
    Detect columns with high percentage of null values (>50% by default).

    These columns often provide little value and should be considered for removal.
    """
    recommendations = []

    total_rows = len(df)
    if total_rows == 0:
        return recommendations

    for col in df.columns:
        null_count = df[col].isnull().sum()
        null_percent = (null_count / total_rows) * 100

        if null_percent > threshold:
            recommendations.append({
                "issue": f"Column '{col}' has {null_percent:.1f}% null values",
                "severity": "high",
                "recommendation": f"Consider dropping this column as it has {null_count} null values out of {total_rows} rows",
                "column": col,
                "affected_rows": null_count,
                "action_type": "drop_column"
            })

    return recommendations


def detect_mixed_types(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detect columns with mixed data types (numeric and text).

    Identifies object columns where some values can be parsed as numeric
    but others cannot, indicating inconsistent data entry.
    """
    recommendations = []

    for col in df.select_dtypes(include=['object', 'string']).columns:
        series = df[col].dropna()

        if len(series) == 0:
            continue

        # Try converting to numeric
        numeric_converted = pd.to_numeric(series, errors='coerce')
        successful_conversions = numeric_converted.notna().sum()
        total_non_null = len(series)

        if total_non_null == 0:
            continue

        conversion_rate = successful_conversions / total_non_null

        # Flag if some but not all values are numeric (indicating mixed types)
        if 0.1 < conversion_rate < 0.9:
            failed_conversions = total_non_null - successful_conversions

            # Determine severity
            if conversion_rate > 0.7:
                severity = "medium"
                recommendation = f"Convert '{col}' to numeric type and handle {failed_conversions} non-numeric values"
            elif conversion_rate < 0.3:
                severity = "low"
                recommendation = f"Keep '{col}' as text or clean {successful_conversions} numeric entries to match text format"
            else:
                severity = "high"
                recommendation = f"Standardize '{col}' data type - {successful_conversions} numeric, {failed_conversions} text entries"

            recommendations.append({
                "issue": f"Mixed data types in '{col}' column ({conversion_rate*100:.1f}% numeric)",
                "severity": severity,
                "recommendation": recommendation,
                "column": col,
                "affected_rows": failed_conversions,
                "action_type": "fix_types"
            })

    return recommendations


def generate_recommendations(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Main function to analyze a dataset and generate all cleaning recommendations.

    Args:
        df: pandas DataFrame to analyze

    Returns:
        List of recommendation dictionaries with issue, severity, and recommendation fields
    """
    all_recommendations = []

    # Run all detection functions
    all_recommendations.extend(detect_duplicates(df))
    all_recommendations.extend(detect_high_null_columns(df))
    all_recommendations.extend(detect_invalid_dates(df))
    all_recommendations.extend(detect_mixed_types(df))
    all_recommendations.extend(detect_missing_values(df))

    # Sort by severity (high -> medium -> low)
    severity_order = {"high": 0, "medium": 1, "low": 2}
    all_recommendations.sort(key=lambda x: severity_order.get(x["severity"], 3))

    return all_recommendations


def get_recommendation_summary(recommendations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate a summary of recommendations by severity.

    Returns counts of high/medium/low severity issues.
    """
    summary = {
        "total": len(recommendations),
        "high": sum(1 for r in recommendations if r["severity"] == "high"),
        "medium": sum(1 for r in recommendations if r["severity"] == "medium"),
        "low": sum(1 for r in recommendations if r["severity"] == "low")
    }

    return summary
