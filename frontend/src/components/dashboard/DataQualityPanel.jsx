import React, { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Database,
  Filter,
  AlertTriangle,
  Layers,
  CheckCircle,
  Activity,
  BarChart2,
  RefreshCw,
  Calendar,
  Type,
} from "lucide-react";

import { fadeInUp, staggerContainer, item } from "../../utils/animations";
import useDataQuality from "../../hooks/useDataQuality";

// ─── Status logic ──────────────────────────────────────────────────────────────

/**
 * Returns a { label, color } object for a given metric key + numeric value.
 * color is one of: 'green' | 'yellow' | 'red' | 'blue'
 *
 * Thresholds:
 *   missing_percent    < 5 → green   5–15 → yellow   > 15 → red
 *   duplicates_percent < 2 → green   2–8  → yellow   >  8 → red
 *   completeness_score > 95 → green  85–95 → yellow  < 85 → red
 *   outlier_percent    < 5 → green   5–15 → yellow   > 15 → red
 *   invalid_dates      = 0 → green   ≤ 5  → yellow   >  5 → red
 *   datatype_issues    = 0 → green   ≤ 2  → yellow   >  2 → red
 *   rows / columns          → always blue (informational, no quality threshold)
 */
function getStatus(statusKey, value) {
  switch (statusKey) {
    case "missing_percent":
      if (value < 5) return { label: "Good", color: "green" };
      if (value <= 15) return { label: "Moderate", color: "yellow" };
      return { label: "Critical", color: "red" };

    case "duplicates_percent":
      if (value < 2) return { label: "Good", color: "green" };
      if (value <= 8) return { label: "Moderate", color: "yellow" };
      return { label: "Critical", color: "red" };

    case "completeness_score":
      if (value > 95) return { label: "Excellent", color: "green" };
      if (value >= 85) return { label: "Fair", color: "yellow" };
      return { label: "Poor", color: "red" };

    case "outlier_percent":
      if (value < 5) return { label: "Good", color: "green" };
      if (value <= 15) return { label: "Moderate", color: "yellow" };
      return { label: "Critical", color: "red" };

    case "invalid_dates":
      if (value === 0) return { label: "Good", color: "green" };
      if (value <= 5) return { label: "Moderate", color: "yellow" };
      return { label: "Critical", color: "red" };

    case "datatype_issues":
      if (value === 0) return { label: "Good", color: "green" };
      if (value <= 2) return { label: "Moderate", color: "yellow" };
      return { label: "Critical", color: "red" };

    default:
      return { label: "Info", color: "blue" };
  }
}

// ─── Tailwind colour maps ──────────────────────────────────────────────────────

const COLORS = {
  green: {
    card: "border-green-200  bg-green-50",
    value: "text-green-700",
    badge: "bg-green-100  text-green-700  border border-green-200",
    bar: "bg-green-400",
    icon: "text-green-600",
    iconBg: "bg-green-100",
    dot: "bg-green-500",
    strip: "bg-green-100  border-green-200  text-green-700",
  },
  yellow: {
    card: "border-yellow-200 bg-yellow-50",
    value: "text-yellow-700",
    badge: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    bar: "bg-yellow-400",
    icon: "text-yellow-600",
    iconBg: "bg-yellow-100",
    dot: "bg-yellow-500",
    strip: "bg-yellow-100 border-yellow-200 text-yellow-700",
  },
  red: {
    card: "border-red-200   bg-red-50",
    value: "text-red-700",
    badge: "bg-red-100   text-red-700   border border-red-200",
    bar: "bg-red-400",
    icon: "text-red-600",
    iconBg: "bg-red-100",
    dot: "bg-red-500",
    strip: "bg-red-100   border-red-200   text-red-700",
  },
  blue: {
    card: "border-blue-200  bg-blue-50",
    value: "text-blue-700",
    badge: "bg-blue-100  text-blue-700  border border-blue-200",
    bar: "bg-blue-400",
    icon: "text-blue-600",
    iconBg: "bg-blue-100",
    dot: "bg-blue-500",
    strip: "bg-blue-100  border-blue-200  text-blue-700",
  },
};

// ─── Metric definitions ────────────────────────────────────────────────────────

/**
 * Central config for all 8 metrics.
 * statusKey: null  →  informational card (always blue)
 * showBar: true    →  animated progress / fill bar rendered below the value
 */
const METRICS = [
  {
    key: "rows",
    label: "Total Rows",
    description: "Records in dataset",
    icon: Database,
    format: (v) => (v != null ? v.toLocaleString() : "—"),
    statusKey: null,
    showBar: false,
  },
  {
    key: "columns",
    label: "Total Columns",
    description: "Dataset fields",
    icon: Filter,
    format: (v) => (v != null ? String(v) : "—"),
    statusKey: null,
    showBar: false,
  },
  {
    key: "missing_percent",
    label: "Missing Values",
    description: "< 5 % is good",
    icon: AlertTriangle,
    format: (v) => (v != null ? `${v.toFixed(1)} %` : "—"),
    statusKey: "missing_percent",
    showBar: true,
  },
  {
    key: "duplicates_percent",
    label: "Duplicate Rows",
    description: "< 2 % is good",
    icon: Layers,
    format: (v) => (v != null ? `${v.toFixed(1)} %` : "—"),
    statusKey: "duplicates_percent",
    showBar: true,
  },
  {
    key: "completeness_score",
    label: "Completeness",
    description: "> 95 % is excellent",
    icon: CheckCircle,
    format: (v) => (v != null ? `${v.toFixed(1)} %` : "—"),
    statusKey: "completeness_score",
    showBar: true,
  },
  {
    key: "outlier_percent",
    label: "Outliers (IQR)",
    description: "< 5 % is good",
    icon: Activity,
    format: (v) => (v != null ? `${v.toFixed(1)} %` : "—"),
    statusKey: "outlier_percent",
    showBar: true,
  },
  {
    key: "invalid_dates",
    label: "Invalid Dates",
    description: "0 is good",
    icon: Calendar,
    format: (v) => (v != null ? String(v) : "—"),
    statusKey: "invalid_dates",
    showBar: false,
  },
  {
    key: "datatype_issues",
    label: "Type Issues",
    description: "0 is good",
    icon: Type,
    format: (v) => (v != null ? String(v) : "—"),
    statusKey: "datatype_issues",
    showBar: false,
  },
];

// ─── Skeleton card (shown while loading) ──────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 animate-pulse">
      {/* icon + badge row */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-14 h-14 rounded-lg bg-slate-200" />
        <div className="w-14 h-5 rounded-full bg-slate-200" />
      </div>
      {/* value */}
      <div className="w-20 h-7 rounded bg-slate-200 mb-2" />
      {/* label */}
      <div className="w-28 h-3 rounded bg-slate-150 mb-1" />
      {/* description */}
      <div className="w-24 h-2.5 rounded bg-slate-100 mb-3" />
      {/* bar */}
      <div className="h-1.5 rounded-full bg-slate-100" />
    </div>
  );
}

// ─── Single metric card ────────────────────────────────────────────────────────

function MetricCard({ metric, value, animDelay }) {
  const { label: statusLabel, color } = getStatus(metric.statusKey, value);
  const c = COLORS[color];
  const Icon = metric.icon;

  // Clamp bar width to [0, 100]
  const barWidth = metric.showBar ? Math.min(100, Math.max(0, value ?? 0)) : 0;

  return (
    <motion.div
      variants={item}
      className="h-full p-6 rounded-lg border bg-white shadow-sm text-center hover:shadow-md transition-shadow min-h-[140px]"
    >
      {/* ── Header: icon + status badge ──────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div
          className={`w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 ${c.iconBg}`}
        >
          <Icon className={`w-7 h-7 ${c.icon}`} />
        </div>
        <span
          className={`ml-auto max-w-full text-[11px] font-semibold leading-none px-2.5 py-1 rounded-full whitespace-nowrap ${c.badge}`}
        >
          {metric.statusKey ? statusLabel : "Info"}
        </span>
      </div>

      {/* ── Primary value ─────────────────────────────────────────────── */}
      <div className={`text-2xl font-bold leading-tight ${c.value}`}>
        {metric.format(value)}
      </div>

      {/* ── Label + hint text ─────────────────────────────────────────── */}
      <div className="text-sm font-semibold text-slate-700 uppercase tracking-wide mt-1">
        {metric.label}
      </div>
      <div className="text-sm text-slate-500 mt-0.5">{metric.description}</div>

      {/* ── Animated progress bar (percentage metrics only) ───────────── */}
      {metric.showBar && (
        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${c.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{
              duration: 0.75,
              ease: "easeOut",
              delay: animDelay + 0.1,
            }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ─── Overall quality summary strip ────────────────────────────────────────────

function OverallBadge({ data }) {
  const hasCritical =
    data.missing_percent > 15 ||
    data.duplicates_percent > 8 ||
    data.outlier_percent > 15 ||
    data.completeness_score < 85 ||
    data.invalid_dates > 5 ||
    data.datatype_issues > 2;

  const hasModerate =
    !hasCritical &&
    (data.missing_percent > 5 ||
      data.duplicates_percent > 2 ||
      data.outlier_percent > 5 ||
      data.completeness_score < 95 ||
      data.invalid_dates > 0 ||
      data.datatype_issues > 0);

  const label = hasCritical
    ? "Critical Issues Detected"
    : hasModerate
      ? "Moderate Quality"
      : "Good Data Quality";

  const color = hasCritical ? "red" : hasModerate ? "yellow" : "green";
  const c = COLORS[color];

  return (
    <div className="mt-4 pt-4 border-t border-blue-100 flex flex-wrap items-center gap-3">
      {/* Overall quality pill */}
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${c.strip}`}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
        {label}
      </span>

      {/* Quick summary text */}
      <span className="text-xs text-slate-500">
        {data.rows.toLocaleString()} rows &nbsp;·&nbsp;
        {data.columns} columns &nbsp;·&nbsp; Completeness&nbsp;
        {data.completeness_score.toFixed(1)}&nbsp;%
      </span>
    </div>
  );
}

// ─── Main exported component ───────────────────────────────────────────────────

/**
 * DataQualityPanel
 *
 * Renders a "Data Quality Monitoring" panel.
 * Automatically calls POST /api/data-quality whenever `filename` changes.
 * Shows skeleton cards while loading, an error banner on failure,
 * and 8 colour-coded metric cards + an overall quality badge on success.
 *
 * Props:
 *   filename {string | null | undefined}  – the currently selected file name
 */
export default function DataQualityPanel({ filename }) {
  const { analyze, isLoading, isError, error, data, reset } = useDataQuality();

  // ── Auto-trigger analysis on file change ───────────────────────────────────
  useEffect(() => {
    if (!filename) {
      reset();
      return;
    }
    // Fire-and-forget; errors surface via isError / error state
    analyze(filename).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.section
      initial={fadeInUp.initial}
      animate={fadeInUp.animate}
      transition={fadeInUp.transition}
      className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10"
    >
      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Icon badge — matches the style used in FileList and Navbar */}
          <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
            <BarChart2 className="w-7 h-7 text-white" />
          </div>
          <div className="flex flex-col space-y-1">
            <h2 className="text-xl font-semibold text-slate-800">
              Data Quality Monitoring
            </h2>
            <p className="text-sm text-gray-600">
              {filename
                ? `Analyzing: ${filename}`
                : "Select a file to view quality metrics"}
            </p>
          </div>
        </div>

        {/* Refresh button — only shown when a file is selected */}
        {filename && (
          <button
            onClick={() => analyze(filename).catch(() => {})}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
            {isLoading ? "Analyzing…" : "Refresh"}
          </button>
        )}
      </div>

      {/* ── Empty state: no file selected ───────────────────────────────── */}
      {!filename && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <BarChart2 className="w-12 h-12 mb-3 opacity-25" />
          <p className="text-sm font-medium">No dataset selected</p>
          <p className="text-xs mt-1">
            Upload or select a file above to begin quality analysis
          </p>
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {isError && filename && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>
            {error?.data?.detail ||
              error?.message ||
              "Failed to analyze file. Please try again."}
          </span>
        </div>
      )}

      {/* ── Skeleton cards (loading) ─────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {METRICS.map((m) => (
            <SkeletonCard key={m.key} />
          ))}
        </div>
      )}

      {/* ── Live metric cards ────────────────────────────────────────────── */}
      {!isLoading && data && (
        <>
          <motion.div
            variants={staggerContainer(0.07)}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
          >
            {METRICS.map((metric, idx) => (
              <MetricCard
                key={metric.key}
                metric={metric}
                value={data[metric.key]}
                animDelay={idx * 0.07}
              />
            ))}
          </motion.div>

          {/* Overall quality summary strip */}
          <OverallBadge data={data} />
        </>
      )}
    </motion.section>
  );
}
