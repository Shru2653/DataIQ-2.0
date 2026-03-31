import os
import io
import re
import glob
import base64
import warnings
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import seaborn as sns
from dotenv import load_dotenv

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

load_dotenv()

# ── Gemini setup (new google.genai SDK) ────────────────────────────────────────
_GEMINI_KEY   = os.getenv("GEMINI_API_KEY", "")
_genai_client = None
_GEMINI_MODEL = "gemini-2.0-flash"

if _GEMINI_KEY:
    try:
        from google import genai as _genai_sdk
        _genai_client = _genai_sdk.Client(api_key=_GEMINI_KEY)
    except Exception:
        _genai_client = None

def _call_gemini(prompt: str) -> str:
    """Single helper — calls new google.genai SDK with 15s timeout and retry."""
    if not _GEMINI_KEY or _genai_client is None:
        return (
            "⚠️ Gemini API key not configured.\n"
            "Add `GEMINI_API_KEY=your-key` to `backend/.env` and restart.\n"
            "Get a free key at https://aistudio.google.com/app/apikey"
        )
    import time
    import concurrent.futures

    for attempt in range(2):
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(
                    _genai_client.models.generate_content,
                    model=_GEMINI_MODEL,
                    contents=prompt,
                )
                resp = future.result(timeout=15)
            return resp.text.strip()
        except concurrent.futures.TimeoutError:
            return (
                "⏱️ Gemini took too long to respond.\n\n"
                "**Try built-in commands instead:**\n"
                "• `unique values in CustomerName` — list all customers\n"
                "• `group by category` — breakdown by category\n"
                "• `summary` — dataset overview\n"
                "• Or rephrase and try again"
            )
        except Exception as e:
            err = str(e)
            if "429" in err or "quota" in err.lower():
                if attempt < 1:
                    time.sleep(35)
                    continue
                return (
                    "⚠️ Gemini free tier quota exceeded.\n\n"
                    "• Wait a minute and try again\n"
                    "• Use built-in commands (summary, filter, chart, sort etc.)\n"
                    "• Upgrade at https://ai.dev/rate-limit"
                )
            return f"⚠️ Gemini error: {err}"
    return "⚠️ Gemini unavailable. Please try again shortly."


# ── Paths ──────────────────────────────────────────────────────────────────────
_BACKEND_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_FOLDER = os.path.join(_BACKEND_DIR, "static", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── Session store ─────────────────────────────────────────────────────────────
_sessions: dict = {}


# ═════════════════════════════════════════════════════════════════════════════
# FILE HELPERS
# ═════════════════════════════════════════════════════════════════════════════

def find_file_path(filename: str) -> str | None:
    direct = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(direct):
        return direct
    for sub in ("files", "cleaned"):
        m = glob.glob(os.path.join(UPLOAD_FOLDER, "*", sub, filename))
        if m:
            return m[0]
    m = glob.glob(os.path.join(UPLOAD_FOLDER, "**", filename), recursive=True)
    return m[0] if m else None


def load_df(path: str) -> pd.DataFrame:
    return pd.read_excel(path) if path.endswith((".xlsx", ".xls")) else pd.read_csv(path)


def save_uploaded_file(content: bytes, filename: str) -> str:
    path = os.path.join(UPLOAD_FOLDER, filename)
    with open(path, "wb") as f:
        f.write(content)
    return path


def get_or_load_session(session_id: str, filename: str | None) -> pd.DataFrame | None:
    sess = _sessions.get(session_id)
    if sess and sess.get("df") is not None:
        if not filename or filename == sess.get("filename"):
            return sess["df"]
    if not filename:
        return None
    path = find_file_path(filename)
    if not path:
        return None
    try:
        df = load_df(path)
        _sessions[session_id] = {
            "df":          df,
            "original_df": df.copy(),
            "filename":    filename,
            "last_column": None,
        }
        return df
    except Exception:
        return None


def get_original_df(session_id: str) -> pd.DataFrame | None:
    sess = _sessions.get(session_id, {})
    return sess.get("original_df")


# ═════════════════════════════════════════════════════════════════════════════
# INTENT DETECTION
# ═════════════════════════════════════════════════════════════════════════════

_INTENTS = {
    "summary":     ["summary", "overview", "describe", "info", "about", "what is"],
    "clean":       ["clean", "fix", "remove duplicate", "fill missing", "null", "nan", "duplicate"],
    "columns":     ["column", "columns", "fields", "field", "header", "headers", "list column"],
    "filter":      ["filter", "where", "show rows", "rows where", "find rows", "entries where", "records where"],
    "sort":        ["sort", "order by", "arrange", "rank by", "ranked by"],
    "topn":        ["top ", "top-", "bottom ", "lowest ", "highest ", "first ", "last "],
    "groupby":     ["group by", "grouped by", "groupby", "per ", "by each", "breakdown by", "split by"],
    "unique":      ["unique", "distinct", "different values", "value counts", "how many unique",
                    "categories in", "all customers", "all products", "all categories",
                    "list all", "give me all", "show all", "customer names", "product names"],
    "count":       ["count rows", "count where", "how many rows", "number of rows", "rows matching",
                    "how many products", "how many categories", "how many customers", "how many orders"],
    "correlation": ["correlation", "correlate", "relationship between", "correlated"],
    "median":      ["median"],
    "std":         ["std", "standard deviation", "variance"],
    "percentile":  ["percentile", "quantile", "75th", "25th", "90th"],
    "chart":       ["bar chart", "bar graph", "bar plot"],
    "pie":         ["pie chart", "pie graph", "pie plot", "pie"],
    "histogram":   ["histogram", "distribution of", "frequency of"],
    "scatter":     ["scatter", "scatter plot", "scatter chart", "vs ", " vs "],
    "heatmap":     ["heatmap", "heat map", "correlation map", "correlation chart"],
    "linechart":   ["line chart", "line graph", "line plot", "trend chart", "trend of", "trend over"],
    "total":       ["total", "sum of", "sum "],
    "average":     ["average", "mean of", "mean ", "avg"],
    "max":         ["max ", "maximum", "highest value", "largest"],
    "min":         ["min ", "minimum", "lowest value", "smallest"],
    "insights":    ["insight", "insights", "analyze", "analysis", "tell me about", "key findings"],
    "issues":      ["issue", "issues", "problem", "problems", "check", "quality", "errors"],
    "download":    ["download", "export", "save", "get csv", "get file"],
    "sample":      ["sample", "random rows", "show me some", "preview"],
    "reset":       ["reset", "restore", "original data", "undo clean"],
    "dtypes":      ["data type", "datatypes", "dtype", "types of column"],
    "sql":         ["select ", "query ", "sql ", "where clause", "fetch rows",
                    "give me rows", "show me records", "find all", "get all",
                    "retrieve", "pull rows", "nl query"],
}


def detect_intent(query: str) -> str:
    q = query.lower()
    for intent in ("sql",
                   "groupby", "filter", "topn", "correlation", "heatmap",
                   "histogram", "scatter", "linechart", "pie", "chart",
                   "sort", "unique", "count", "percentile", "median", "std",
                   "download", "reset", "sample", "dtypes",
                   "summary", "clean", "columns", "insights", "issues",
                   "total", "average", "max", "min"):
        if any(kw in q for kw in _INTENTS[intent]):
            return intent
    return "gemini"


# ═════════════════════════════════════════════════════════════════════════════
# COLUMN DETECTION
# ═════════════════════════════════════════════════════════════════════════════

def detect_column(df: pd.DataFrame, query: str) -> str | None:
    q = query.lower()
    cols = df.columns.tolist()
    for col in cols:
        if col.lower() == q:
            return col
    for col in cols:
        if col.lower() in q:
            return col
    words = [w for w in re.split(r"[\s,]+", q) if len(w) > 2]
    for col in cols:
        for w in words:
            if w in col.lower():
                return col
    return None


def detect_two_columns(df: pd.DataFrame, query: str) -> tuple[str | None, str | None]:
    q = query.lower()
    cols = df.columns.tolist()
    found = []
    for col in cols:
        if col.lower() in q and col not in found:
            found.append(col)
        if len(found) == 2:
            break
    if len(found) < 2:
        words = [w for w in re.split(r"[\s,]+", q) if len(w) > 2]
        for col in cols:
            for w in words:
                if w in col.lower() and col not in found:
                    found.append(col)
                    break
            if len(found) == 2:
                break
    c1 = found[0] if len(found) > 0 else None
    c2 = found[1] if len(found) > 1 else None
    return c1, c2


# ═════════════════════════════════════════════════════════════════════════════
# CHART HELPER
# ═════════════════════════════════════════════════════════════════════════════

_PALETTE = ["#4F8EF7", "#7C3AED", "#10B981", "#F59E0B", "#EF4444",
            "#06B6D4", "#EC4899", "#84CC16", "#F97316", "#6366F1"]


def _fig_to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def _style_ax(ax, title: str):
    ax.set_title(title, fontsize=13, fontweight="bold", pad=12)
    ax.grid(axis="y", linestyle="--", alpha=0.35)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_facecolor("#FAFAFA")


# ═════════════════════════════════════════════════════════════════════════════
# FEATURE FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════

def get_summary(df: pd.DataFrame) -> str:
    num_cols = df.select_dtypes(include="number").columns.tolist()
    cat_cols = df.select_dtypes(exclude="number").columns.tolist()
    lines = [
        "📊 **Dataset Summary**",
        f"• **Rows:** {len(df):,}",
        f"• **Columns:** {len(df.columns)}",
        f"• **Column names:** {', '.join(df.columns.tolist())}",
        f"• **Missing values:** {int(df.isnull().sum().sum()):,}",
        f"• **Duplicate rows:** {int(df.duplicated().sum()):,}",
    ]
    if num_cols:
        lines.append(f"• **Numeric columns:** {', '.join(num_cols)}")
    if cat_cols:
        lines.append(f"• **Categorical columns:** {', '.join(cat_cols)}")
    return "\n".join(lines)


def clean_data(df: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    before_rows    = len(df)
    before_missing = int(df.isnull().sum().sum())
    df = df.drop_duplicates()
    for col in df.select_dtypes(include="number").columns:
        df[col] = df[col].fillna(df[col].median())
    for col in df.select_dtypes(exclude="number").columns:
        mode = df[col].mode()
        df[col] = df[col].fillna(mode[0] if not mode.empty else "Unknown")
    removed = before_rows - len(df)
    filled  = before_missing - int(df.isnull().sum().sum())
    msg = (
        "✅ **Data Cleaned Successfully!**\n"
        f"• Removed **{removed:,}** duplicate rows\n"
        f"• Filled **{filled:,}** missing values\n"
        f"  _(numeric → median, text → mode)_"
    )
    return df, msg


def reset_data(session_id: str) -> str:
    sess = _sessions.get(session_id, {})
    orig = sess.get("original_df")
    if orig is None:
        return "⚠️ No original data found to restore."
    _sessions[session_id]["df"] = orig.copy()
    return f"🔄 **Data restored** to original ({len(orig):,} rows)."


def get_columns(df: pd.DataFrame) -> str:
    lines = [f"📋 **Columns ({len(df.columns)}):**"]
    for i, col in enumerate(df.columns, 1):
        lines.append(f"  {i}. **{col}** — _{df[col].dtype}_")
    return "\n".join(lines)


def get_dtypes(df: pd.DataFrame) -> str:
    lines = ["🔠 **Column Data Types:**"]
    for col in df.columns:
        null_cnt = int(df[col].isnull().sum())
        lines.append(f"  • **{col}**: `{df[col].dtype}` — {null_cnt} missing")
    return "\n".join(lines)


def get_issues(df: pd.DataFrame) -> str:
    lines = ["🔍 **Data Quality Report:**\n"]
    missing = df.isnull().sum()
    missing = missing[missing > 0]
    if missing.empty:
        lines.append("✅ No missing values found")
    else:
        lines.append("❌ **Missing values:**")
        for col, cnt in missing.items():
            lines.append(f"  • {col}: **{cnt:,}** ({cnt/len(df)*100:.1f}%)")
    dupes = int(df.duplicated().sum())
    lines.append("✅ No duplicate rows" if dupes == 0 else f"❌ **Duplicate rows:** {dupes:,}")
    const_cols = [c for c in df.columns if df[c].nunique() <= 1]
    if const_cols:
        lines.append(f"⚠️ **Constant columns:** {', '.join(const_cols)}")
    return "\n".join(lines)


def get_insights(df: pd.DataFrame) -> str:
    numeric = df.select_dtypes(include="number")
    if numeric.empty:
        return "ℹ️ No numeric columns found."
    lines = ["💡 **Key Insights:**\n"]
    for col in numeric.columns:
        s = numeric[col].dropna()
        if s.empty:
            continue
        lines += [
            f"**{col}:**",
            f"  • Total:   {s.sum():>15,.2f}",
            f"  • Average: {s.mean():>15,.2f}",
            f"  • Median:  {s.median():>15,.2f}",
            f"  • Max:     {s.max():>15,.2f}",
            f"  • Min:     {s.min():>15,.2f}",
            f"  • Std Dev: {s.std():>15,.2f}",
            "",
        ]
    return "\n".join(lines)


def compute_stat(df: pd.DataFrame, col: str, stat: str) -> str:
    labels = {"sum": "Total", "mean": "Average", "max": "Maximum",
              "min": "Minimum", "median": "Median", "std": "Std Dev", "var": "Variance"}
    try:
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        if s.empty:
            return f"⚠️ **{col}** has no numeric values."
        val = getattr(s, stat)()
        return f"📊 **{labels.get(stat, stat)} of {col}:** {val:,.4f}"
    except Exception as e:
        return f"⚠️ Error: {e}"


def get_percentile(df: pd.DataFrame, col: str, query: str) -> str:
    match = re.search(r"(\d+)(?:th|st|nd|rd)?", query)
    p = int(match.group(1)) if match else 50
    try:
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        val = s.quantile(p / 100)
        return f"📊 **{p}th percentile of {col}:** {val:,.4f}"
    except Exception as e:
        return f"⚠️ Error: {e}"


def get_unique(df: pd.DataFrame, col: str) -> str:
    counts = df[col].value_counts().head(20)
    n_unique = df[col].nunique()
    lines = [f"🔢 **Unique values in '{col}'** ({n_unique:,} total):\n"]
    for val, cnt in counts.items():
        pct = cnt / len(df) * 100
        lines.append(f"  • **{val}**: {cnt:,} ({pct:.1f}%)")
    if n_unique > 20:
        lines.append(f"  _…and {n_unique - 20} more_")
    return "\n".join(lines)


def count_rows(df: pd.DataFrame, query: str) -> str:
    match = re.search(r"(\w[\w\s]*?)\s*(>=|<=|!=|>|<|=|==)\s*(['\"]?[\w\s.]+['\"]?)", query, re.I)
    if not match:
        return f"📊 **Total rows:** {len(df):,}"
    raw_col, op, raw_val = match.group(1).strip(), match.group(2), match.group(3).strip().strip("'\"")
    col = detect_column(df, raw_col)
    if not col:
        return f"⚠️ Column **'{raw_col}'** not found. Available: {', '.join(df.columns)}"
    op_map = {"=": "==", "==": "==", "!=": "!=", ">": ">", "<": "<", ">=": ">=", "<=": "<="}
    pandas_op = op_map.get(op, "==")
    try:
        series = pd.to_numeric(df[col], errors="coerce")
        if series.notna().sum() > len(df) * 0.5:
            result = df[series.map(lambda x: eval(f"{x} {pandas_op} {float(raw_val)}") if pd.notna(x) else False)]
        else:
            result = df[df[col].astype(str).str.lower().str.contains(raw_val.lower(), na=False)]
        return f"📊 **{len(result):,} rows** match `{col} {op} {raw_val}` (out of {len(df):,} total)"
    except Exception as e:
        return f"⚠️ Count error: {e}"


def filter_data(df: pd.DataFrame, query: str) -> tuple[pd.DataFrame | None, str]:
    match = re.search(
        r"([a-zA-Z_][\w\s]*?)\s*(>=|<=|!=|>|<|==|=|contains|startswith|endswith)\s*(['\"]?[\w\s.\-]+['\"]?)",
        query, re.I
    )
    if not match:
        return None, "⚠️ Could not parse filter. Try: _filter salary > 50000_ or _show rows where dept = Sales_"

    raw_col, op, raw_val = match.group(1).strip(), match.group(2).lower(), match.group(3).strip().strip("'\"")
    col = detect_column(df, raw_col)
    if not col:
        return None, f"⚠️ Column **'{raw_col}'** not found.\nAvailable: {', '.join(df.columns)}"

    try:
        if op in ("contains",):
            mask = df[col].astype(str).str.contains(raw_val, case=False, na=False)
        elif op in ("startswith",):
            mask = df[col].astype(str).str.startswith(raw_val, na=False)
        elif op in ("endswith",):
            mask = df[col].astype(str).str.endswith(raw_val, na=False)
        else:
            series = pd.to_numeric(df[col], errors="coerce")
            if series.notna().sum() > len(df) * 0.5:
                num_val = float(raw_val)
                op_map  = {"=": "==", "==": "==", "!=": "!=", ">": ">", "<": "<", ">=": ">=", "<=": "<="}
                mask    = series.map(lambda x: eval(f"{x} {op_map.get(op,'==')} {num_val}") if pd.notna(x) else False)
            else:
                mask = df[col].astype(str).str.lower() == raw_val.lower()

        result = df[mask]
        if result.empty:
            return None, f"🔍 No rows found where **{col} {op} {raw_val}**."

        preview = result.head(10).to_string(index=False)
        msg = (
            f"🔍 **Filter: {col} {op} {raw_val}**\n"
            f"Found **{len(result):,} rows** (showing first 10):\n\n"
            f"```\n{preview}\n```"
        )
        return result, msg
    except Exception as e:
        return None, f"⚠️ Filter error: {e}"


def sort_data(df: pd.DataFrame, query: str, col: str | None) -> str:
    target = col or detect_column(df, query)
    if not target:
        return "⚠️ Please specify a column. Example: _sort by salary_"
    asc = not any(w in query.lower() for w in ["desc", "descending", "highest", "largest"])
    sorted_df = df.sort_values(target, ascending=asc).head(15)
    direction = "ascending ↑" if asc else "descending ↓"
    preview   = sorted_df[[target] + [c for c in df.columns if c != target][:3]].to_string(index=False)
    return f"🔃 **Sorted by '{target}'** ({direction}) — top 15:\n\n```\n{preview}\n```"


def get_topn(df: pd.DataFrame, query: str, col: str | None) -> str:
    match = re.search(r"\b(\d+)\b", query)
    n     = int(match.group(1)) if match else 5
    target = col or detect_column(df, query)
    if not target:
        target = df.select_dtypes(include="number").columns[0] if not df.select_dtypes(include="number").empty else df.columns[0]
    is_bottom = any(w in query.lower() for w in ["bottom", "lowest", "worst", "smallest", "last"])
    asc       = is_bottom
    label     = f"Bottom {n}" if is_bottom else f"Top {n}"
    try:
        sorted_df = df.sort_values(by=target, ascending=asc).head(n)
        preview   = sorted_df.to_string(index=False)
        return f"🏆 **{label} rows by '{target}':**\n\n```\n{preview}\n```"
    except Exception as e:
        return f"⚠️ Error: {e}"


def get_groupby(df: pd.DataFrame, query: str) -> str:
    q = query.lower()
    if any(w in q for w in ["sum", "total"]):
        agg, agg_label = "sum", "Total"
    elif any(w in q for w in ["average", "mean", "avg"]):
        agg, agg_label = "mean", "Average"
    elif any(w in q for w in ["max", "maximum", "highest"]):
        agg, agg_label = "max", "Max"
    elif any(w in q for w in ["min", "minimum", "lowest"]):
        agg, agg_label = "min", "Min"
    elif any(w in q for w in ["count"]):
        agg, agg_label = "count", "Count"
    else:
        agg, agg_label = "sum", "Total"

    cat_cols  = df.select_dtypes(exclude="number").columns.tolist()
    num_cols  = df.select_dtypes(include="number").columns.tolist()
    group_col = next((c for c in cat_cols if c.lower() in q), None) or (cat_cols[0] if cat_cols else None)
    value_col = next((c for c in num_cols if c.lower() in q), None) or (num_cols[0] if num_cols else None)

    if not group_col:
        return "⚠️ No categorical column found for grouping."

    try:
        if agg == "count":
            result  = df.groupby(group_col).size().reset_index(name="Count")
            result  = result.sort_values("Count", ascending=False)
            preview = result.head(15).to_string(index=False)
            return f"📊 **Count by '{group_col}':**\n\n```\n{preview}\n```"
        elif value_col:
            result  = df.groupby(group_col)[value_col].agg(agg).reset_index()
            result.columns = [group_col, f"{agg_label} of {value_col}"]
            result  = result.sort_values(result.columns[1], ascending=False)
            preview = result.head(15).to_string(index=False)
            return f"📊 **{agg_label} of '{value_col}' by '{group_col}':**\n\n```\n{preview}\n```"
        else:
            result  = df.groupby(group_col).size().reset_index(name="Count")
            preview = result.sort_values("Count", ascending=False).head(15).to_string(index=False)
            return f"📊 **Count by '{group_col}':**\n\n```\n{preview}\n```"
    except Exception as e:
        return f"⚠️ Group-by error: {e}"


def get_sample(df: pd.DataFrame, query: str) -> str:
    match  = re.search(r"\b(\d+)\b", query)
    n      = min(int(match.group(1)) if match else 5, 20)
    sample = df.sample(n=min(n, len(df)), random_state=42)
    return f"🎲 **Random sample ({n} rows):**\n\n```\n{sample.to_string(index=False)}\n```"


def get_correlation(df: pd.DataFrame, query: str) -> str:
    num_df = df.select_dtypes(include="number")
    if num_df.empty:
        return "⚠️ No numeric columns to correlate."
    c1, c2 = detect_two_columns(num_df, query)
    if c1 and c2:
        val       = num_df[c1].corr(num_df[c2])
        strength  = "strong" if abs(val) > 0.7 else "moderate" if abs(val) > 0.4 else "weak"
        direction = "positive" if val > 0 else "negative"
        return (
            f"📈 **Correlation: '{c1}' vs '{c2}'**\n"
            f"• Pearson r = **{val:.4f}**\n"
            f"• Strength: {strength} {direction} correlation"
        )
    corr = num_df.corr().round(3)
    return f"📈 **Correlation Matrix:**\n\n```\n{corr.to_string()}\n```"


def export_csv(session_id: str) -> tuple[bytes | None, str]:
    sess = _sessions.get(session_id, {})
    df   = sess.get("df")
    if df is None:
        return None, "⚠️ No dataset loaded."
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8"), f"✅ CSV ready — {len(df):,} rows, {len(df.columns)} columns."


# ═════════════════════════════════════════════════════════════════════════════
# CHART GENERATORS
# ═════════════════════════════════════════════════════════════════════════════

def chart_bar(df: pd.DataFrame, col: str) -> str | None:
    try:
        counts = df[col].astype(str).value_counts().head(15)
        fig, ax = plt.subplots(figsize=(9, 4), facecolor="#FAFAFA")
        colors  = [_PALETTE[i % len(_PALETTE)] for i in range(len(counts))]
        ax.bar(counts.index, counts.values, color=colors, edgecolor="white", linewidth=0.8)
        _style_ax(ax, f"Distribution of '{col}'")
        ax.set_xlabel(col, fontsize=10)
        ax.set_ylabel("Count", fontsize=10)
        plt.xticks(rotation=40, ha="right", fontsize=8)
        return _fig_to_b64(fig)
    except Exception:
        return None


def chart_line(df: pd.DataFrame, col: str) -> str | None:
    try:
        series = pd.to_numeric(df[col], errors="coerce").dropna()
        fig, ax = plt.subplots(figsize=(9, 4), facecolor="#FAFAFA")
        ax.plot(series.values[:400], color=_PALETTE[0], linewidth=1.8, alpha=0.9)
        ax.fill_between(range(min(400, len(series))), series.values[:400], alpha=0.12, color=_PALETTE[0])
        _style_ax(ax, f"Trend of '{col}'")
        ax.set_ylabel(col, fontsize=10)
        ax.set_xlabel("Index", fontsize=10)
        return _fig_to_b64(fig)
    except Exception:
        return None


def chart_auto(df: pd.DataFrame, col: str) -> str | None:
    is_num = pd.to_numeric(df[col], errors="coerce").notna().sum() > len(df) * 0.5
    if not is_num or df[col].nunique() <= 20:
        return chart_bar(df, col)
    return chart_line(df, col)


def chart_pie(df: pd.DataFrame, col: str) -> str | None:
    try:
        counts = df[col].astype(str).value_counts().head(10)
        if len(counts) < 2:
            return None
        fig, ax = plt.subplots(figsize=(7, 6), facecolor="#FAFAFA")
        wedges, texts, autotexts = ax.pie(
            counts.values, labels=counts.index, autopct="%1.1f%%", startangle=140,
            colors=[_PALETTE[i % len(_PALETTE)] for i in range(len(counts))],
            pctdistance=0.82, wedgeprops={"edgecolor": "white", "linewidth": 1.5},
        )
        for t in autotexts:
            t.set_fontsize(8)
        ax.set_title(f"Breakdown of '{col}'", fontsize=13, fontweight="bold", pad=14)
        return _fig_to_b64(fig)
    except Exception:
        return None


def chart_histogram(df: pd.DataFrame, col: str) -> str | None:
    try:
        series = pd.to_numeric(df[col], errors="coerce").dropna()
        if series.empty:
            return None
        fig, ax = plt.subplots(figsize=(9, 4), facecolor="#FAFAFA")
        n_bins  = min(30, max(10, len(series) // 10))
        ax.hist(series, bins=n_bins, color=_PALETTE[1], edgecolor="white", linewidth=0.6, alpha=0.9)
        ax.axvline(series.mean(),   color="#EF4444", linewidth=1.8, linestyle="--", label=f"Mean: {series.mean():.2f}")
        ax.axvline(series.median(), color="#10B981", linewidth=1.8, linestyle=":",  label=f"Median: {series.median():.2f}")
        _style_ax(ax, f"Histogram of '{col}'")
        ax.set_xlabel(col, fontsize=10)
        ax.set_ylabel("Frequency", fontsize=10)
        ax.legend(fontsize=9)
        return _fig_to_b64(fig)
    except Exception:
        return None


def chart_scatter(df: pd.DataFrame, col1: str, col2: str) -> str | None:
    try:
        x    = pd.to_numeric(df[col1], errors="coerce")
        y    = pd.to_numeric(df[col2], errors="coerce")
        mask = x.notna() & y.notna()
        x, y = x[mask], y[mask]
        if len(x) < 2:
            return None
        fig, ax = plt.subplots(figsize=(8, 5), facecolor="#FAFAFA")
        ax.scatter(x, y, color=_PALETTE[0], alpha=0.55, s=30, edgecolors="white", linewidth=0.4)
        try:
            import numpy as np
            m, b   = np.polyfit(x, y, 1)
            x_line = sorted(x)
            ax.plot(x_line, [m * xi + b for xi in x_line],
                    color=_PALETTE[4], linewidth=1.8, linestyle="--", label="Trend")
        except Exception:
            pass
        corr = x.corr(y)
        _style_ax(ax, f"'{col1}' vs '{col2}'  (r = {corr:.3f})")
        ax.set_xlabel(col1, fontsize=10)
        ax.set_ylabel(col2, fontsize=10)
        ax.legend(fontsize=9)
        return _fig_to_b64(fig)
    except Exception:
        return None


def chart_heatmap(df: pd.DataFrame) -> str | None:
    try:
        num_df = df.select_dtypes(include="number")
        if num_df.shape[1] < 2:
            return None
        corr   = num_df.corr()
        fig, ax = plt.subplots(figsize=(max(6, len(corr)), max(5, len(corr) - 1)), facecolor="#FAFAFA")
        sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm",
                    center=0, square=True, linewidths=0.5,
                    annot_kws={"size": 9}, ax=ax, cbar_kws={"shrink": 0.8})
        ax.set_title("Correlation Heatmap", fontsize=13, fontweight="bold", pad=14)
        plt.xticks(rotation=40, ha="right", fontsize=9)
        plt.yticks(rotation=0, fontsize=9)
        return _fig_to_b64(fig)
    except Exception:
        return None


# ═════════════════════════════════════════════════════════════════════════════
# NATURAL LANGUAGE → PANDAS QUERY
# ═════════════════════════════════════════════════════════════════════════════

def natural_language_to_pandas(df: pd.DataFrame, query: str) -> dict:
    columns     = df.columns.tolist()
    dtypes      = df.dtypes.apply(str).to_dict()
    preview     = df.head(3).to_string(index=False)
    sample_vals = {col: df[col].dropna().unique()[:5].tolist() for col in columns}

    prompt = f"""You are a Python/pandas expert. Convert the user's natural language query into a single pandas expression.

DataFrame variable name: df
Columns: {columns}
Data types: {dtypes}
Sample values per column: {sample_vals}
First 3 rows:
{preview}

User query: "{query}"

Rules:
1. Return ONLY a single pandas expression. No imports, no assignments, no print().
2. The expression must evaluate to a DataFrame or Series.
3. Use only: df[...], df.query(...), df[df[...]], df.groupby(...), df.sort_values(...), df.nlargest(...), df.nsmallest(...), df.loc[...]
4. For string comparisons use .str.contains() or == with exact values from sample_vals.
5. Do NOT use SQL syntax. Pure pandas only.
6. If ambiguous, make a reasonable guess.

Return ONLY the pandas expression, nothing else. No explanation, no markdown, no backticks."""

    pandas_expr = _call_gemini(prompt)

    if pandas_expr.startswith("⚠️"):
        return {"response": pandas_expr, "type": "text"}

    pandas_expr = re.sub(r"```(?:python)?|```", "", pandas_expr).strip()

    blocked = ["import ", "exec(", "eval(", "open(", "os.", "sys.",
               "subprocess", "shutil", "__", "write", "delete", "drop(inplace"]
    if any(b in pandas_expr.lower() for b in blocked):
        return {"response": "❌ That query contains unsafe operations and was blocked.", "type": "text"}

    try:
        result = eval(pandas_expr, {"__builtins__": {}}, {"df": df, "pd": pd})
    except Exception as e:
        return {
            "response": (
                f"❌ Could not execute query.\n\n"
                f"**Expression tried:** `{pandas_expr}`\n\n"
                f"**Error:** {str(e)}\n\n"
                f"Try rephrasing, e.g.:\n"
                f"• _show me rows where salary > 50000_\n"
                f"• _find all Engineering employees_"
            ),
            "type": "text"
        }

    if isinstance(result, pd.DataFrame):
        if result.empty:
            return {"response": f"✅ Query returned **0 rows**.\n\n🔍 `{pandas_expr}`", "type": "text"}
        preview = result.head(20).to_string(index=False)
        return {
            "response": (
                f"✅ **Query result — {len(result):,} row(s):**\n\n"
                f"```\n{preview}\n```\n\n"
                f"🔍 **Expression:** `{pandas_expr}`"
            ),
            "type": "text"
        }
    elif isinstance(result, pd.Series):
        return {
            "response": (
                f"✅ **Result ({len(result):,} items):**\n\n"
                f"```\n{result.head(20).to_string()}\n```\n\n"
                f"🔍 **Expression:** `{pandas_expr}`"
            ),
            "type": "text"
        }
    else:
        return {"response": f"✅ **Result:** {result}\n\n🔍 **Expression:** `{pandas_expr}`", "type": "text"}


# ═════════════════════════════════════════════════════════════════════════════
# GEMINI FALLBACK
# ═════════════════════════════════════════════════════════════════════════════

def gemini_fallback(df: pd.DataFrame, query: str) -> str:
    columns     = ", ".join(df.columns.tolist())
    shape       = f"{df.shape[0]} rows × {df.shape[1]} columns"
    preview     = df.head(5).to_string(index=False)
    num_df      = df.select_dtypes(include="number")
    num_summary = num_df.describe().round(2).to_string() if not num_df.empty else "No numeric columns."
    prompt = (
        "You are DataIQ, an expert AI data analyst.\n\n"
        f"Dataset shape: {shape}\n"
        f"Columns: {columns}\n\n"
        f"Numeric summary:\n{num_summary}\n\n"
        f"First 5 rows:\n{preview}\n\n"
        f"User question: {query}\n\n"
        "Reply concisely (<=120 words). Use bullet points. "
        "Base your answer strictly on the data shown. Do not invent values."
    )
    return _call_gemini(prompt)


# ═════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═════════════════════════════════════════════════════════════════════════════

def process_query(session_id: str, filename: str | None, query: str) -> dict:
    df = get_or_load_session(session_id, filename)
    if df is None:
        return {"response": "❌ No dataset loaded. Please upload a CSV file first.",
                "chart": None, "type": "error", "download": None}

    session  = _sessions.setdefault(session_id, {})
    last_col = session.get("last_column")
    intent   = detect_intent(query)
    col      = detect_column(df, query) or last_col
    if col:
        _sessions[session_id]["last_column"] = col

    ok = lambda r, c=None, t="text": {"response": r, "chart": c, "type": t, "download": None}

    if intent == "summary":
        return ok(get_summary(df))
    elif intent == "clean":
        cleaned, msg = clean_data(df)
        _sessions[session_id]["df"] = cleaned
        return ok(msg)
    elif intent == "reset":
        return ok(reset_data(session_id))
    elif intent == "columns":
        return ok(get_columns(df))
    elif intent == "dtypes":
        return ok(get_dtypes(df))
    elif intent == "issues":
        return ok(get_issues(df))
    elif intent == "insights":
        return ok(get_insights(df))
    elif intent == "sample":
        return ok(get_sample(df, query))
    elif intent == "filter":
        _, msg = filter_data(df, query)
        return ok(msg)
    elif intent == "sort":
        return ok(sort_data(df, query, col))
    elif intent == "topn":
        return ok(get_topn(df, query, col))
    elif intent == "groupby":
        return ok(get_groupby(df, query))
    elif intent == "unique":
        target = col or (df.select_dtypes(exclude="number").columns[0]
                         if not df.select_dtypes(exclude="number").empty else df.columns[0])
        return ok(get_unique(df, target))
    elif intent == "count":
        return ok(count_rows(df, query))
    elif intent == "correlation":
        return ok(get_correlation(df, query))
    elif intent == "median":
        if not col:
            return ok("Please specify a column. Example: _median salary_")
        return ok(compute_stat(df, col, "median"))
    elif intent == "std":
        if not col:
            return ok("Please specify a column. Example: _std of score_")
        return ok(compute_stat(df, col, "std"))
    elif intent == "percentile":
        if not col:
            return ok("Please specify a column. Example: _75th percentile of salary_")
        return ok(get_percentile(df, col, query))
    elif intent == "total":
        if not col:
            return ok("Please specify a column. Example: _total sales_")
        return ok(compute_stat(df, col, "sum"))
    elif intent == "average":
        if not col:
            return ok("Please specify a column. Example: _average price_")
        return ok(compute_stat(df, col, "mean"))
    elif intent == "max":
        if not col:
            return ok("Please specify a column. Example: _max salary_")
        return ok(compute_stat(df, col, "max"))
    elif intent == "min":
        if not col:
            return ok("Please specify a column. Example: _min score_")
        return ok(compute_stat(df, col, "min"))
    elif intent == "chart":
        target = col or df.columns[0]
        b64    = chart_auto(df, target)
        if b64:
            return {"response": f"📊 Chart for **{target}**:", "chart": b64, "type": "chart", "download": None}
        return ok("⚠️ Could not generate chart.")
    elif intent == "linechart":
        target = col or (df.select_dtypes(include="number").columns[0]
                         if not df.select_dtypes(include="number").empty else df.columns[0])
        b64 = chart_line(df, target)
        if b64:
            return {"response": f"📈 Line chart for **{target}**:", "chart": b64, "type": "chart", "download": None}
        return ok("⚠️ Could not generate line chart.")
    elif intent == "pie":
        target = col or (df.select_dtypes(exclude="number").columns[0]
                         if not df.select_dtypes(exclude="number").empty else df.columns[0])
        b64 = chart_pie(df, target)
        if b64:
            return {"response": f"🥧 Pie chart for **{target}**:", "chart": b64, "type": "chart", "download": None}
        return ok("⚠️ Could not generate pie chart. Try a categorical column.")
    elif intent == "histogram":
        target = col or (df.select_dtypes(include="number").columns[0]
                         if not df.select_dtypes(include="number").empty else df.columns[0])
        b64 = chart_histogram(df, target)
        if b64:
            return {"response": f"📊 Histogram of **{target}**:", "chart": b64, "type": "chart", "download": None}
        return ok("⚠️ Could not generate histogram. Column must be numeric.")
    elif intent == "scatter":
        c1, c2   = detect_two_columns(df.select_dtypes(include="number"), query)
        num_cols = df.select_dtypes(include="number").columns
        if not c1 and len(num_cols) >= 2:
            c1, c2 = num_cols[0], num_cols[1]
        if c1 and c2:
            b64 = chart_scatter(df, c1, c2)
            if b64:
                return {"response": f"📉 Scatter plot: **{c1}** vs **{c2}**:", "chart": b64, "type": "chart", "download": None}
        return ok("⚠️ Need two numeric columns. Example: _scatter age vs salary_")
    elif intent == "heatmap":
        b64 = chart_heatmap(df)
        if b64:
            return {"response": "🌡️ **Correlation Heatmap:**", "chart": b64, "type": "chart", "download": None}
        return ok("⚠️ Need at least 2 numeric columns for a heatmap.")
    elif intent == "download":
        csv_bytes, msg = export_csv(session_id)
        fname = (session.get("filename") or "dataset").replace(" ", "_")
        if not fname.endswith(".csv"):
            fname = fname.rsplit(".", 1)[0] + "_cleaned.csv"
        return {"response": msg, "chart": None, "type": "download",
                "download": csv_bytes, "download_filename": fname}
    elif intent == "sql":
        result = natural_language_to_pandas(df, query)
        return {"response": result["response"], "chart": None, "type": result["type"], "download": None}
    else:
        return ok(gemini_fallback(df, query))