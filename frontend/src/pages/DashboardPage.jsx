/**
 * DashboardPage.jsx — Upgraded with 5 new features:
 *   1. Download charts (PNG via Plotly built-in button)
 *   2. Drag-and-drop layout (react-beautiful-dnd)
 *   3. PDF export (html2canvas + jsPDF)
 *   4. Compare two datasets
 *   5. ML prediction panel
 *
 * install deps once:
 *   npm install react-beautiful-dnd html2canvas jspdf
 *   pip install scikit-learn   (backend)
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Activity, AlertCircle, AlertTriangle, BarChart2, ChevronDown,
  Download, FileDown, Filter, FolderOpen, GitCompare, RefreshCw,
  Search, Sparkles, X, GripVertical, CheckCircle, Info,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import html2canvas from "html2canvas";
import jsPDF       from "jspdf";

import axiosClient     from "../api/axiosClient";
import ChartPlot       from "../components/dashboard/ChartPlot";
import Dashboard       from "../components/dashboard/Dashboard";
import Navbar          from "../components/layout/Navbar";
import { useAppStore } from "../stores/useAppStore";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const KPI_COLOR = {
  blue:   { card: "bg-blue-50   border-blue-200",   value: "text-blue-700"   },
  green:  { card: "bg-green-50  border-green-200",  value: "text-green-700"  },
  amber:  { card: "bg-amber-50  border-amber-200",  value: "text-amber-700"  },
  red:    { card: "bg-red-50    border-red-200",     value: "text-red-700"    },
  purple: { card: "bg-purple-50 border-purple-200", value: "text-purple-700" },
};

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({ kpi }) {
  const c = KPI_COLOR[kpi.color] ?? KPI_COLOR.blue;
  return (
    <div className={`rounded-xl border p-5 ${c.card} flex flex-col gap-1`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">{kpi.label}</p>
      <p className={`text-2xl font-bold leading-tight ${c.value} truncate`}>{kpi.value}</p>
      {kpi.sub && <p className="text-xs text-gray-400 truncate">{kpi.sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Card — with drag handle + PNG download
// ─────────────────────────────────────────────────────────────────────────────

function ChartCard({ chart, dragHandleProps }) {
  // Plotly's built-in download button is enabled via config in ChartPlot
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-full">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
        {/* Drag handle */}
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0">
          <GripVertical size={16} />
        </div>
        <p className="text-sm font-semibold text-gray-800 leading-snug flex-1 truncate">{chart.title}</p>
        {chart.anomaly_message && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
            <AlertTriangle size={10} />
            {chart.anomaly_message}
          </span>
        )}
      </div>
      {/* downloadImage button is in Plotly's modebar — enabled by config below */}
      <ChartPlot
        type={chart.type}
        data={chart.traces}
        title={chart.title}
        height={280}
        layout={chart.layout ?? {}}
        config={{ displayModeBar: true, modeBarButtonsToAdd: ["downloadImage"], displaylogo: false }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Bar
// ─────────────────────────────────────────────────────────────────────────────

function FilterBar({ schema, filters, setFilters }) {
  const catCols = useMemo(
    () => Object.entries(schema?.columns ?? {})
      .filter(([, m]) => m.is_categorical && !m.is_numeric && m.unique_count <= 30)
      .map(([col]) => col),
    [schema]
  );
  if (!catCols.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 mb-6">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <Filter size={13} /> Filters
      </span>
      {catCols.slice(0, 4).map((col) => (
        <div key={col} className="relative">
          <select
            value={filters[col] ?? ""}
            onChange={(e) => setFilters((p) => ({ ...p, [col]: e.target.value || undefined }))}
            className="appearance-none text-xs border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">All {col}</option>
            {(schema.columns[col]?.sample_values ?? []).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-2 text-gray-400 pointer-events-none" />
        </div>
      ))}
      {Object.keys(filters).length > 0 && (
        <button onClick={() => setFilters({})} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
          <X size={12} /> Clear
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV Export helper
// ─────────────────────────────────────────────────────────────────────────────

function exportCSV(statistics, schema, filename) {
  const rows = [["=== KPIs ==="], ["Label","Value","Sub"]];
  (statistics.kpis ?? []).forEach((k) => rows.push([k.label, k.value, k.sub ?? ""]));
  rows.push([]);
  rows.push(["=== Numeric Summary ==="]);
  const numCols = Object.keys(statistics.numeric_summary ?? {});
  if (numCols.length) {
    rows.push(["Metric", ...numCols]);
    ["count","mean","std","min","25%","50%","75%","max"].forEach((m) =>
      rows.push([m, ...numCols.map((c) => statistics.numeric_summary[c]?.[m] ?? "")])
    );
  }
  rows.push([]);
  rows.push(["=== Schema ==="], ["Column","Type","Missing %","Unique"]);
  Object.entries(schema.columns ?? {}).forEach(([col, meta]) =>
    rows.push([col, meta.dtype, meta.missing_percent, meta.unique_count])
  );
  const csv  = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${filename}_dashboard.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Export
// ─────────────────────────────────────────────────────────────────────────────

async function exportPDF(dashboardRef, filename, setPdfLoading) {
  if (!dashboardRef.current) return;
  setPdfLoading(true);
  try {
    const canvas    = await html2canvas(dashboardRef.current, { scale: 1.5, backgroundColor: "#fff", useCORS: true });
    const pdf       = new jsPDF("p", "pt", "a4");
    const pageW     = pdf.internal.pageSize.getWidth();
    const pageH     = pdf.internal.pageSize.getHeight();
    const imgW      = pageW;
    const imgH      = canvas.height * (imgW / canvas.width);

    if (imgH <= pageH) {
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgW, imgH);
    } else {
      const pxPerPage = Math.floor((pageH / pageW) * canvas.width);
      const pages     = Math.ceil(canvas.height / pxPerPage);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      const ctx = pageCanvas.getContext("2d");

      for (let p = 0; p < pages; p++) {
        const sY = p * pxPerPage;
        const sH = Math.min(pxPerPage, canvas.height - sY);
        pageCanvas.height = sH;
        ctx.clearRect(0, 0, pageCanvas.width, sH);
        ctx.drawImage(canvas, 0, sY, canvas.width, sH, 0, 0, canvas.width, sH);
        const h = (sH / canvas.width) * imgW;
        if (p > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, imgW, h);
      }
    }
    pdf.save(`${filename}_dashboard.pdf`);
  } catch (e) {
    console.error("PDF export failed:", e);
  } finally {
    setPdfLoading(false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compare Panel
// ─────────────────────────────────────────────────────────────────────────────

function ComparePanel({ serverFiles, currentFile }) {
  const [fileB,     setFileB]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);

  const compare = async () => {
    if (!currentFile || !fileB) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axiosClient.post("/api/dashboard/compare", {
        filename_a: currentFile,
        filename_b: fileB,
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail ?? e?.message ?? "Compare failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <GitCompare size={18} className="text-purple-500" />
        <h3 className="text-base font-semibold text-gray-800">Compare Datasets</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium text-blue-600">{currentFile || "—"}</span>
          <span className="text-gray-400">vs</span>
        </div>
        <div className="relative">
          <select
            value={fileB}
            onChange={(e) => setFileB(e.target.value)}
            className="appearance-none text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Select second file…</option>
            {serverFiles.filter((f) => f !== currentFile).map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
        </div>
        <button
          onClick={compare}
          disabled={!fileB || !currentFile || loading}
          className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 rounded-lg transition"
        >
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <GitCompare size={13} />}
          Compare
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {result && (
        <div className="space-y-5">
          {/* Side-by-side summary */}
          <div className="grid grid-cols-2 gap-4">
            {[result.dataset_a, result.dataset_b].map((ds, i) => (
              <div key={i} className={`rounded-xl border p-4 ${i === 0 ? "border-blue-200 bg-blue-50" : "border-purple-200 bg-purple-50"}`}>
                <p className={`text-xs font-semibold mb-2 truncate ${i === 0 ? "text-blue-700" : "text-purple-700"}`}>{ds.filename}</p>
                {[
                  ["Rows",          ds.row_count?.toLocaleString()],
                  ["Columns",       ds.column_count],
                  ["Missing",       `${ds.missing_percent}%`],
                  ["Duplicates",    `${ds.duplicate_percent}%`],
                  ["Numeric cols",  ds.numeric_cols],
                  ["Categorical",   ds.categorical_cols],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs py-0.5">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-800">{val}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Column overlap */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="font-semibold text-green-700 mb-1">Shared ({result.shared_columns.length})</p>
              <p className="text-gray-600 truncate">{result.shared_columns.slice(0,5).join(", ")}{result.shared_columns.length > 5 ? "…" : ""}</p>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="font-semibold text-blue-700 mb-1">Only in A ({result.only_in_a.length})</p>
              <p className="text-gray-600 truncate">{result.only_in_a.slice(0,5).join(", ") || "—"}</p>
            </div>
            <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
              <p className="font-semibold text-purple-700 mb-1">Only in B ({result.only_in_b.length})</p>
              <p className="text-gray-600 truncate">{result.only_in_b.slice(0,5).join(", ") || "—"}</p>
            </div>
          </div>

          {/* Shared column comparison table */}
          {result.dataset_a.shared_column_comparison.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-600">Column</th>
                    <th className="text-center py-2 px-2 font-semibold text-blue-600">Mean A</th>
                    <th className="text-center py-2 px-2 font-semibold text-purple-600">Mean B</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">Missing A</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">Missing B</th>
                  </tr>
                </thead>
                <tbody>
                  {result.dataset_a.shared_column_comparison.map((row) => (
                    <tr key={row.column} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 px-2 font-medium text-gray-800">{row.column}</td>
                      <td className="text-center py-1.5 px-2 text-blue-700">{row.mean_a != null ? Number(row.mean_a).toFixed(2) : row.top_a ?? "—"}</td>
                      <td className="text-center py-1.5 px-2 text-purple-700">{row.mean_b != null ? Number(row.mean_b).toFixed(2) : row.top_b ?? "—"}</td>
                      <td className="text-center py-1.5 px-2">{row.missing_a}%</td>
                      <td className="text-center py-1.5 px-2">{row.missing_b}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ML Prediction Panel
// ─────────────────────────────────────────────────────────────────────────────

function MLPanel({ filename, numericColumns }) {
  const [target,   setTarget]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);

  const allCols = numericColumns ?? [];

  const run = async () => {
    if (!filename || !target) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axiosClient.post("/api/dashboard/ml-predict", {
        filename,
        target_column: target,
      });
      setResult(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail ?? e?.message ?? "ML prediction failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="text-indigo-500" />
        <h3 className="text-base font-semibold text-gray-800">ML Prediction</h3>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Random Forest</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="text-sm text-gray-600">Predict:</span>
        <div className="relative">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="appearance-none text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">Select target column…</option>
            {allCols.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
        </div>
        <button
          onClick={run}
          disabled={!target || loading}
          className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg transition"
        >
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Train & Predict
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {result && (
        <div className="space-y-5">
          {/* Metrics */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2">
              <CheckCircle size={14} className="text-indigo-500" />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{result.model_type === "classifier" ? "Accuracy" : "R² Score"}</p>
                <p className="text-lg font-bold text-indigo-700">
                  {result.model_type === "classifier" ? `${result.accuracy}%` : result.r2_score}
                </p>
              </div>
            </div>
            {result.rmse != null && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                <Info size={14} className="text-amber-500" />
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">RMSE</p>
                  <p className="text-lg font-bold text-amber-700">{result.rmse}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <Activity size={14} className="text-green-500" />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Top feature</p>
                <p className="text-sm font-bold text-green-700 truncate max-w-[120px]">{result.top_feature}</p>
              </div>
            </div>
          </div>

          {/* Insight */}
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
            {result.insight}
          </p>

          {/* Feature importance horizontal bar chart */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Feature importances</p>
            <div className="space-y-2">
              {result.feature_importances.map((fi, i) => (
                <div key={fi.feature} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-32 truncate text-right">{fi.feature}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${fi.importance_pct}%`, opacity: 1 - i * 0.05 }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">{fi.importance_pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main DashboardPage
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const sidebarOpen    = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const selectedFile   = useAppStore((s) => s.selectedFile);

  const [serverFiles,  setServerFiles]  = useState([]);
  const [activeFile,   setActiveFile]   = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [dashData,     setDashData]     = useState(null);
  const [filters,      setFilters]      = useState({});
  const [chartFilter,  setChartFilter]  = useState("all");
  const [search,       setSearch]       = useState("");
  const [chartOrder,   setChartOrder]   = useState([]);  // drag-and-drop order
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [activeTab,    setActiveTab]    = useState("charts"); // charts | compare | ml

  const dashboardRef = useRef(null);

  // Load file list
  useEffect(() => {
    axiosClient.get("/api/files")
      .then((res) => {
        const files = res.data?.files ?? res.data ?? [];
        const names = Array.isArray(files)
          ? files.map((f) => f.filename ?? f.name ?? f).filter(Boolean)
          : [];
        setServerFiles(names);
      })
      .catch(() => {});
  }, []);

  // Sync Zustand → activeFile
  useEffect(() => {
    const zf = selectedFile?.filename ?? selectedFile?.name ?? null;
    if (zf && !activeFile) setActiveFile(zf);
  }, [selectedFile]);

  // Fetch dashboard
  const fetchDashboard = useCallback(async (fname) => {
    if (!fname) return;
    setLoading(true);
    setError(null);
    setDashData(null);
    setFilters({});
    setChartOrder([]);
    try {
      const res = await axiosClient.post("/api/dashboard/auto", { filename: fname });
      setDashData(res.data);
      setChartOrder((res.data.statistics?.charts ?? []).map((c) => c.id));
    } catch (err) {
      setError(err?.response?.data?.detail ?? err?.message ?? "Failed to generate dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeFile) fetchDashboard(activeFile);
  }, [activeFile]);

  // Derived
  const { statistics, schema } = dashData ?? {};

  const orderedCharts = useMemo(() => {
    if (!statistics?.charts) return [];
    const map = Object.fromEntries(statistics.charts.map((c) => [c.id, c]));
    const ordered = chartOrder.map((id) => map[id]).filter(Boolean);
    // append any charts not yet in order (e.g. after refresh)
    statistics.charts.forEach((c) => { if (!ordered.find((o) => o.id === c.id)) ordered.push(c); });
    return ordered;
  }, [statistics, chartOrder]);

  const filteredCharts = useMemo(() => {
    let charts = orderedCharts;
    if (chartFilter !== "all") {
      charts = charts.filter((c) => {
        if (chartFilter === "numeric")     return ["histogram","box"].includes(c.type);
        if (chartFilter === "categorical") return ["bar","pie"].includes(c.type);
        if (chartFilter === "date")        return c.type === "line";
        if (chartFilter === "correlation") return c.type === "heatmap";
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      charts = charts.filter((c) => c.title.toLowerCase().includes(q) || c.column.toLowerCase().includes(q));
    }
    return charts;
  }, [orderedCharts, chartFilter, search]);

  // Drag-and-drop handler
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const newOrder = Array.from(chartOrder);
    const [moved]  = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, moved);
    setChartOrder(newOrder);
  };

  // ── File selector bar ─────────────────────────────────────────────────────
  const FileSelectorBar = (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-5 py-3 mb-6 shadow-sm">
      <FolderOpen size={16} className="text-blue-500 flex-shrink-0" />
      <span className="text-sm font-medium text-gray-600">Dataset:</span>
      {serverFiles.length > 0 ? (
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <select
            value={activeFile}
            onChange={(e) => setActiveFile(e.target.value)}
            className="w-full appearance-none text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— select a file —</option>
            {serverFiles.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-2 text-gray-400 pointer-events-none" />
        </div>
      ) : (
        <input
          type="text"
          value={activeFile}
          onChange={(e) => setActiveFile(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchDashboard(activeFile)}
          placeholder="Type filename e.g. sales.csv"
          className="flex-1 min-w-[200px] max-w-sm text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      )}
      <button
        onClick={() => fetchDashboard(activeFile)}
        disabled={!activeFile || loading}
        className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition"
      >
        <BarChart2 size={14} /> Generate
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="pt-24 pb-16 px-6 lg:px-12">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Auto Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Charts, KPIs, ML predictions and dataset comparison</p>
          </div>
          {dashData && (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => fetchDashboard(activeFile)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition">
                <RefreshCw size={14} /> Refresh
              </button>
              <button onClick={() => exportCSV(statistics, schema, activeFile.replace(/\.[^.]+$/, ""))}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition">
                <Download size={14} /> CSV
              </button>
              <button
                onClick={() => exportPDF(dashboardRef, activeFile.replace(/\.[^.]+$/, ""), setPdfLoading)}
                disabled={pdfLoading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-50 rounded-lg transition"
              >
                {pdfLoading
                  ? <RefreshCw size={14} className="animate-spin" />
                  : <FileDown size={14} />}
                {pdfLoading ? "Exporting…" : "PDF"}
              </button>
            </div>
          )}
        </div>

        {FileSelectorBar}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <RefreshCw size={32} className="animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">Analyzing <strong>{activeFile}</strong>…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="max-w-xl bg-red-50 border border-red-200 rounded-xl p-6 flex gap-4 mb-6">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700 mb-1">Dashboard Error</p>
              <p className="text-sm text-red-600">{error}</p>
              <button onClick={() => fetchDashboard(activeFile)}
                className="mt-3 text-sm text-red-600 underline hover:text-red-800">Try again</button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !dashData && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart2 size={48} className="text-gray-200 mb-4" />
            <p className="text-base font-medium text-gray-400 mb-1">Select a file and click Generate</p>
            <p className="text-sm text-gray-300">Auto-detects column types and builds charts for any CSV</p>
          </div>
        )}

        {/* ── Dashboard content ──────────────────────────────────────────── */}
        {!loading && dashData && (
          <div ref={dashboardRef}>

            {/* Meta line */}
            <p className="text-xs text-gray-400 mb-5">
              {schema?.row_count?.toLocaleString()} rows · {schema?.column_count} columns ·{" "}
              <span className="font-medium text-gray-600">{activeFile}</span>
            </p>

            {/* KPI cards */}
            {statistics?.kpis?.length > 0 && (
              <section className="mb-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {statistics.kpis.map((kpi, i) => <KpiCard key={i} kpi={kpi} />)}
                </div>
              </section>
            )}

            {/* Tab bar */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-6">
              {[
                { key: "charts",  label: "Charts",  icon: BarChart2   },
                { key: "compare", label: "Compare", icon: GitCompare  },
                { key: "ml",      label: "ML Predict", icon: Sparkles },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition ${
                    activeTab === key ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {/* ── Charts tab ───────────────────────────────────────────── */}
            {activeTab === "charts" && (
              <>
                <FilterBar schema={schema} filters={filters} setFilters={setFilters} />

                {/* Chart controls */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold text-slate-800">
                    Visualizations
                    <span className="ml-2 text-sm font-normal text-gray-400">({filteredCharts.length} charts)</span>
                    <span className="ml-2 text-[11px] text-gray-400 font-normal">drag to reorder</span>
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                      {[
                        { key: "all",         label: "All"         },
                        { key: "numeric",     label: "Numeric"     },
                        { key: "categorical", label: "Categorical" },
                        { key: "date",        label: "Trend"       },
                        { key: "correlation", label: "Correlation" },
                      ].map(({ key, label }) => (
                        <button key={key} onClick={() => setChartFilter(key)}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                            chartFilter === key ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search charts…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 w-36"
                      />
                    </div>
                  </div>
                </div>

                {/* Drag-and-drop chart grid */}
                {filteredCharts.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                    <Activity size={20} className="mr-2" />
                    No charts match the current filter.
                  </div>
                ) : (
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="charts" direction="horizontal">
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10"
                        >
                          {filteredCharts.map((chart, index) => (
                            <Draggable key={chart.id} draggableId={chart.id} index={index}>
                              {(prov, snapshot) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  className={`${
                                    ["heatmap","line"].includes(chart.type)
                                      ? "md:col-span-2 xl:col-span-3"
                                      : ""
                                  } ${snapshot.isDragging ? "opacity-75 scale-[1.02] shadow-xl" : ""} transition-all`}
                                >
                                  <ChartCard chart={chart} dragHandleProps={prov.dragHandleProps} />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}

                {/* Stats / Schema tabs */}
                <Dashboard statistics={statistics} schema={schema} dataQuality={null} />
              </>
            )}

            {/* ── Compare tab ──────────────────────────────────────────── */}
            {activeTab === "compare" && (
              <ComparePanel serverFiles={serverFiles} currentFile={activeFile} />
            )}

            {/* ── ML tab ───────────────────────────────────────────────── */}
            {activeTab === "ml" && (
              <MLPanel
                filename={activeFile}
                numericColumns={statistics?.numeric_columns ?? []}
              />
            )}

          </div>
        )}
      </main>
    </div>
  );
}
