from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import pandas as pd
import numpy as np

from app.core.config import UPLOAD_DIR, TEMP_DIR
from app.services.dataset_service import add_cleaned_version
from app.utils.auth_utils import get_current_active_user
from app.models.user_model import UserInDB
from app.utils.paths import user_files_dir, user_cleaned_dir, ensure_dir

router = APIRouter()


class DaxSettings(BaseModel):
    min_queries: int = 20
    max_queries: int = 30
    preview_limit: int = 100


class DaxRequest(BaseModel):
    filename: str
    settings: Optional[DaxSettings] = None


class DaxItem(BaseModel):
    title: str
    description: str
    dax: str


class DaxResponse(BaseModel):
    message: str
    count: int
    queries: List[DaxItem]
    new_file: Optional[str] = None


def _load_dataframe_for_processing_user(filename: str, current_user: UserInDB) -> pd.DataFrame:
    files_dir = user_files_dir(current_user.id)
    cleaned_dir = user_cleaned_dir(current_user.id)
    ensure_dir(files_dir)
    ensure_dir(cleaned_dir)
    file_path = files_dir / filename
    if not file_path.exists():
        temp_path = cleaned_dir / filename
        if temp_path.exists():
            file_path = temp_path
        else:
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found")
    ext = file_path.suffix.lower()
    try:
        if ext == ".csv":
            for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                try:
                    return pd.read_csv(file_path, encoding=encoding)
                except UnicodeDecodeError:
                    continue
            raise HTTPException(status_code=400, detail="Could not decode CSV file")
        elif ext in [".xlsx", ".xls"]:
            return pd.read_excel(file_path, engine="openpyxl")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")


def _sanitize_table_name(name: str) -> str:
    base = os.path.splitext(os.path.basename(name))[0]
    base = ''.join(ch if ch.isalnum() or ch=='_' else '_' for ch in base)
    return base or 'Table'


def _profile_dataframe_for_dax(df: pd.DataFrame) -> Dict[str, Any]:
    info: Dict[str, Any] = {
        'numeric': df.select_dtypes(include=[np.number]).columns.tolist(),
        'datetime': [],
        'categorical': df.select_dtypes(include=['object', 'category']).columns.tolist(),
        'all': df.columns.tolist(),
    }
    import warnings
    from pandas.api.types import is_datetime64_any_dtype, is_object_dtype
    date_name_hints = ("date", "time", "timestamp", "year", "month", "day")
    for c in df.columns:
        s = df[c]
        if is_datetime64_any_dtype(s):
            info['datetime'].append(c)
            continue
        if is_object_dtype(s) and any(h in c.lower() for h in date_name_hints):
            sample = s.dropna().astype(str).head(200)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                maybe = pd.to_datetime(sample, errors='coerce')
            ok_ratio = (~maybe.isna()).mean() if len(sample) else 0
            if ok_ratio >= 0.6:
                info['datetime'].append(c)
    return info


def _generate_dax_queries(table: str, prof: Dict[str, Any], min_q: int, max_q: int) -> List[DaxItem]:
    items: List[DaxItem] = []
    num = prof['numeric']
    cat = prof['categorical']
    dt = prof['datetime']
    for col in num[:5]:
        items.append(DaxItem(title=f"Total {col}", description=f"Sum of {col}", dax=f"Total {col} = SUM('{table}'[{col}])"))
        items.append(DaxItem(title=f"Average {col}", description=f"Average of {col}", dax=f"Average {col} = AVERAGE('{table}'[{col}])"))
        items.append(DaxItem(title=f"Count {col}", description=f"Count of {col}", dax=f"Count {col} = COUNT('{table}'[{col}])"))
        items.append(DaxItem(title=f"Distinct {col}", description=f"Distinct count of {col}", dax=f"Distinct {col} = DISTINCTCOUNT('{table}'[{col}])"))
    for col in cat[:3]:
        items.append(DaxItem(title=f"{col} Length", description=f"Length of text in {col}", dax=f"{col} Length = LEN('{table}'[{col}])"))
        items.append(DaxItem(title=f"{col} Upper", description=f"Uppercase of {col}", dax=f"{col} Upper = UPPER('{table}'[{col}])"))
    date_col = dt[0] if dt else None
    if date_col:
        items.append(DaxItem(title=f"YTD {date_col}", description="Year-to-date total for first numeric column", dax=f"YTD = TOTALYTD(SUM('{table}'[{num[0]}]), '{table}'[{date_col}])" if num else f"YTD = BLANK()"))
        items.append(DaxItem(title=f"MTD {date_col}", description="Month-to-date total", dax=f"MTD = TOTALMTD(SUM('{table}'[{num[0]}]), '{table}'[{date_col}])" if num else f"MTD = BLANK()"))
        items.append(DaxItem(title=f"QTD {date_col}", description="Quarter-to-date total", dax=f"QTD = TOTALQTD(SUM('{table}'[{num[0]}]), '{table}'[{date_col}])" if num else f"QTD = BLANK()"))
        items.append(DaxItem(title="Same Period Last Year", description="Compare last year same period", dax=f"SPLY = CALCULATE(SUM('{table}'[{num[0]}]), SAMEPERIODLASTYEAR('{table}'[{date_col}]))" if num else f"SPLY = BLANK()"))
        items.append(DaxItem(title="Running Total", description="Cumulative sum over time", dax=f"Running Total = CALCULATE(SUM('{table}'[{num[0]}]), FILTER(ALLSELECTED('{table}'[{date_col}]), '{table}'[{date_col}] <= MAX('{table}'[{date_col}])))" if num else f"Running Total = BLANK()"))
    if num:
        items.append(DaxItem(title=f"{num[0]} % of Total", description="Contribution to total", dax=f"{num[0]} % of Total = DIVIDE(SUM('{table}'[{num[0]}]), CALCULATE(SUM('{table}'[{num[0]}]), ALL('{table}')))"))
        items.append(DaxItem(title=f"Rank by {num[0]}", description="Ranking based on measure", dax=f"Rank by {num[0]} = RANKX(ALL('{table}'), SUM('{table}'[{num[0]}]),, DESC, Dense)"))
        items.append(DaxItem(title=f"Top 5 by {num[0]}", description="Top 5 records by value", dax=f"Top 5 by {num[0]} = CALCULATETABLE(TOPN(5, ALLSELECTED('{table}'), SUM('{table}'[{num[0]}]), DESC))"))
    if num and cat:
        items.append(DaxItem(title="High/Low Flag", description="Flag high vs low values", dax=f"High/Low Flag = IF(SUM('{table}'[{num[0]}]) > AVERAGE('{table}'[{num[0]}]), \"High\", \"Low\")"))
    items.append(DaxItem(title="Filter Example", description="Measure filtered by a category", dax=f"Filtered Measure = CALCULATE(SUM('{table}'[{num[0]}]), '{table}'[{cat[0]}] = \"SomeValue\")" if num and cat else "Filtered Measure = BLANK()"))
    items.append(DaxItem(title="Switch Example", description="Bucketize values using SWITCH", dax=f"Bucket = SWITCH(TRUE(), SUM('{table}'[{num[0]}])>1000, \"High\", SUM('{table}'[{num[0]}])>500, \"Medium\", \"Low\")" if num else "Bucket = BLANK()"))
    target = max(min(max_q, 35), min_q)
    if len(items) < min_q:
        for c in prof['all']:
            items.append(DaxItem(title=f"Count of {c}", description="Generic column count", dax=f"Count of {c} = COUNTROWS(FILTER('{table}', NOT(ISBLANK('{table}'[{c}]))) )"))
            if len(items) >= min_q:
                break
    return items[:target]


def _export_dax_report(filename_base: str, items: List[DaxItem], cleaned_dir: str) -> str:
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import cm
        out_name = f"dax_queries_{filename_base}_{timestamp}.pdf"
        out_path = os.path.join(cleaned_dir, out_name)
        c = canvas.Canvas(out_path, pagesize=A4)
        width, height = A4
        y = height - 2*cm
        c.setFont("Helvetica-Bold", 16)
        c.drawString(2*cm, y, "DAX Queries Report")
        y -= 1*cm
        c.setFont("Helvetica", 10)
        for i, it in enumerate(items, 1):
            block = [f"{i}. {it.title}", it.description, it.dax]
            for line in block:
                for chunk in [line[j:j+100] for j in range(0, len(line), 100)]:
                    if y < 2*cm:
                        c.showPage(); y = height - 2*cm; c.setFont("Helvetica", 10)
                    c.drawString(2*cm, y, chunk)
                    y -= 0.6*cm
            y -= 0.4*cm
        c.save()
        return out_name
    except Exception:
        out_name = f"dax_queries_{filename_base}_{timestamp}.txt"
        out_path = os.path.join(cleaned_dir, out_name)
        try:
            with open(out_path, 'w', encoding='utf-8') as f:
                f.write("DAX Queries Report\n\n")
                for i, it in enumerate(items, 1):
                    f.write(f"{i}. {it.title}\n")
                    f.write(f"{it.description}\n")
                    f.write(f"{it.dax}\n\n")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to export DAX report: {e}")
        return out_name


class DaxMeasuresSettings(BaseModel):
    min_measures: int = 20
    max_measures: int = 100
    preview_limit: int = 100


class DaxMeasuresRequest(BaseModel):
    filename: str
    settings: Optional[DaxMeasuresSettings] = None


class DaxMeasuresResponse(BaseModel):
    message: str
    count: int
    measures: List[DaxItem]
    new_file: Optional[str] = None


def _generate_dax_measures(table: str, prof: Dict[str, Any], settings: DaxMeasuresSettings) -> List[DaxItem]:
    import random
    items: List[DaxItem] = []
    num = prof['numeric']
    cat = prof['categorical']
    dt = prof['datetime']
    for col in num[:8]:
        items.extend([
            DaxItem(title=f"Total {col}", description=f"Sum of {col}", dax=f"Total {col} = SUM('{table}'[{col}])"),
            DaxItem(title=f"Average {col}", description=f"Average of {col}", dax=f"Average {col} = AVERAGE('{table}'[{col}])"),
            DaxItem(title=f"Min {col}", description=f"Minimum of {col}", dax=f"Min {col} = MIN('{table}'[{col}])"),
            DaxItem(title=f"Max {col}", description=f"Maximum of {col}", dax=f"Max {col} = MAX('{table}'[{col}])"),
            DaxItem(title=f"Count {col}", description=f"Count of {col}", dax=f"Count {col} = COUNT('{table}'[{col}])"),
            DaxItem(title=f"Distinct {col}", description=f"Distinct count of {col}", dax=f"Distinct {col} = DISTINCTCOUNT('{table}'[{col}])"),
        ])
    if dt and num:
        d = dt[0]; m = num[0]
        items.extend([
            DaxItem(title=f"{m} YTD", description="Year-to-date total", dax=f"{m} YTD = TOTALYTD(SUM('{table}'[{m}]), '{table}'[{d}])"),
            DaxItem(title=f"{m} MTD", description="Month-to-date total", dax=f"{m} MTD = TOTALMTD(SUM('{table}'[{m}]), '{table}'[{d}])"),
            DaxItem(title=f"{m} QTD", description="Quarter-to-date total", dax=f"{m} QTD = TOTALQTD(SUM('{table}'[{m}]), '{table}'[{d}])"),
            DaxItem(title=f"{m} YoY Growth %", description="Year-over-year growth percentage", dax=f"{m} YoY Growth % = DIVIDE( (CALCULATE(SUM('{table}'[{m}])) - CALCULATE(SUM('{table}'[{m}]), SAMEPERIODLASTYEAR('{table}'[{d}]))) , CALCULATE(SUM('{table}'[{m}]), SAMEPERIODLASTYEAR('{table}'[{d}])) )"),
            DaxItem(title=f"{m} 3M Rolling Avg", description="3-month rolling average", dax=f"{m} 3M Rolling Avg = AVERAGEX(DATESINPERIOD('{table}'[{d}], MAX('{table}'[{d}]), -3, MONTH), CALCULATE(SUM('{table}'[{m}])))"),
        ])
    name_map = {c.lower(): c for c in prof['all']}
    revenue = next((name_map[k] for k in name_map if 'revenue' in k or 'sales' in k or 'amount' in k), num[0] if num else None)
    cost = next((name_map[k] for k in name_map if 'cost' in k or 'expense' in k), None)
    qty = next((name_map[k] for k in name_map if 'qty' in k or 'quantity' in k or 'units' in k), None)
    if revenue and num:
        items.append(DaxItem(title="Contribution %", description="Measure contribution to total revenue", dax=f"Contribution % = DIVIDE(SUM('{table}'[{revenue}]), CALCULATE(SUM('{table}'[{revenue}]), ALL('{table}')))"))
    if revenue and cost:
        items.append(DaxItem(title="Profit", description="Revenue minus cost", dax=f"Profit = SUM('{table}'[{revenue}]) - SUM('{table}'[{cost}])"))
        items.append(DaxItem(title="Profit Margin %", description="Profit as a percentage of revenue", dax=f"Profit Margin % = DIVIDE([Profit], SUM('{table}'[{revenue}]))"))
    if qty and revenue:
        items.append(DaxItem(title="Avg Price", description="Revenue per unit", dax=f"Avg Price = DIVIDE(SUM('{table}'[{revenue}]), SUM('{table}'[{qty}]))"))
    if num:
        measure = revenue or num[0]
        items.append(DaxItem(title=f"Rank by {measure}", description="Rank entities by a measure", dax=f"Rank by {measure} = RANKX(ALL('{table}'), SUM('{table}'[{measure}]),, DESC, Dense)"))
        items.append(DaxItem(title=f"Top 10 by {measure}", description="Top 10 entities by measure", dax=f"Top 10 by {measure} = CALCULATETABLE(TOPN(10, ALL('{table}'), SUM('{table}'[{measure}]), DESC))"))
        base = num[0]
        items.append(DaxItem(title="Above Avg Flag", description="Flag above-average rows", dax=f"Above Avg Flag = IF(SUM('{table}'[{base}]) > AVERAGE('{table}'[{base}]), 1, 0)"))
        if cat:
            items.append(DaxItem(title="Filter by Category Example", description="Filtered measure using CALCULATE/FILTER", dax=f"Filter by Category Example = CALCULATE(SUM('{table}'[{base}]), FILTER(ALL('{table}'), '{table}'[{cat[0]}] = \"SomeValue\"))"))
        items.append(DaxItem(title="Buckets via SWITCH", description="Categorize values with SWITCH(TRUE())", dax=f"Buckets via SWITCH = SWITCH(TRUE(), SUM('{table}'[{base}])>1000, \"High\", SUM('{table}'[{base}])>500, \"Medium\", \"Low\")"))
    target = max(20, min(100, settings.max_measures))
    target = max(settings.min_measures, target)
    rand_target = __import__('random').randint(settings.min_measures, target)
    seen = set()
    unique_items: List[DaxItem] = []
    for it in items:
        if it.title not in seen:
            unique_items.append(it)
            seen.add(it.title)
        if len(unique_items) >= rand_target:
            break
    i = 0
    while len(unique_items) < rand_target and i < len(num):
        col = num[i]
        candidate = DaxItem(title=f"StdDev {col}", description=f"Standard deviation of {col}", dax=f"StdDev {col} = STDEV.P('{table}'[{col}])")
        if candidate.title not in seen:
            unique_items.append(candidate)
            seen.add(candidate.title)
        i += 1
    return unique_items


@router.post("/api/dax/generate")
async def dax_generate(request: DaxRequest, current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or DaxSettings()
        table = _sanitize_table_name(request.filename)
        prof = _profile_dataframe_for_dax(df)
        items = _generate_dax_queries(table, prof, settings.min_queries, settings.max_queries)
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(cleaned_dir)
        pdf_file = _export_dax_report(os.path.splitext(os.path.basename(request.filename))[0], items, str(cleaned_dir))
        preview_n = max(1, settings.preview_limit)
        # Register generated report
        try:
            await add_cleaned_version(current_user.id, request.filename, pdf_file)
        except Exception:
            pass

        return DaxResponse(
            message="DAX queries generated",
            count=len(items),
            queries=items[:preview_n],
            new_file=pdf_file,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating DAX queries: {str(e)}")


@router.post("/api/dax/measures")
async def dax_measures(request: 'DaxMeasuresRequest', current_user: UserInDB = Depends(get_current_active_user)):
    try:
        df = _load_dataframe_for_processing_user(request.filename, current_user)
        settings = request.settings or DaxMeasuresSettings()
        table = _sanitize_table_name(request.filename)
        prof = _profile_dataframe_for_dax(df)
        items = _generate_dax_measures(table, prof, settings)
        cleaned_dir = user_cleaned_dir(current_user.id)
        ensure_dir(cleaned_dir)
        report_file = _export_dax_report(os.path.splitext(os.path.basename(request.filename))[0], items, str(cleaned_dir))
        preview_n = max(1, settings.preview_limit)
        # Register generated report
        try:
            await add_cleaned_version(current_user.id, request.filename, report_file)
        except Exception:
            pass

        return DaxMeasuresResponse(
            message="DAX measures generated",
            count=len(items),
            measures=items[:preview_n],
            new_file=report_file,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating DAX measures: {str(e)}")


class DaxMeasuresSettings(BaseModel):
    min_measures: int = 20
    max_measures: int = 100
    preview_limit: int = 20


class DaxMeasuresRequest(BaseModel):
    filename: str
    settings: Optional[DaxMeasuresSettings] = None


class DaxMeasuresResponse(BaseModel):
    message: str
    count: int
    measures: List[DaxItem]
    new_file: Optional[str] = None
