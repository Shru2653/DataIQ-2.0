"""
chatbot_service.py — Hybrid v3

Two-layer routing:
  Layer 1 — instant local match (no API call) for ~30 clear command patterns
             e.g. "summary", "clean data", "bar chart", "top 5", "group by"
  Layer 2 — Gemini classification ONLY when Layer 1 has no match
             e.g. "what's flying off the shelves?", "who buys the most?"

This keeps quick-action buttons instant and lets free-form questions work too.
"""

from __future__ import annotations

import io, os, re, glob, json, base64, warnings
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
from dotenv import load_dotenv

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)
load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# Gemini client
# ─────────────────────────────────────────────────────────────────────────────
_GEMINI_KEY   = os.getenv("GEMINI_API_KEY", "")
_genai_client = None
_GEMINI_MODEL = "gemini-2.0-flash"

if _GEMINI_KEY:
    try:
        from google import genai as _genai_sdk
        _genai_client = _genai_sdk.Client(api_key=_GEMINI_KEY)
    except Exception:
        _genai_client = None


def _call_gemini(prompt: str, timeout: int = 20) -> str:
    if not _GEMINI_KEY or _genai_client is None:
        return json.dumps({"action": "error",
                           "message": "⚠️ Gemini API key not configured. "
                                      "Add GEMINI_API_KEY to backend/.env"})
    import time, concurrent.futures
    for attempt in range(2):
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(_genai_client.models.generate_content,
                                   model=_GEMINI_MODEL, contents=prompt)
                resp = future.result(timeout=timeout)
            return resp.text.strip()
        except concurrent.futures.TimeoutError:
            return json.dumps({"action": "error",
                               "message": "⏱️ Gemini took too long. "
                                          "Try a simpler question or try again."})
        except Exception as e:
            err = str(e)
            if ("429" in err or "quota" in err.lower()) and attempt < 1:
                time.sleep(35); continue
            return json.dumps({"action": "error",
                               "message": f"⚠️ Gemini error: {err}"})
    return json.dumps({"action": "error", "message": "⚠️ Gemini unavailable."})


# ─────────────────────────────────────────────────────────────────────────────
# Paths + sessions
# ─────────────────────────────────────────────────────────────────────────────
_BACKEND_DIR  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_FOLDER = os.path.join(_BACKEND_DIR, "static", "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
_sessions: dict = {}


def find_file_path(filename: str) -> str | None:
    direct = os.path.join(UPLOAD_FOLDER, filename)
    if os.path.exists(direct): return direct
    for sub in ("files", "cleaned"):
        m = glob.glob(os.path.join(UPLOAD_FOLDER, "*", sub, filename))
        if m: return m[0]
    m = glob.glob(os.path.join(UPLOAD_FOLDER, "**", filename), recursive=True)
    return m[0] if m else None


def load_df(path: str) -> pd.DataFrame:
    return (pd.read_excel(path) if path.endswith((".xlsx", ".xls"))
            else pd.read_csv(path))


def save_uploaded_file(content: bytes, filename: str) -> str:
    path = os.path.join(UPLOAD_FOLDER, filename)
    with open(path, "wb") as f: f.write(content)
    return path


def get_or_load_session(session_id: str, filename: str | None) -> pd.DataFrame | None:
    sess = _sessions.get(session_id)
    if sess and sess.get("df") is not None:
        if not filename or filename == sess.get("filename"):
            return sess["df"]
    if not filename: return None
    path = find_file_path(filename)
    if not path: return None
    try:
        df = load_df(path)
        _sessions[session_id] = {"df": df, "original_df": df.copy(),
                                 "filename": filename}
        return df
    except Exception:
        return None


def export_csv(session_id: str) -> tuple[bytes | None, str]:
    sess = _sessions.get(session_id, {})
    df   = sess.get("df")
    if df is None: return None, "⚠️ No dataset loaded."
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return (buf.getvalue().encode(),
            f"✅ CSV ready — {len(df):,} rows, {len(df.columns)} columns.")


# ─────────────────────────────────────────────────────────────────────────────
# Chart helpers
# ─────────────────────────────────────────────────────────────────────────────
_PALETTE = ["#4F8EF7","#7C3AED","#10B981","#F59E0B","#EF4444",
            "#06B6D4","#EC4899","#84CC16","#F97316","#6366F1"]

def _fig_to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig); buf.seek(0)
    return base64.b64encode(buf.read()).decode()

def _style_ax(ax, title: str):
    ax.set_title(title, fontsize=13, fontweight="bold", pad=12)
    ax.grid(axis="y", linestyle="--", alpha=0.35)
    ax.spines[["top","right"]].set_visible(False)
    ax.set_facecolor("#FAFAFA")

def _chart_bar(df, col):
    counts = df[col].astype(str).value_counts().head(15)
    fig, ax = plt.subplots(figsize=(9,4), facecolor="#FAFAFA")
    ax.bar(counts.index, counts.values,
           color=[_PALETTE[i%len(_PALETTE)] for i in range(len(counts))],
           edgecolor="white", linewidth=0.8)
    _style_ax(ax, f"Distribution of '{col}'")
    ax.set_xlabel(col); ax.set_ylabel("Count")
    plt.xticks(rotation=40, ha="right", fontsize=8)
    return _fig_to_b64(fig)

def _chart_line(df, col):
    s = pd.to_numeric(df[col], errors="coerce").dropna()
    fig, ax = plt.subplots(figsize=(9,4), facecolor="#FAFAFA")
    ax.plot(s.values[:500], color=_PALETTE[0], linewidth=1.8)
    ax.fill_between(range(min(500,len(s))), s.values[:500],
                    alpha=0.12, color=_PALETTE[0])
    _style_ax(ax, f"Trend of '{col}'")
    ax.set_ylabel(col); ax.set_xlabel("Index")
    return _fig_to_b64(fig)

def _chart_pie(df, col):
    counts = df[col].astype(str).value_counts().head(10)
    if len(counts) < 2: return None
    fig, ax = plt.subplots(figsize=(7,6), facecolor="#FAFAFA")
    ax.pie(counts.values, labels=counts.index, autopct="%1.1f%%",
           startangle=140,
           colors=[_PALETTE[i%len(_PALETTE)] for i in range(len(counts))],
           pctdistance=0.82, wedgeprops={"edgecolor":"white","linewidth":1.5})
    ax.set_title(f"Breakdown of '{col}'", fontsize=13, fontweight="bold", pad=14)
    return _fig_to_b64(fig)

def _chart_histogram(df, col):
    s = pd.to_numeric(df[col], errors="coerce").dropna()
    if s.empty: return None
    fig, ax = plt.subplots(figsize=(9,4), facecolor="#FAFAFA")
    ax.hist(s, bins=min(30, max(10, len(s)//10)),
            color=_PALETTE[1], edgecolor="white", linewidth=0.6, alpha=0.9)
    ax.axvline(s.mean(),   color="#EF4444", linewidth=1.8,
               linestyle="--", label=f"Mean: {s.mean():.2f}")
    ax.axvline(s.median(), color="#10B981", linewidth=1.8,
               linestyle=":",  label=f"Median: {s.median():.2f}")
    _style_ax(ax, f"Histogram of '{col}'")
    ax.set_xlabel(col); ax.set_ylabel("Frequency"); ax.legend(fontsize=9)
    return _fig_to_b64(fig)

def _chart_scatter(df, col1, col2):
    x = pd.to_numeric(df[col1], errors="coerce")
    y = pd.to_numeric(df[col2], errors="coerce")
    mask = x.notna() & y.notna()
    x, y = x[mask], y[mask]
    if len(x) < 2: return None
    fig, ax = plt.subplots(figsize=(8,5), facecolor="#FAFAFA")
    ax.scatter(x, y, color=_PALETTE[0], alpha=0.55,
               s=30, edgecolors="white", linewidth=0.4)
    try:
        import numpy as np
        m, b = np.polyfit(x, y, 1)
        ax.plot(sorted(x), [m*xi+b for xi in sorted(x)],
                color=_PALETTE[4], linewidth=1.8,
                linestyle="--", label="Trend")
    except Exception: pass
    _style_ax(ax, f"'{col1}' vs '{col2}'  (r = {x.corr(y):.3f})")
    ax.set_xlabel(col1); ax.set_ylabel(col2); ax.legend(fontsize=9)
    return _fig_to_b64(fig)

def _chart_heatmap(df):
    num_df = df.select_dtypes(include="number")
    if num_df.shape[1] < 2: return None
    corr = num_df.corr()
    fig, ax = plt.subplots(
        figsize=(max(6,len(corr)), max(5,len(corr)-1)), facecolor="#FAFAFA")
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm",
                center=0, square=True, linewidths=0.5,
                annot_kws={"size":9}, ax=ax, cbar_kws={"shrink":0.8})
    ax.set_title("Correlation Heatmap", fontsize=13, fontweight="bold", pad=14)
    plt.xticks(rotation=40, ha="right", fontsize=9)
    plt.yticks(rotation=0, fontsize=9)
    return _fig_to_b64(fig)


# ─────────────────────────────────────────────────────────────────────────────
# Column helpers
# ─────────────────────────────────────────────────────────────────────────────

def _detect_col(df: pd.DataFrame, query: str) -> str | None:
    q = query.lower()
    for col in df.columns:
        if col.lower() == q: return col
    for col in df.columns:
        if col.lower() in q: return col
    words = [w for w in re.split(r"[\s,]+", q) if len(w) > 2]
    for col in df.columns:
        for w in words:
            if w in col.lower(): return col
    return None

def _detect_two_cols(df: pd.DataFrame, query: str):
    q, found = query.lower(), []
    for col in df.columns:
        if col.lower() in q and col not in found: found.append(col)
        if len(found) == 2: break
    if len(found) < 2:
        for col in df.columns:
            for w in [w for w in re.split(r"[\s,]+", q) if len(w)>2]:
                if w in col.lower() and col not in found:
                    found.append(col); break
            if len(found) == 2: break
    return (found[0] if found else None, found[1] if len(found)>1 else None)


# ─────────────────────────────────────────────────────────────────────────────
# LOCAL EXECUTORS  (all instant, no API needed)
# ─────────────────────────────────────────────────────────────────────────────

def _do_summary(df):
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
    if num_cols: lines.append(f"• **Numeric:** {', '.join(num_cols)}")
    if cat_cols: lines.append(f"• **Categorical:** {', '.join(cat_cols)}")
    return "\n".join(lines)

def _do_columns(df):
    lines = [f"📋 **Columns ({len(df.columns)}):**"]
    for i, col in enumerate(df.columns, 1):
        lines.append(f"  {i}. **{col}** — _{df[col].dtype}_")
    return "\n".join(lines)

def _do_dtypes(df):
    lines = ["🔠 **Column Data Types:**"]
    for col in df.columns:
        lines.append(f"  • **{col}**: `{df[col].dtype}` — "
                     f"{int(df[col].isnull().sum())} missing")
    return "\n".join(lines)

def _do_issues(df):
    lines = ["🔍 **Data Quality Report:**\n"]
    missing = df.isnull().sum()
    missing = missing[missing > 0]
    lines.append("✅ No missing values" if missing.empty else
                 "❌ **Missing values:**")
    for col, cnt in missing.items():
        lines.append(f"  • {col}: **{cnt:,}** ({cnt/len(df)*100:.1f}%)")
    dupes = int(df.duplicated().sum())
    lines.append("✅ No duplicate rows" if dupes == 0
                 else f"❌ **Duplicate rows:** {dupes:,}")
    const_cols = [c for c in df.columns if df[c].nunique() <= 1]
    if const_cols:
        lines.append(f"⚠️ **Constant columns:** {', '.join(const_cols)}")
    return "\n".join(lines)

def _do_insights(df):
    numeric = df.select_dtypes(include="number")
    if numeric.empty: return "ℹ️ No numeric columns found."
    lines = ["💡 **Key Insights:**\n"]
    for col in numeric.columns:
        s = numeric[col].dropna()
        if s.empty: continue
        lines += [f"**{col}:**",
                  f"  • Total: {s.sum():,.2f}  |  Avg: {s.mean():,.2f}  "
                  f"|  Max: {s.max():,.2f}  |  Min: {s.min():,.2f}", ""]
    return "\n".join(lines)

def _do_sample(df, query):
    m = re.search(r"\b(\d+)\b", query)
    n = min(int(m.group(1)) if m else 5, 20)
    return (f"🎲 **Random sample ({n} rows):**\n\n"
            f"```\n{df.sample(n=min(n,len(df)),random_state=42).to_string(index=False)}\n```")

def _do_clean(df):
    before_rows    = len(df)
    before_missing = int(df.isnull().sum().sum())
    df = df.drop_duplicates()
    for col in df.select_dtypes(include="number").columns:
        df[col] = df[col].fillna(df[col].median())
    for col in df.select_dtypes(exclude="number").columns:
        mode = df[col].mode()
        df[col] = df[col].fillna(mode[0] if not mode.empty else "Unknown")
    return df, (f"✅ **Data Cleaned!**\n"
                f"• Removed **{before_rows-len(df):,}** duplicate rows\n"
                f"• Filled **{before_missing-int(df.isnull().sum().sum()):,}** "
                f"missing values")

def _do_reset(session_id):
    orig = _sessions.get(session_id, {}).get("original_df")
    if orig is None: return "⚠️ No original data to restore."
    _sessions[session_id]["df"] = orig.copy()
    return f"🔄 **Data restored** to original ({len(orig):,} rows)."

def _do_filter(df, query):
    m = re.search(
        r"([a-zA-Z_][\w\s]*?)\s*(>=|<=|!=|>|<|==|=|contains)\s*"
        r"(['\"]?[\w\s.\-]+['\"]?)", query, re.I)
    if not m:
        return "⚠️ Could not parse filter. Try: _filter Price > 100_"
    raw_col, op, raw_val = (m.group(1).strip(), m.group(2).lower(),
                            m.group(3).strip().strip("'\""))
    col = _detect_col(df, raw_col)
    if not col:
        return f"⚠️ Column '{raw_col}' not found. Columns: {', '.join(df.columns)}"
    try:
        if op == "contains":
            mask = df[col].astype(str).str.contains(raw_val, case=False, na=False)
        else:
            series = pd.to_numeric(df[col], errors="coerce")
            if series.notna().sum() > len(df)*0.5:
                num_val = float(raw_val)
                op_map  = {"=":"==","==":"==","!=":"!=",">":">","<":"<",">=":">=","<=":"<="}
                mask    = series.map(
                    lambda x, o=op_map.get(op,"=="), v=num_val:
                    eval(f"{x} {o} {v}") if pd.notna(x) else False)
            else:
                mask = df[col].astype(str).str.lower() == raw_val.lower()
        result = df[mask]
        if result.empty:
            return f"🔍 No rows found where **{col} {op} {raw_val}**."
        preview = result.head(10).to_string(index=False)
        return (f"🔍 **{col} {op} {raw_val}** → **{len(result):,} rows** "
                f"(first 10):\n\n```\n{preview}\n```")
    except Exception as e:
        return f"⚠️ Filter error: {e}"

def _do_sort(df, query, col):
    target = col or _detect_col(df, query)
    if not target:
        return "⚠️ Specify a column. Example: _sort by Price_"
    asc = not any(w in query.lower()
                  for w in ["desc","descending","highest","largest"])
    result = df.sort_values(target, ascending=asc).head(15)
    return (f"🔃 **Sorted by '{target}'** "
            f"({'ascending ↑' if asc else 'descending ↓'}) — top 15:\n\n"
            f"```\n{result.to_string(index=False)}\n```")

def _do_topn(df, query, col):
    m     = re.search(r"\b(\d+)\b", query)
    n     = int(m.group(1)) if m else 5
    target = col or _detect_col(df, query)
    if not target:
        num = df.select_dtypes(include="number").columns
        target = num[0] if len(num) else df.columns[0]
    is_bottom = any(w in query.lower()
                    for w in ["bottom","lowest","cheapest","worst","smallest","last"])
    result = df.sort_values(target, ascending=is_bottom).head(n)
    label  = f"Bottom {n}" if is_bottom else f"Top {n}"
    return (f"🏆 **{label} by '{target}':**\n\n"
            f"```\n{result.to_string(index=False)}\n```")

def _do_groupby(df, query):
    q = query.lower()
    if any(w in q for w in ["sum","total"]):         agg, label = "sum",   "Total"
    elif any(w in q for w in ["average","mean","avg"]): agg, label = "mean",  "Average"
    elif any(w in q for w in ["max","maximum"]):     agg, label = "max",   "Max"
    elif any(w in q for w in ["min","minimum"]):     agg, label = "min",   "Min"
    else:                                            agg, label = "count", "Count"

    ascending = any(w in q for w in ["least","lowest","worst","bottom"])

    cat_cols = df.select_dtypes(exclude="number").columns.tolist()
    num_cols = df.select_dtypes(include="number").columns.tolist()
    group_col = next((c for c in cat_cols if c.lower() in q), None) or (cat_cols[0] if cat_cols else None)
    value_col = next((c for c in num_cols if c.lower() in q), None) or (num_cols[0] if num_cols else None)

    if not group_col:
        return "⚠️ No categorical column found for grouping."
    try:
        if agg == "count" or not value_col:
            result = (df.groupby(group_col).size()
                      .reset_index(name="Count")
                      .sort_values("Count", ascending=ascending))
            top = result.iloc[0]
            icon = "🔻" if ascending else "🏆"
            best = f"\n\n{icon} **{'Least' if ascending else 'Most'} frequent:** " \
                   f"{top[group_col]} ({top['Count']:,} times)"
        else:
            result = (df.groupby(group_col)[value_col].agg(agg)
                      .reset_index()
                      .sort_values(value_col, ascending=ascending))
            result.columns = [group_col, f"{label} of {value_col}"]
            top = result.iloc[0]
            val_col = result.columns[1]
            icon = "🔻" if ascending else "🏆"
            best = f"\n\n{icon} **{'Lowest' if ascending else 'Highest'}:** " \
                   f"{top[group_col]} ({top[val_col]:,.2f})"
        preview = result.head(15).to_string(index=False)
        return (f"📊 **{label} by '{group_col}':**\n\n"
                f"```\n{preview}\n```{best}")
    except Exception as e:
        return f"⚠️ Group-by error: {e}"

def _do_unique(df, query, col):
    target = col or _detect_col(df, query)
    if not target:
        cat = df.select_dtypes(exclude="number").columns
        target = cat[0] if len(cat) else df.columns[0]
    counts   = df[target].value_counts().head(20)
    n_unique = df[target].nunique()
    lines    = [f"🔢 **Unique values in '{target}'** ({n_unique:,} total):\n"]
    for val, cnt in counts.items():
        lines.append(f"  • **{val}**: {cnt:,} ({cnt/len(df)*100:.1f}%)")
    if n_unique > 20: lines.append(f"  _…and {n_unique-20} more_")
    return "\n".join(lines)

def _do_stat(df, query, col, stat):
    target = col or _detect_col(df, query)
    if not target:
        num = df.select_dtypes(include="number").columns
        target = num[0] if len(num) else None
    if not target: return "⚠️ Specify a column. Example: _total Sales_"
    labels = {"sum":"Total","mean":"Average","max":"Maximum",
              "min":"Minimum","median":"Median","std":"Std Dev"}
    try:
        s   = pd.to_numeric(df[target], errors="coerce").dropna()
        val = getattr(s, stat)()
        return f"📊 **{labels.get(stat,stat)} of '{target}':** **{val:,.4f}**"
    except Exception as e:
        return f"⚠️ Error: {e}"

def _do_lookup(df, query):
    """Handle 'price of X', 'how much is X', 'what does X cost' etc."""
    q = query.lower()
    # Extract the search term
    patterns = [
        r"(?:price|cost|value|rate|salary|revenue|amount)\s+(?:of|for)\s+(.+)",
        r"(?:how much (?:is|does|cost))\s+(.+)",
        r"(?:what (?:is|does))\s+(.+?)(?:\s+(?:cost|price|sell for))?$",
        r"(?:show|find|get)\s+(?:me\s+)?(.+?)(?:\s+(?:price|cost|value))?$",
    ]
    search_term = None
    for pat in patterns:
        m = re.search(pat, q, re.I)
        if m:
            search_term = m.group(1).strip().rstrip("?").strip()
            break
    if not search_term:
        search_term = re.sub(
            r"^(what|which|show|find|get|how much|price of|cost of)\s+", "",
            q).strip().rstrip("?")

    cat_cols = df.select_dtypes(exclude="number").columns.tolist()
    num_cols = df.select_dtypes(include="number").columns.tolist()

    # Which numeric col are they asking about?
    target_num_col = next((c for c in num_cols if c.lower() in q), None)

    matched = pd.DataFrame()
    for col in cat_cols:
        mask = df[col].astype(str).str.lower().str.contains(
            re.escape(search_term.lower()), na=False)
        if mask.any():
            matched = df[mask]; break

    if matched.empty:
        return (f"🔍 No rows found matching **'{search_term}'**.\n"
                f"Available values: "
                f"{', '.join(str(v) for v in df[cat_cols[0]].dropna().unique()[:8]) if cat_cols else 'N/A'}")

    if target_num_col:
        vals = matched[target_num_col].dropna().unique()
        if len(vals) == 1:
            v = vals[0]
            return f"💰 **{target_num_col} of '{search_term}':** **{v:,.2f}**"
        val_str = ", ".join(f"{v:,.2f}" for v in vals[:5])
        return f"💰 **{target_num_col} for '{search_term}':** {val_str}"

    show_cols = cat_cols[:2] + num_cols[:4]
    show_cols = [c for c in show_cols if c in matched.columns]
    preview   = matched[show_cols].drop_duplicates().head(10).to_string(index=False)
    return (f"🔍 **'{search_term}'** — {len(matched)} row(s):\n\n"
            f"```\n{preview}\n```")

def _do_correlation(df, query):
    c1, c2 = _detect_two_cols(df.select_dtypes(include="number"), query)
    num_df = df.select_dtypes(include="number")
    if num_df.empty: return "⚠️ No numeric columns to correlate."
    if c1 and c2:
        val      = pd.to_numeric(df[c1],errors="coerce").corr(
                   pd.to_numeric(df[c2],errors="coerce"))
        strength = "strong" if abs(val)>0.7 else "moderate" if abs(val)>0.4 else "weak"
        return (f"📈 **Correlation: '{c1}' vs '{c2}'**\n"
                f"• Pearson r = **{val:.4f}**\n"
                f"• {strength.capitalize()} {'positive' if val>0 else 'negative'} correlation")
    corr = num_df.corr().round(3)
    return f"📈 **Correlation Matrix:**\n\n```\n{corr.to_string()}\n```"


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 1 — fast local routing (no API call)
# Uses broad semantic matching so natural language works without exact keywords.
# Returns dict | None  —  None means "fall through to Gemini"
# ─────────────────────────────────────────────────────────────────────────────

def _local_route(session_id: str, df: pd.DataFrame, query: str) -> dict | None:
    q   = query.lower().strip()
    col = _detect_col(df, query)
    num_cols = df.select_dtypes(include="number").columns
    cat_cols = df.select_dtypes(exclude="number").columns
    ok  = lambda r, c=None, t="text": {"response":r,"chart":c,"type":t,"download":None}

    # ── helpers ───────────────────────────────────────────────────────────────
    def _best_num():
        return num_cols[0] if len(num_cols) else df.columns[0]
    def _best_cat():
        return cat_cols[0] if len(cat_cols) else df.columns[0]
    def _price_col():
        # find a column whose name suggests price / cost / amount
        for c in num_cols:
            if any(w in c.lower() for w in
                   ["price","cost","amount","value","rate","fee","salary",
                    "revenue","sales","total","spend"]):
                return c
        return num_cols[0] if len(num_cols) else None
    def _name_col():
        # find a column whose name suggests a product/item name
        for c in cat_cols:
            if any(w in c.lower() for w in
                   ["product","item","name","title","desc","sku","service",
                    "category","type","brand"]):
                return c
        return cat_cols[0] if len(cat_cols) else None

    # ── DATASET INFO ──────────────────────────────────────────────────────────
    if _any(q, ["summary","overview","describe","info","about the data",
                "what is this","tell me about","dataset info","what's in",
                "what data","explain the data","show me the data"]):
        return ok(_do_summary(df))

    if _any(q, ["column","columns","fields","field","header","what are the",
                "list column","show column","what column","attributes"]):
        return ok(_do_columns(df))

    if _any(q, ["data type","dtype","type of column","column type"]):
        return ok(_do_dtypes(df))

    if _any(q, ["issue","issues","problem","quality","missing","null","duplicate",
                "check","error","clean check","data health","anomal"]):
        return ok(_do_issues(df))

    if _any(q, ["insight","key finding","analyz","important","highlight",
                "tell me","what stand","what's interesting","interesting fact"]):
        return ok(_do_insights(df))

    if _any(q, ["sample","random","few rows","some rows","example rows",
                "preview","show me some","peek"]):
        return ok(_do_sample(df, query))

    if _any(q, ["clean","fix","remove duplicate","fill missing","handle null",
                "tidy","scrub","prep the data"]):
        cleaned, msg = _do_clean(df)
        _sessions[session_id]["df"] = cleaned
        return ok(msg)

    if _any(q, ["reset","restore","undo","original","revert","go back"]):
        return ok(_do_reset(session_id))

    if _any(q, ["download","export","save","get csv","get file"]):
        csv_bytes, msg = export_csv(session_id)
        fname = _sessions.get(session_id,{}).get("filename","dataset.csv")
        if not fname.endswith(".csv"):
            fname = fname.rsplit(".",1)[0] + "_cleaned.csv"
        return {"response":msg,"chart":None,"type":"download",
                "download":csv_bytes,"download_filename":fname}

    # ── LISTING / SHOWING ALL VALUES ──────────────────────────────────────────
    # "give me product list", "show all customers", "list of categories"
    if _any(q, ["list","all ","show all","give me all","what are all",
                "show me all","every "]):
        # if a column name is mentioned, show unique values for it
        if col:
            return ok(_do_unique(df, query, col))
        # generic list request without a column → columns overview
        return ok(_do_columns(df))

    if _any(q, ["unique","distinct","different value","value count",
                "how many unique"]):
        return ok(_do_unique(df, query, col))

    # ── CHEAP / EXPENSIVE / PRICE RANGE ──────────────────────────────────────
    # "show me the cheap stuff", "what's affordable", "most expensive items"
    if _any(q, ["cheap","inexpensive","affordable","low price","low cost",
                "budget","least expensive","lowest price"]):
        pc = _price_col()
        if pc:
            return ok(_do_topn(df, "bottom 10 " + pc, pc))
        return ok(_do_topn(df, "bottom 10", col))

    if _any(q, ["expensive","pricey","costly","high price","most expensive",
                "highest price","luxury","premium"]):
        pc = _price_col()
        if pc:
            return ok(_do_topn(df, "top 10 " + pc, pc))
        return ok(_do_topn(df, "top 10", col))

    # ── FILTER ────────────────────────────────────────────────────────────────
    if _any(q, ["filter","where","show rows","rows where","find rows",
                "entries where","records where","only show","just show"]):
        return ok(_do_filter(df, query))

    # ── SORT ──────────────────────────────────────────────────────────────────
    if _any(q, ["sort","order by","arrange","rank by","ranked"]):
        return ok(_do_sort(df, query, col))

    # ── TOP N / BOTTOM N ─────────────────────────────────────────────────────
    if re.search(r"\btop\s*\d*\b|\bbottom\s*\d*\b|\bhighest\b|\blowest\b"
                 r"|\blargest\b|\bsmallest\b|\bbest\b|\bworst\b", q):
        return ok(_do_topn(df, query, col))

    # ── POPULARITY / FREQUENCY / BEST SELLER ─────────────────────────────────
    # "which product sells most", "best selling", "what's popular", "top category"
    if _any(q, ["most popular","most common","most bought","most purchased",
                "most sold","most frequent","best sell","top sell","bestsell",
                "which product","which category","which customer","which item",
                "what sell","what product","what category","what item",
                "least popular","least common","least bought","least sold",
                "worst sell","slowest","flies off","popular item","trending"]):
        return ok(_do_groupby(df, query))

    if _any(q, ["group by","groupby","breakdown","split by","per ","by each",
                "by category","by product","by customer","by region","by type"]):
        return ok(_do_groupby(df, query))

    # ── STATS ─────────────────────────────────────────────────────────────────
    if _any(q, ["total","sum of","sum "]):
        return ok(_do_stat(df, query, col, "sum"))
    if _any(q, ["average","mean of","mean ","avg ","avg of"]):
        return ok(_do_stat(df, query, col, "mean"))
    if re.search(r"\bmax\b|\bmaximum\b|\bhighest value\b", q):
        return ok(_do_stat(df, query, col, "max"))
    if re.search(r"\bmin\b|\bminimum\b|\blowest value\b", q):
        return ok(_do_stat(df, query, col, "min"))
    if "median" in q:
        return ok(_do_stat(df, query, col, "median"))
    if _any(q, ["std","standard deviation","variance","spread","variability"]):
        return ok(_do_stat(df, query, col, "std"))

    # ── LOOKUP / PRICE OF SPECIFIC ITEM ──────────────────────────────────────
    if _any(q, ["price of","cost of","how much is","how much does",
                "what is the price","what does","price for","value of",
                "how much for","what cost"]):
        return ok(_do_lookup(df, query))

    # ── CORRELATION ───────────────────────────────────────────────────────────
    if _any(q, ["correlation","correlate","relationship between",
                "related","connection between","depend on"]):
        return ok(_do_correlation(df, query))

    # ── COUNT ─────────────────────────────────────────────────────────────────
    if _any(q, ["how many","count","number of","total count","total number"]):
        return ok(_do_stat(df, query, col, "sum") if col and col in num_cols
                  else f"📊 **Total rows:** {len(df):,}")

    # ── HOW MUCH / WHAT IS (numeric lookup) ──────────────────────────────────
    if re.search(r"^(how much|what is the|what's the|tell me the)\s+"
                 r"(total|average|mean|max|min|sum)", q):
        if _any(q, ["total","sum"]): return ok(_do_stat(df, query, col, "sum"))
        if _any(q, ["average","mean"]): return ok(_do_stat(df, query, col, "mean"))
        if "max" in q: return ok(_do_stat(df, query, col, "max"))
        if "min" in q: return ok(_do_stat(df, query, col, "min"))

    # ── CHARTS ───────────────────────────────────────────────────────────────
    if _any(q, ["bar chart","bar graph","bar plot","bar visual"]):
        target = col or _best_cat()
        b64 = _chart_bar(df, target)
        return ok(f"📊 **Bar chart — '{target}'**:", b64, "chart") if b64 \
               else ok("⚠️ Could not generate bar chart.")

    if _any(q, ["pie chart","pie graph","pie plot","pie visual","donut"]):
        target = col or _best_cat()
        b64 = _chart_pie(df, target)
        return ok(f"🥧 **Pie chart — '{target}'**:", b64, "chart") if b64 \
               else ok("⚠️ Could not generate pie chart.")

    if _any(q, ["histogram","distribution of","frequency distribution",
                "spread of","how distributed"]):
        target = col or _best_num()
        b64 = _chart_histogram(df, target)
        return ok(f"📊 **Histogram — '{target}'**:", b64, "chart") if b64 \
               else ok("⚠️ Could not generate histogram.")

    if _any(q, ["line chart","line graph","trend chart","trend of",
                "over time","time series","change over"]):
        target = col or _best_num()
        b64 = _chart_line(df, target)
        return ok(f"📈 **Line chart — '{target}'**:", b64, "chart") if b64 \
               else ok("⚠️ Could not generate line chart.")

    if _any(q, ["scatter","scatter plot","scatter graph","vs ","versus",
                "compare two","plot two"]):
        c1, c2 = _detect_two_cols(df.select_dtypes(include="number"), query)
        if not c1 and len(num_cols) >= 2: c1, c2 = num_cols[0], num_cols[1]
        if c1 and c2:
            b64 = _chart_scatter(df, c1, c2)
            if b64: return ok(f"📉 **Scatter: '{c1}' vs '{c2}'**:", b64, "chart")
        return ok("⚠️ Need two numeric columns for scatter.")

    if _any(q, ["heatmap","heat map","correlation map","correlation chart",
                "correlation visual"]):
        b64 = _chart_heatmap(df)
        return ok("🌡️ **Correlation Heatmap:**", b64, "chart") if b64 \
               else ok("⚠️ Need at least 2 numeric columns.")

    # Generic chart request with a column name detected
    if _any(q, ["chart","graph","plot","visual","show me "]) and col:
        is_num = pd.to_numeric(df[col], errors="coerce").notna().sum() > len(df)*0.5
        b64    = (_chart_line(df, col)
                  if is_num and df[col].nunique() > 20
                  else _chart_bar(df, col))
        if b64: return ok(f"📊 **Chart — '{col}'**:", b64, "chart")

    # ── CROSS-COLUMN LOOKUP (last local resort before Gemini) ─────────────────
    # Handles: "who bought stapler", "customers who ordered laptop",
    #          "which orders have quantity > 5", "show name where product = mouse"
    result = _do_cross_lookup(df, query)
    if result is not None:
        return ok(result)

    # Not handled locally → fall through to Gemini
    return None


def _any(text: str, keywords: list[str]) -> bool:
    """True if any keyword appears in text."""
    return any(k in text for k in keywords)


def _value_matches_query(val: str, q: str) -> bool:
    """
    Fuzzy check: does the data value match something in the query?
    Handles typos, partial words, truncated input.
      "staple"        matches "Stapler"        (query word is prefix of value)
      "wireles mouse" matches "Wireless Mouse" (both words match)
      "jane"          matches "Jane Smith"     (first word exact match)
      "john doe"      matches "John Doe"       (both words in query)
    """
    v = val.lower().strip()
    if len(v) < 2:
        return False

    # 1. Exact: value is fully inside the query  e.g. "stapler" in "bought stapler"
    if v in q:
        return True

    # 2. Multi-word value: ALL significant words of the value appear in the query
    #    e.g. "Wireless Mouse" → "wireless" in q AND "mouse" in q
    val_words = [w for w in v.split() if len(w) >= 3]
    if len(val_words) >= 2 and all(w in q for w in val_words):
        return True

    # 3. Single-word value prefix: query contains a word that is a prefix of the value
    #    BUT require the prefix to be at least 5 chars to avoid "john" → "Johnson"
    #    e.g. "staple" (6 chars) → prefix of "stapler" ✓
    #         "john"   (4 chars) → would match "Johnson" ✗ (too short, skip)
    if len(val_words) == 1:
        for word in re.split(r"[\s,]+", q):
            if len(word) >= 5 and v.startswith(word):
                return True

    # 4. Multi-word value: first word of value fully matches a query word (names)
    #    e.g. "Jane Smith" → "jane" in query (first name is enough)
    if val_words and val_words[0] in q and len(val_words[0]) >= 4:
        return True

    # 5. Query word prefix of any word in a multi-word value (≥5 chars required)
    #    e.g. "wireles" → prefix of "wireless" inside "Wireless Mouse"
    if len(val_words) >= 2:
        for qword in re.split(r"[\s,]+", q):
            if len(qword) >= 5:
                for vw in val_words:
                    if vw.startswith(qword):
                        return True

    return False


def _do_cross_lookup(df: pd.DataFrame, query: str) -> str | None:
    """
    Handles ANY natural language cross-column query without an API call.

    Works by:
      1. Scanning every column's unique values against the query using fuzzy matching
      2. The column whose value best matches → filter column
      3. Any other column names mentioned in query → columns to display
      4. Returns filtered rows

    Examples that all work:
      "give me customername who bought staple"   → Product≈Stapler → show CustomerName
      "who bought wireless mous"                 → Product≈Wireless Mouse → show all
      "customers in electronic category"         → Category≈Electronics → show CustomerName
      "what did john doe order"                  → CustomerName=John Doe → show Product etc.
      "orders from jane"                         → CustomerName≈Jane Smith → show orders
    """
    q    = query.lower().strip()
    cols = df.columns.tolist()

    # ── Step 1: find all column names mentioned in the query ──────────────────
    mentioned = [c for c in cols if c.lower() in q]

    # ── Step 2: scan ALL columns for fuzzy-matching values ────────────────────
    # Score each (column, value) pair — longer matches score higher
    best_score  = 0
    filter_col  = None
    filter_val  = None          # the actual value in the dataframe
    match_word  = None          # the word from the query that triggered the match

    for c in cols:
        # Skip pure-numeric columns — no point matching "2" against the query
        if pd.api.types.is_numeric_dtype(df[c]):
            continue
        unique_vals = df[c].dropna().astype(str).unique()
        for v in unique_vals:
            if _value_matches_query(v, q):
                score = len(v)   # longer value = more specific match
                if score > best_score:
                    best_score = score
                    filter_col = c
                    filter_val = v

    if filter_col is None or filter_val is None:
        # Last resort: also try numeric columns if no categorical match found
        # (e.g. "orders with quantity 5")
        m = re.search(r'\b(\d+(?:\.\d+)?)\b', q)
        if m:
            num_q = float(m.group(1))
            for c in df.select_dtypes(include="number").columns:
                if c.lower() in q:
                    # This is a numeric filter — hand off to _do_filter
                    return None   # let _do_filter or Gemini handle it
        return None   # nothing found → fall through to Gemini

    # ── Step 3: decide which columns to display ───────────────────────────────
    # Target = columns explicitly mentioned in query (excluding filter col)
    target_cols = [c for c in mentioned if c != filter_col]

    if target_cols:
        show_cols = target_cols
    else:
        # Show all columns except the filter column (user knows that already)
        show_cols = [c for c in cols if c != filter_col]
        if not show_cols:
            show_cols = cols

    # ── Step 4: filter the dataframe ─────────────────────────────────────────
    series = df[filter_col].astype(str).str.lower()

    # Try exact match first, then contains
    mask = series == filter_val.lower()
    if not mask.any():
        mask = series.str.contains(re.escape(filter_val.lower()), na=False)

    result = df[mask]

    if result.empty:
        avail = ", ".join(df[filter_col].dropna().astype(str).unique()[:8].tolist())
        return (f"🔍 No rows found matching **'{filter_val}'** in **{filter_col}**.\n"
                f"Available values: {avail}")

    # ── Step 5: format output ─────────────────────────────────────────────────
    # Deduplicate show_cols, keep order
    seen, deduped = set(), []
    for c in show_cols:
        if c in df.columns and c not in seen:
            deduped.append(c); seen.add(c)
    if not deduped:
        deduped = list(cols)

    output  = result[deduped].drop_duplicates().head(20)
    preview = output.to_string(index=False)

    show_label = ", ".join(f"**{c}**" for c in deduped[:3])
    if len(deduped) > 3:
        show_label += f" _(+{len(deduped)-3} more)_"

    return (f"🔍 {show_label} where **{filter_col}** = **{filter_val}**"
            f" — **{len(result)} row(s)**:\n\n"
            f"```\n{preview}\n```")


# ─────────────────────────────────────────────────────────────────────────────
# LAYER 2 — Gemini classifies + executes unknown natural language questions
# ─────────────────────────────────────────────────────────────────────────────

_ACTION_SCHEMA = """\
{ "action": "groupby",      "group_col": "ColName", "value_col": "ColName or null", "agg": "count|sum|mean|max|min", "ascending": false }
{ "action": "filter",       "column": "ColName", "op": "==|!=|>|<|>=|<=|contains", "value": "..." }
{ "action": "topn",         "column": "ColName", "n": 5, "ascending": false }
{ "action": "sort",         "column": "ColName", "ascending": true }
{ "action": "lookup",       "search_term": "...", "num_column": "ColName or null" }
{ "action": "stat",         "column": "ColName", "stat": "sum|mean|max|min|median|std" }
{ "action": "unique",       "column": "ColName" }
{ "action": "correlation",  "col1": "ColName or null", "col2": "ColName or null" }
{ "action": "chart",        "chart_type": "bar|line|pie|histogram", "column": "ColName" }
{ "action": "scatter",      "col1": "ColName", "col2": "ColName" }
{ "action": "heatmap" }
{ "action": "pandas_query", "expression": "single pandas expression using df" }
{ "action": "explain",      "answer": "concise prose answer, max 80 words, from data only" }
{ "action": "summary" }
{ "action": "insights" }
{ "action": "issues" }"""


def _gemini_classify_and_run(df: pd.DataFrame, query: str) -> dict:
    columns     = df.columns.tolist()
    num_cols    = df.select_dtypes(include="number").columns.tolist()
    cat_cols    = df.select_dtypes(exclude="number").columns.tolist()
    sample_vals = {col: df[col].dropna().unique()[:4].tolist() for col in columns}
    preview     = df.head(3).to_string(index=False)

    prompt = f"""You are a data assistant. The user has a dataset and asks a question in plain English.
Return a JSON action object so the app can answer it. No explanation, just JSON.

DATASET:
Shape: {len(df)} rows × {len(df.columns)} columns
Columns: {columns}
Numeric: {num_cols}
Categorical: {cat_cols}
Sample values: {sample_vals}
First 3 rows:
{preview}

ACTION OPTIONS:
{_ACTION_SCHEMA}

RULES:
1. Column names must match exactly from: {columns}
2. For "pandas_query": single pandas expression on variable `df`. No imports, no assignments.
3. For popularity/frequency questions → groupby with agg="count"
4. For price/cost/value of a specific item → lookup
5. For "cheap stuff" / "expensive items" → topn with ascending=true/false on a price column
6. For "what sells most" / "best product" → groupby count
7. For pure explanation questions with no data retrieval → explain

USER QUESTION: {query}

JSON:"""

    raw = _call_gemini(prompt, timeout=18)
    raw = re.sub(r"```(?:json)?|```", "", raw).strip()

    try:
        action = json.loads(raw)
        if isinstance(action, dict) and "action" in action:
            return _run_gemini_action(df, action, query)
    except Exception:
        pass

    # If JSON parse failed, treat the response as an explain answer
    if raw and not raw.startswith("{") and not raw.startswith("⚠️"):
        return {"response": raw, "chart": None, "type": "text", "download": None}

    return {"response": "🤔 I couldn't understand that. Try rephrasing or use the quick buttons.",
            "chart": None, "type": "text", "download": None}


def _run_gemini_action(df: pd.DataFrame, action: dict, query: str) -> dict:
    act = action.get("action", "explain")
    ok  = lambda r, c=None, t="text": {"response":r,"chart":c,"type":t,"download":None}

    if act == "summary":   return ok(_do_summary(df))
    if act == "insights":  return ok(_do_insights(df))
    if act == "issues":    return ok(_do_issues(df))

    if act == "groupby":
        group_col = action.get("group_col")
        value_col = action.get("value_col")
        agg       = action.get("agg", "count")
        ascending = action.get("ascending", False)
        if not group_col or group_col not in df.columns:
            return ok(f"⚠️ Column '{group_col}' not found.")
        try:
            if agg == "count" or not value_col or value_col not in df.columns:
                result = (df.groupby(group_col).size()
                          .reset_index(name="Count")
                          .sort_values("Count", ascending=ascending))
                top  = result.iloc[0]
                icon = "🔻" if ascending else "🏆"
                best = (f"\n\n{icon} **{'Least' if ascending else 'Most'} frequent:** "
                        f"{top[group_col]} ({top['Count']:,} times)")
            else:
                result = (df.groupby(group_col)[value_col].agg(agg)
                          .reset_index()
                          .sort_values(value_col, ascending=ascending))
                labels = {"sum":"Total","mean":"Average","max":"Max","min":"Min"}
                lbl    = labels.get(agg, agg.capitalize())
                result.columns = [group_col, f"{lbl} of {value_col}"]
                top     = result.iloc[0]
                val_col = result.columns[1]
                icon    = "🔻" if ascending else "🏆"
                best    = (f"\n\n{icon} **{'Lowest' if ascending else 'Highest'}:** "
                           f"{top[group_col]} ({top[val_col]:,.2f})")
            preview = result.head(15).to_string(index=False)
            return ok(f"📊 **Results by '{group_col}':**\n\n```\n{preview}\n```{best}")
        except Exception as e:
            return ok(f"⚠️ Group-by error: {e}")

    if act == "filter":
        return ok(_do_filter(df, query))   # reuse local parser

    if act == "topn":
        col = action.get("column")
        n   = int(action.get("n", 5))
        asc = action.get("ascending", False)
        if not col or col not in df.columns:
            num = df.select_dtypes(include="number").columns
            col = num[0] if len(num) else df.columns[0]
        result = df.sort_values(col, ascending=asc).head(n)
        label  = f"Bottom {n}" if asc else f"Top {n}"
        return ok(f"🏆 **{label} by '{col}':**\n\n```\n{result.to_string(index=False)}\n```")

    if act == "sort":
        col = action.get("column")
        asc = action.get("ascending", True)
        if not col or col not in df.columns:
            return ok(f"⚠️ Column '{col}' not found.")
        result = df.sort_values(col, ascending=asc).head(15)
        return ok(f"🔃 **Sorted by '{col}'** "
                  f"({'asc ↑' if asc else 'desc ↓'}):\n\n"
                  f"```\n{result.to_string(index=False)}\n```")

    if act == "lookup":
        term    = action.get("search_term","")
        num_col = action.get("num_column")
        fake_q  = f"price of {term}" + (f" {num_col}" if num_col else "")
        return ok(_do_lookup(df, fake_q))

    if act == "stat":
        col  = action.get("column","")
        stat = action.get("stat","mean")
        if col not in df.columns:
            return ok(f"⚠️ Column '{col}' not found.")
        return ok(_do_stat(df, query, col, stat))

    if act == "unique":
        col = action.get("column","")
        if col not in df.columns:
            return ok(f"⚠️ Column '{col}' not found.")
        return ok(_do_unique(df, query, col))

    if act == "correlation":
        return ok(_do_correlation(df, query))

    if act == "chart":
        chart_type = action.get("chart_type","bar")
        col        = action.get("column","")
        if not col or col not in df.columns:
            col = (df.select_dtypes(exclude="number").columns[0]
                   if chart_type in ("bar","pie")
                   else df.select_dtypes(include="number").columns[0]
                   if not df.select_dtypes(include="number").empty
                   else df.columns[0])
        fn  = {"bar":_chart_bar,"line":_chart_line,
               "pie":_chart_pie,"histogram":_chart_histogram}.get(chart_type, _chart_bar)
        b64 = fn(df, col)
        icons = {"bar":"📊","line":"📈","pie":"🥧","histogram":"📊"}
        return (ok(f"{icons.get(chart_type,'📊')} **{chart_type.capitalize()} — '{col}'**:",
                   b64, "chart")
                if b64 else ok("⚠️ Could not generate chart."))

    if act == "scatter":
        c1, c2   = action.get("col1"), action.get("col2")
        num_cols = df.select_dtypes(include="number").columns
        if not c1 or c1 not in df.columns:
            c1 = num_cols[0] if len(num_cols) >= 1 else None
        if not c2 or c2 not in df.columns:
            c2 = num_cols[1] if len(num_cols) >= 2 else None
        if c1 and c2:
            b64 = _chart_scatter(df, c1, c2)
            if b64: return ok(f"📉 **Scatter: '{c1}' vs '{c2}'**:", b64, "chart")
        return ok("⚠️ Need two numeric columns for scatter.")

    if act == "heatmap":
        b64 = _chart_heatmap(df)
        return (ok("🌡️ **Correlation Heatmap:**", b64, "chart")
                if b64 else ok("⚠️ Need at least 2 numeric columns."))

    if act == "pandas_query":
        expr = action.get("expression","").strip()
        expr = re.sub(r"```(?:python)?|```","",expr).strip()
        if not expr: return ok("⚠️ No expression returned.")
        blocked = ["import ","exec(","eval(","open(","os.","sys.",
                   "subprocess","shutil","__","write(","delete"]
        if any(b in expr.lower() for b in blocked):
            return ok("❌ Unsafe operation blocked.")
        try:
            result = eval(expr, {"__builtins__":{}}, {"df":df,"pd":pd})
        except Exception as e:
            return ok(f"❌ Could not run query.\n**Expression:** `{expr}`\n**Error:** {e}")
        if isinstance(result, pd.DataFrame):
            if result.empty: return ok("✅ Query returned **0 rows**.")
            return ok(f"✅ **{len(result):,} row(s):**\n\n"
                      f"```\n{result.head(20).to_string(index=False)}\n```")
        elif isinstance(result, pd.Series):
            return ok(f"✅ **Result:**\n\n"
                      f"```\n{result.head(20).to_string()}\n```")
        else:
            return ok(f"✅ **Result:** {result}")

    if act == "explain":
        answer = action.get("answer","")
        if answer: return ok(answer)

    if act == "error":
        return ok(action.get("message","⚠️ Something went wrong."))

    return ok("🤔 I understood your question but couldn't map it to an action. "
              "Try rephrasing or use the quick buttons.")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def process_query(session_id: str, filename: str | None, query: str) -> dict:
    df = get_or_load_session(session_id, filename)
    if df is None:
        return {"response": "❌ No dataset loaded. Please upload a CSV file first.",
                "chart": None, "type": "error", "download": None}

    _sessions.setdefault(session_id, {})

    # Layer 1 — try instant local routing first
    result = _local_route(session_id, df, query)
    if result is not None:
        return result

    # Layer 2 — ask Gemini to classify and run
    return _gemini_classify_and_run(df, query)