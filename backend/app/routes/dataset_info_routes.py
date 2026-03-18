from fastapi import APIRouter, HTTPException, Depends
import pandas as pd

from app.services.filter_service import load_dataset_user
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB

router = APIRouter()


@router.get("/dataset-info/{filename}")
async def get_dataset_info(filename: str, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = load_dataset_user(current_user.id, filename)

        column_info = {}
        for col in df.columns:
            series = df[col]
            dtype = str(series.dtype)
            non_null_count = int(series.notna().sum())
            unique_values = series.dropna().astype(str).unique()[:50].tolist()
            is_numeric = pd.api.types.is_numeric_dtype(series)

            min_val = max_val = None
            if is_numeric and non_null_count > 0:
                min_val = float(series.min())
                max_val = float(series.max())

            column_info[col] = {
                "dtype": dtype,
                "is_numeric": is_numeric,
                "non_null_count": non_null_count,
                "unique_values": unique_values,
                "unique_count": len(unique_values),
                "min_value": min_val,
                "max_value": max_val,
            }

        return {
            "filename": filename,
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "columns": column_info,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get dataset info: {str(e)}")
