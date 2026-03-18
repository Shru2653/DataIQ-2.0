from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import pandas as pd

from app.services.filter_service import (
    load_dataset_user,
    apply_range_filters,
    apply_value_filters,
    apply_category_filters,
    apply_text_search_filters,
    apply_pagination,
    apply_column_selection,
)
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB

router = APIRouter()


class RangeFilter(BaseModel):
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class ValueFilter(BaseModel):
    values: List[str]


class TextSearchFilter(BaseModel):
    search_term: str
    case_sensitive: Optional[bool] = False


class FilterRequest(BaseModel):
    filename: str
    column_selection: Optional[List[str]] = None
    value_filters: Optional[Dict[str, ValueFilter]] = None
    range_filters: Optional[Dict[str, RangeFilter]] = None
    category_filters: Optional[Dict[str, List[str]]] = None
    text_search_filters: Optional[Dict[str, TextSearchFilter]] = None
    limit: Optional[int] = 1000
    offset: Optional[int] = 0


@router.post("/apply-filters")
async def apply_filters(filter_request: FilterRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = load_dataset_user(current_user.id, filter_request.filename)
        original_row_count = len(df)

        df = apply_range_filters(df, (filter_request.range_filters or {}))
        df = apply_value_filters(df, (filter_request.value_filters or {}))
        df = apply_category_filters(df, (filter_request.category_filters or {}))
        df = apply_text_search_filters(df, (filter_request.text_search_filters or {}))

        filtered_row_count = len(df)

        df = apply_pagination(df, filter_request.limit or 1000, filter_request.offset or 0)
        df = apply_column_selection(df, filter_request.column_selection or list(df.columns))

        df_clean = df.fillna("")
        records = df_clean.to_dict(orient="records")
        columns = list(df_clean.columns)

        return {
            "success": True,
            "data": {
                "columns": columns,
                "rows": records,
                "pagination": {
                    "total_rows_original": original_row_count,
                    "total_rows_filtered": filtered_row_count,
                    "rows_returned": len(records),
                    "offset": filter_request.offset or 0,
                    "limit": filter_request.limit or 1000,
                },
            },
            "filters_applied": {
                "column_selection": bool(filter_request.column_selection),
                "range_filters": len(filter_request.range_filters or {}),
                "value_filters": len(filter_request.value_filters or {}),
                "category_filters": len(filter_request.category_filters or {}),
                "text_search_filters": len(filter_request.text_search_filters or {}),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error while applying filters: {str(e)}")
