/**
 * DashboardPage.jsx — Upgraded with features:
 *   1. Download charts (PNG via Plotly built-in button)
 *   2. Drag-and-drop layout (@hello-pangea/dnd)
 *   3. PDF export (html2canvas + jsPDF)
 *   4. Compare two datasets
 *
 * install deps once:
 *   npm install @hello-pangea/dnd html2canvas jspdf
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Activity, AlertCircle, AlertTriangle, BarChart2, ChevronDown,
  Download, FileDown, Filter, FolderOpen, GitCompare, RefreshCw,
  Search, X, GripVertical,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
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
  blue:   { card: "bg-white border-blue-200",        value: "text-blue-700"   },
  green:  { card: "bg-white border-emerald-200",     value: "text-emerald-700"  },
  amber:  { card: "bg-white border-amber-200",       value: "text-amber-700"  },
  red:    { card: "bg-white border-red-200",         value: "text-red-700"    },
  purple: { card: "bg-white border-purple-200",      value: "text-purple-700" },
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
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 flex-shrink-0">
          <GripVertical size={16} />
        </div>
        <p className="text-sm font-semibold text-gray-800 leading-snug flex-1 truncate">{chart.title}</p>
        {chart.anomaly_message && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
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
    <div className="flex flex-wrap items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-6">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <Filter size={13} /> Filters
      </span>
      {catCols.slice(0, 4).map((col) => (
        <div key={col} className="relative">
          <select
            value={filters[col] ?? ""}
            onChange={(e) => setFilters((p) => ({ ...p, [col]: e.target.value || undefined }))}
            className="appearance-none text-xs border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
        <button onClick={() => setFilters({})} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700">
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
      const res = await axiosClient.post("/dashboard/compare", {
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
        <GitCompare size={18} style={{color: '#4361ee'}} />
        <h3 className="text-base font-semibold text-gray-800">Compare Datasets</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium text-indigo-600">{currentFile || "—"}</span>
          <span className="text-gray-400">vs</span>
        </div>
        <div className="relative">
          <select
            value={fileB}
            onChange={(e) => setFileB(e.target.value)}
            className="appearance-none text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
          className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white rounded-lg transition"
          style={{ background: '#4361ee' }}
          onMouseEnter={(e) => e.target.style.background = '#3e56d4'}
          onMouseLeave={(e) => e.target.style.background = '#4361ee'}
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
              <div key={i} className={`rounded-xl border p-4 ${i === 0 ? "border-blue-200 bg-blue-50" : "border-blue-200 bg-blue-50"}`}>
                <p className={`text-xs font-semibold mb-2 truncate ${i === 0 ? "text-blue-700" : "text-blue-700"}`}>{ds.filename}</p>
                {[
                  ["Rows",          ds.row_count?.toLocaleString()],
                  ["Columns",       ds.column_count],
                  ["Missing",       `${ds.missing_percent}%`],
                  ["Duplicates",    `${ds.duplicate_percent}%`],
                  ["Numeric cols",  ds.numeric_cols],
                  ["Categorical",   ds.categorical_cols],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs py-0.5">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-medium text-gray-600">{val}</span>
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
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
              <p className="font-semibold text-blue-700 mb-1">Only in B ({result.only_in_b.length})</p>
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
                    <th className="text-center py-2 px-2 font-semibold" style={{color: '#4361ee'}}>Mean A</th>
                    <th className="text-center py-2 px-2 font-semibold" style={{color: '#4361ee'}}>Mean B</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">Missing A</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">Missing B</th>
                  </tr>
                </thead>
                <tbody>
                  {result.dataset_a.shared_column_comparison.map((row) => (
                    <tr key={row.column} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="py-1.5 px-2 font-medium text-gray-600">{row.column}</td>
                      <td className="text-center py-1.5 px-2" style={{color: '#4361ee'}}>{row.mean_a != null ? Number(row.mean_a).toFixed(2) : row.top_a ?? "—"}</td>
                      <td className="text-center py-1.5 px-2" style={{color: '#4361ee'}}>{row.mean_b != null ? Number(row.mean_b).toFixed(2) : row.top_b ?? "—"}</td>
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

function formatMetricValue(kpi) {
  const value = kpi?.total ?? kpi?.avg ?? kpi?.value ?? 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "N/A");
  if (kpi?.type === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(numeric);
  }
  if (kpi?.type === "percentage") return `${numeric.toFixed(2)}%`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric);
}

function legacyChartToSpec(chart, index) {
  const id = `legacy_chart_${index + 1}`;
  const data = Array.isArray(chart?.data) ? chart.data : [];
  const type = chart?.type === "grouped_bar" ? "bar" : chart?.type;
  const yKeys = Array.isArray(chart?.yKeys) ? chart.yKeys : [];

  if (chart?.type === "pie") {
    return {
      id,
      title: chart.title || "Pie Chart",
      type: "pie",
      column: chart.nameKey || chart.valueKey || "category",
      traces: [{
        type: "pie",
        labels: data.map((row) => row?.[chart.nameKey]),
        values: data.map((row) => row?.[chart.valueKey]),
        hoverinfo: "label+percent+value",
        textinfo: "percent",
      }],
      layout: {},
    };
  }

  if (type === "histogram") {
    const yKey = yKeys[0] || "count";
    return {
      id,
      title: chart.title || "Histogram",
      type: "histogram",
      column: chart.xKey || "range",
      traces: [{
        type: "bar",
        x: data.map((row) => row?.[chart.xKey]),
        y: data.map((row) => row?.[yKey]),
        name: yKey,
      }],
      layout: { xaxis: { title: chart.xKey }, yaxis: { title: yKey } },
    };
  }

  return {
    id,
    title: chart?.title || "Chart",
    type: type || "bar",
    column: chart?.xKey || yKeys[0] || "value",
    traces: yKeys.map((key) => ({
      type: type === "bar" ? "bar" : "scatter",
      mode: type === "line" ? "lines+markers" : type === "scatter" ? "markers" : undefined,
      x: data.map((row) => row?.[chart.xKey]),
      y: data.map((row) => row?.[key]),
      name: key,
    })),
    layout: { xaxis: { title: chart?.xKey }, yaxis: { title: yKeys.join(", ") } },
  };
}

function normalizeDashboardResponse(data) {
  if (data?.statistics?.kpis && data?.statistics?.charts) return data;

  const schemaColumns = Object.fromEntries(
    Object.entries(data?.schema?.columns ?? {}).map(([name, meta]) => [
      name,
      {
        dtype: meta?.dtype || "unknown",
        is_numeric: Boolean(meta?.is_numeric),
        is_datetime: Boolean(meta?.is_datetime),
        is_categorical: Boolean(meta?.is_categorical),
        missing_percent: Number(meta?.missing_percent ?? 0),
        unique_count: Number(meta?.unique_count ?? 0),
        sample_values: Array.isArray(meta?.sample_values) ? meta.sample_values : [],
      },
    ]),
  );

  const numericColumns = Object.entries(schemaColumns)
    .filter(([, meta]) => meta.is_numeric)
    .map(([name]) => name);

  return {
    statistics: {
      numeric_summary: data?.statistics?.numeric_summary ?? {},
      categorical_summary: data?.statistics?.categorical_summary ?? {},
      correlation_matrix: data?.statistics?.correlation_matrix ?? null,
      outlier_counts: data?.statistics?.outlier_counts ?? {},
      numeric_columns: numericColumns,
      kpis: (data?.kpis ?? []).map((kpi) => ({
        label: kpi.label || kpi.key || "Metric",
        value: formatMetricValue(kpi),
        sub: kpi.count ? `${kpi.count.toLocaleString()} values` : undefined,
        color: kpi.trend === "decreasing" ? "amber" : "blue",
      })),
      charts: (data?.charts ?? []).map(legacyChartToSpec).filter((chart) => chart.traces.length > 0),
    },
    schema: {
      row_count: data?.schema?.row_count ?? data?.schema?.sampled_rows ?? 0,
      column_count: data?.schema?.column_count ?? Object.keys(schemaColumns).length,
      columns: schemaColumns,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main DashboardPage
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const sidebarOpen    = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const selectedFile   = useAppStore((s) => s.selectedFile);
  const clearSelectedFile = useAppStore((s) => s.clearSelectedFile);

  const [serverFiles,  setServerFiles]  = useState([]);
  const [filesLoaded,  setFilesLoaded]  = useState(false);
  const [activeFile,   setActiveFile]   = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [dashData,     setDashData]     = useState(null);
  const [filters,      setFilters]      = useState({});
  const [chartFilter,  setChartFilter]  = useState("all");
  const [search,       setSearch]       = useState("");
  const [chartOrder,   setChartOrder]   = useState([]);  // drag-and-drop order
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [activeTab,    setActiveTab]    = useState("charts"); // charts | compare

  const dashboardRef = useRef(null);

  // Load file list
  useEffect(() => {
    let cancelled = false;

    const namesFrom = (payload) => {
      const files = payload?.files ?? payload ?? [];
      return Array.isArray(files)
        ? files.map((f) => f?.filename ?? f?.name ?? f).filter(Boolean).map(String)
        : [];
    };

    const loadFiles = async () => {
      setFilesLoaded(false);
      try {
        const [raw, cleaned] = await Promise.all([
          axiosClient.get("/api/files"),
          axiosClient.get("/api/cleaned-files"),
        ]);
        if (cancelled) return;

        const names = Array.from(new Set([
          ...namesFrom(raw.data),
          ...namesFrom(cleaned.data),
        ])).sort((a, b) => a.localeCompare(b));

        setServerFiles(names);
      } catch (err) {
        if (!cancelled) {
          setError(err?.data?.detail ?? err?.message ?? "Failed to load available files.");
        }
      } finally {
        if (!cancelled) setFilesLoaded(true);
      }
    };

    loadFiles();
    return () => { cancelled = true; };
  }, []);

  // Sync Zustand → activeFile
  useEffect(() => {
    const zf = selectedFile?.filename ?? selectedFile?.name ?? null;
    if (zf) setActiveFile(zf);
  }, [selectedFile]);

  useEffect(() => {
    if (!filesLoaded || !activeFile || serverFiles.length === 0) return;
    if (!serverFiles.includes(activeFile)) {
      setDashData(null);
      setActiveFile("");
      clearSelectedFile();
      setError(`Selected file "${activeFile}" is not available for the current user. Choose a file from the list.`);
    }
  }, [activeFile, clearSelectedFile, filesLoaded, serverFiles]);

  // Fetch dashboard
  const fetchDashboard = useCallback(async (fname) => {
    if (!fname) return;
    setLoading(true);
    setError(null);
    setDashData(null);
    setFilters({});
    setChartOrder([]);
    try {
      console.log('Fetching dashboard for:', fname);
      const res = await axiosClient.post("/api/auto-dashboard/analyze", { filename: fname });
      const normalized = normalizeDashboardResponse(res.data);
      console.log('Dashboard response:', normalized);
      setDashData(normalized);
      setChartOrder((normalized.statistics?.charts ?? []).map((c) => c.id));
    } catch (err) {
      console.error('Dashboard Error:', err);
      const errorMsg = err?.data?.detail ?? err?.response?.data?.detail ?? err?.message ?? "Failed to generate dashboard.";
      console.error('Error message:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!filesLoaded || !activeFile) return;
    if (serverFiles.length > 0 && !serverFiles.includes(activeFile)) return;
    console.log('activeFile changed, fetching dashboard for:', activeFile);
    fetchDashboard(activeFile);
  }, [activeFile, fetchDashboard, filesLoaded, serverFiles]);

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
        className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white rounded-lg transition" style={{background: '#4361ee'}} onMouseEnter={(e) => e.target.style.background = '#3e56d4'} onMouseLeave={(e) => e.target.style.background = '#4361ee'}
      >
        <BarChart2 size={14} /> Generate
      </button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-6 p-6">
      <main className="w-full">

        {/* File selector and action buttons */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}>
          <div style={{ minWidth: '100px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Choose File:</div>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '300px' }}>
            <select
              value={activeFile}
              onChange={(e) => setActiveFile(e.target.value)}
              style={{
                width: '100%',
                appearance: 'none',
                background: 'white',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: '14px',
                color: 'var(--text)',
                cursor: 'pointer',
                paddingRight: '28px',
              }}
            >
              <option value="">Select a file...</option>
              {serverFiles.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text2)' }} />
          </div>
          <button
            onClick={() => fetchDashboard(activeFile)}
            disabled={!activeFile || loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 600,
              color: 'white',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: activeFile && !loading ? 'pointer' : 'not-allowed',
              opacity: (activeFile && !loading) ? 1 : 0.5,
            }}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <BarChart2 size={14} />}
            {loading ? 'Generating...' : 'Generate'}
          </button>
          {dashData && (
            <>
              <button onClick={() => fetchDashboard(activeFile)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '14px', background: 'var(--accent-light)', color: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                <RefreshCw size={14} /> Refresh
              </button>
              <button onClick={() => exportCSV(statistics, schema, activeFile.replace(/\.[^.]+$/, ""))}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '14px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                <Download size={14} /> CSV
              </button>
              <button
                onClick={() => exportPDF(dashboardRef, activeFile.replace(/\.[^.]+$/, ""), setPdfLoading)}
                disabled={pdfLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '14px', color: 'white', background: '#1f2937', border: 'none', borderRadius: 'var(--radius-sm)', cursor: pdfLoading ? 'not-allowed' : 'pointer', opacity: pdfLoading ? 0.5 : 1 }}
              >
                {pdfLoading ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />}
                {pdfLoading ? 'Exporting…' : 'PDF'}
              </button>
            </>
          )}
        </div>

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

          </div>
        )}
      </main>
    </div>
  );
}
