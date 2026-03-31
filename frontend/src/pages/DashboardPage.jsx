/**
 * DashboardPage.jsx — Fixed version
 *
 * Key fix: has its own file selector dropdown so it works
 * even when navigating directly to /dashboard.
 * Also reads selectedFile from Zustand as a convenience default.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart2,
  ChevronDown,
  Download,
  Filter,
  FolderOpen,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import axiosClient       from "../api/axiosClient";
import ChartPlot         from "../components/dashboard/ChartPlot";
import Dashboard         from "../components/dashboard/Dashboard";
import Navbar            from "../components/layout/Navbar";
import { useAppStore }   from "../stores/useAppStore";

// ─────────────────────────────────────────────────────────────────────────────
// KPI colours
// ─────────────────────────────────────────────────────────────────────────────

const KPI_COLOR = {
  blue:   { card: "bg-blue-50   border-blue-200",   value: "text-blue-700"   },
  green:  { card: "bg-green-50  border-green-200",  value: "text-green-700"  },
  amber:  { card: "bg-amber-50  border-amber-200",  value: "text-amber-700"  },
  red:    { card: "bg-red-50    border-red-200",     value: "text-red-700"    },
  purple: { card: "bg-purple-50 border-purple-200", value: "text-purple-700" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({ kpi }) {
  const c = KPI_COLOR[kpi.color] ?? KPI_COLOR.blue;
  return (
    <div className={`rounded-xl border p-5 ${c.card} flex flex-col gap-1`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
        {kpi.label}
      </p>
      <p className={`text-2xl font-bold leading-tight ${c.value} truncate`}>
        {kpi.value}
      </p>
      {kpi.sub && <p className="text-xs text-gray-400 truncate">{kpi.sub}</p>}
    </div>
  );
}

function ChartCard({ chart }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-1 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 leading-snug">{chart.title}</p>
        {chart.anomaly_message && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
            <AlertTriangle size={10} />
            {chart.anomaly_message}
          </span>
        )}
      </div>
      <ChartPlot
        type={chart.type}
        data={chart.traces}
        title={chart.title}
        height={280}
        layout={chart.layout ?? {}}
      />
    </div>
  );
}

function FilterBar({ schema, filters, setFilters }) {
  const catCols = useMemo(
    () =>
      Object.entries(schema?.columns ?? {})
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
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, [col]: e.target.value || undefined }))
            }
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
        <button onClick={() => setFilters({})}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition">
          <X size={12} /> Clear
        </button>
      )}
    </div>
  );
}

function exportCSV(statistics, schema, filename) {
  const rows = [];
  rows.push(["=== KPIs ==="]);
  rows.push(["Label", "Value", "Sub"]);
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
  rows.push(["=== Schema ==="]);
  rows.push(["Column","Type","Missing %","Unique"]);
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
// Main DashboardPage
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const sidebarOpen    = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const selectedFile   = useAppStore((s) => s.selectedFile);

  // ── File list (fetched from server so user can pick here too) ─────────
  const [serverFiles,  setServerFiles]  = useState([]);
  const [activeFile,   setActiveFile]   = useState("");  // the filename string being analyzed

  // ── Dashboard data ────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [dashData,     setDashData]     = useState(null);

  // ── UI state ──────────────────────────────────────────────────────────
  const [filters,      setFilters]      = useState({});
  const [chartFilter,  setChartFilter]  = useState("all");
  const [search,       setSearch]       = useState("");

  // ── Load file list on mount ───────────────────────────────────────────
  useEffect(() => {
    axiosClient.get("/api/files")
      .then((res) => {
        const files = res.data?.files ?? res.data ?? [];
        const names = Array.isArray(files)
          ? files.map((f) => f.filename ?? f.name ?? f).filter(Boolean)
          : [];
        setServerFiles(names);
      })
      .catch(() => {
        // If /api/files fails, silently ignore — user can still use Zustand selection
      });
  }, []);

  // ── Sync Zustand selectedFile → activeFile when navigating here ───────
  useEffect(() => {
    const zustandFile = selectedFile?.filename ?? selectedFile?.name ?? null;
    if (zustandFile && !activeFile) {
      setActiveFile(zustandFile);
    }
  }, [selectedFile]);

  // ── Fetch dashboard whenever activeFile changes ───────────────────────
  const fetchDashboard = useCallback(async (fname) => {
    if (!fname) return;
    setLoading(true);
    setError(null);
    setDashData(null);
    setFilters({});
    try {
      const res = await axiosClient.post("/api/dashboard/auto", { filename: fname });
      setDashData(res.data);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        "Failed to generate dashboard.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeFile) fetchDashboard(activeFile);
  }, [activeFile]);

  // ── Derived ───────────────────────────────────────────────────────────
  const { statistics, schema } = dashData ?? {};

  const filteredCharts = useMemo(() => {
    if (!statistics?.charts) return [];
    let charts = statistics.charts;
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
      charts = charts.filter(
        (c) => c.title.toLowerCase().includes(q) || c.column.toLowerCase().includes(q)
      );
    }
    return charts;
  }, [statistics, chartFilter, search]);

  // ─────────────────────────────────────────────────────────────────────
  // File selector bar — always visible at the top
  // ─────────────────────────────────────────────────────────────────────
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
            {serverFiles.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-2 text-gray-400 pointer-events-none" />
        </div>
      ) : (
        /* Fallback: manual text input if file list endpoint unavailable */
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
        <BarChart2 size={14} />
        Generate
      </button>

      {activeFile && (
        <span className="text-xs text-gray-400 truncate max-w-[200px]">
          {activeFile}
        </span>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="pt-24 pb-16 px-6 lg:px-12">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Auto Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Generates charts, KPIs and stats for any CSV automatically
            </p>
          </div>
          {dashData && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchDashboard(activeFile)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition"
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                onClick={() => exportCSV(statistics, schema, activeFile.replace(/\.[^.]+$/, ""))}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
          )}
        </div>

        {/* ── File selector — always shown ─────────────────────────────── */}
        {FileSelectorBar}

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <RefreshCw size={32} className="animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">
              Analyzing <strong>{activeFile}</strong>…
            </p>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && !loading && (
          <div className="max-w-xl bg-red-50 border border-red-200 rounded-xl p-6 flex gap-4 mb-6">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700 mb-1">Dashboard Error</p>
              <p className="text-sm text-red-600">{error}</p>
              <button
                onClick={() => fetchDashboard(activeFile)}
                className="mt-3 text-sm text-red-600 underline hover:text-red-800"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ── No file prompt ────────────────────────────────────────────── */}
        {!loading && !error && !dashData && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BarChart2 size={48} className="text-gray-200 mb-4" />
            <p className="text-base font-medium text-gray-400 mb-1">
              Select a file and click Generate
            </p>
            <p className="text-sm text-gray-300">
              The dashboard auto-detects column types and builds charts for any CSV
            </p>
          </div>
        )}

        {/* ── Dashboard content ─────────────────────────────────────────── */}
        {!loading && dashData && (
          <>
            {/* Dataset summary line */}
            <p className="text-xs text-gray-400 mb-5">
              {schema?.row_count?.toLocaleString()} rows · {schema?.column_count} columns ·{" "}
              <span className="font-medium text-gray-600">{activeFile}</span>
            </p>

            {/* KPI cards */}
            {statistics?.kpis?.length > 0 && (
              <section className="mb-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {statistics.kpis.map((kpi, i) => (
                    <KpiCard key={i} kpi={kpi} />
                  ))}
                </div>
              </section>
            )}

            {/* Categorical filters */}
            <FilterBar schema={schema} filters={filters} setFilters={setFilters} />

            {/* Chart section header with type tabs + search */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Visualizations
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({filteredCharts.length} charts)
                </span>
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
                    <button
                      key={key}
                      onClick={() => setChartFilter(key)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                        chartFilter === key
                          ? "bg-white text-gray-800 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
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

            {/* Charts grid */}
            {filteredCharts.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                <Activity size={20} className="mr-2" />
                No charts match the current filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
                {filteredCharts.map((chart) => (
                  <div
                    key={chart.id}
                    className={
                      ["heatmap","line"].includes(chart.type)
                        ? "md:col-span-2 xl:col-span-3"
                        : ""
                    }
                  >
                    <ChartCard chart={chart} />
                  </div>
                ))}
              </div>
            )}

            {/* Existing Dashboard stats/schema tabs (unchanged) */}
            <Dashboard
              statistics={statistics}
              schema={schema}
              dataQuality={null}
            />
          </>
        )}
      </main>
    </div>
  );
}
