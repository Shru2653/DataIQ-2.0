import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ShieldAlert,
  ShieldCheck,
  Shield,
  Lightbulb,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Info,
} from "lucide-react";

import { fadeInUp, staggerContainer, item } from "../../utils/animations";
import useDataQuality from "../../hooks/useDataQuality";

// ─── Original status logic (UNCHANGED) ───────────────────────────────────────

function getStatus(statusKey, value) {
  switch (statusKey) {
    case "missing_percent":
      if (value < 5)  return { label: "Good",     color: "green"  };
      if (value <= 15) return { label: "Moderate", color: "yellow" };
      return                  { label: "Critical", color: "red"    };
    case "duplicates_percent":
      if (value < 2)  return { label: "Good",     color: "green"  };
      if (value <= 8) return { label: "Moderate", color: "yellow" };
      return                  { label: "Critical", color: "red"    };
    case "completeness_score":
      if (value > 95)  return { label: "Excellent", color: "green"  };
      if (value >= 85) return { label: "Fair",       color: "yellow" };
      return                   { label: "Poor",       color: "red"    };
    case "outlier_percent":
      if (value < 5)  return { label: "Good",     color: "green"  };
      if (value <= 15) return { label: "Moderate", color: "yellow" };
      return                  { label: "Critical", color: "red"    };
    case "invalid_dates":
      if (value === 0) return { label: "Good",     color: "green"  };
      if (value <= 5)  return { label: "Moderate", color: "yellow" };
      return                   { label: "Critical", color: "red"    };
    case "datatype_issues":
      if (value === 0) return { label: "Good",     color: "green"  };
      if (value <= 2)  return { label: "Moderate", color: "yellow" };
      return                   { label: "Critical", color: "red"    };
    default:
      return { label: "Info", color: "blue" };
  }
}

// ─── Original colour maps (UNCHANGED) ────────────────────────────────────────

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

// ─── Original metric definitions (UNCHANGED) ──────────────────────────────────

const METRICS = [
  { key: "rows",               label: "Total Rows",     description: "Records in dataset",    icon: Database,      format: (v) => (v != null ? v.toLocaleString() : "—"), statusKey: null,                 showBar: false },
  { key: "columns",            label: "Total Columns",  description: "Dataset fields",        icon: Filter,        format: (v) => (v != null ? String(v) : "—"),          statusKey: null,                 showBar: false },
  { key: "missing_percent",    label: "Missing Values", description: "< 5 % is good",        icon: AlertTriangle, format: (v) => (v != null ? `${v.toFixed(1)} %` : "—"), statusKey: "missing_percent",    showBar: true  },
  { key: "duplicates_percent", label: "Duplicate Rows", description: "< 2 % is good",        icon: Layers,        format: (v) => (v != null ? `${v.toFixed(1)} %` : "—"), statusKey: "duplicates_percent", showBar: true  },
  { key: "completeness_score", label: "Completeness",   description: "> 95 % is excellent",  icon: CheckCircle,   format: (v) => (v != null ? `${v.toFixed(1)} %` : "—"), statusKey: "completeness_score", showBar: true  },
  { key: "outlier_percent",    label: "Outliers (IQR)", description: "< 5 % is good",        icon: Activity,      format: (v) => (v != null ? `${v.toFixed(1)} %` : "—"), statusKey: "outlier_percent",    showBar: true  },
  { key: "invalid_dates",      label: "Invalid Dates",  description: "0 is good",            icon: Calendar,      format: (v) => (v != null ? String(v) : "—"),            statusKey: "invalid_dates",      showBar: false },
  { key: "datatype_issues",    label: "Type Issues",    description: "0 is good",            icon: Type,          format: (v) => (v != null ? String(v) : "—"),            statusKey: "datatype_issues",    showBar: false },
];

// ─── Original sub-components (UNCHANGED) ─────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="w-14 h-14 rounded-lg bg-slate-200" />
        <div className="w-14 h-5 rounded-full bg-slate-200" />
      </div>
      <div className="w-20 h-7 rounded bg-slate-200 mb-2" />
      <div className="w-28 h-3 rounded bg-slate-150 mb-1" />
      <div className="w-24 h-2.5 rounded bg-slate-100 mb-3" />
      <div className="h-1.5 rounded-full bg-slate-100" />
    </div>
  );
}

function MetricCard({ metric, value, animDelay }) {
  const { label: statusLabel, color } = getStatus(metric.statusKey, value);
  const c    = COLORS[color];
  const Icon = metric.icon;
  const barWidth = metric.showBar ? Math.min(100, Math.max(0, value ?? 0)) : 0;

  return (
    <motion.div
      variants={item}
      className="h-full p-6 rounded-lg border bg-white shadow-sm text-center hover:shadow-md transition-shadow min-h-[140px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className={`w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>
          <Icon className={`w-7 h-7 ${c.icon}`} />
        </div>
        <span className={`ml-auto max-w-full text-[11px] font-semibold leading-none px-2.5 py-1 rounded-full whitespace-nowrap ${c.badge}`}>
          {metric.statusKey ? statusLabel : "Info"}
        </span>
      </div>
      <div className={`text-2xl font-bold leading-tight ${c.value}`}>
        {metric.format(value)}
      </div>
      <div className="text-sm font-semibold text-slate-700 uppercase tracking-wide mt-1">
        {metric.label}
      </div>
      <div className="text-sm text-slate-500 mt-0.5">{metric.description}</div>
      {metric.showBar && (
        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${c.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.75, ease: "easeOut", delay: animDelay + 0.1 }}
          />
        </div>
      )}
    </motion.div>
  );
}

function OverallBadge({ data }) {
  const hasCritical =
    data.missing_percent > 15 || data.duplicates_percent > 8 ||
    data.outlier_percent > 15  || data.completeness_score < 85 ||
    data.invalid_dates > 5     || data.datatype_issues > 2;
  const hasModerate =
    !hasCritical && (
      data.missing_percent > 5  || data.duplicates_percent > 2 ||
      data.outlier_percent > 5  || data.completeness_score < 95 ||
      data.invalid_dates > 0    || data.datatype_issues > 0
    );
  const label = hasCritical ? "Critical Issues Detected" : hasModerate ? "Moderate Quality" : "Good Data Quality";
  const color = hasCritical ? "red" : hasModerate ? "yellow" : "green";
  const c     = COLORS[color];

  return (
    <div className="mt-4 pt-4 border-t border-blue-100 flex flex-wrap items-center gap-3">
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${c.strip}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
        {label}
      </span>
      <span className="text-xs text-slate-500">
        {data.rows.toLocaleString()} rows &nbsp;·&nbsp;
        {data.columns} columns &nbsp;·&nbsp; Completeness&nbsp;
        {data.completeness_score.toFixed(1)}&nbsp;%
      </span>
    </div>
  );
}

// ─── NEW: Risk sub-components ─────────────────────────────────────────────────

const RISK_CFG = {
  high:   { bg: "bg-red-50",    border: "border-red-200",    badge: "bg-red-100 text-red-700",       text: "text-red-700",    dot: "bg-red-500",    icon: <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" /> },
  medium: { bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-700",   text: "text-amber-700",  dot: "bg-amber-400",  icon: <AlertCircle   size={15} className="text-amber-500 flex-shrink-0 mt-0.5" /> },
  low:    { bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700",     text: "text-blue-700",   dot: "bg-blue-400",   icon: <Info          size={15} className="text-blue-500 flex-shrink-0 mt-0.5" /> },
};

/** Dismissable high-risk banner */
function RiskBanner({ issues, onDismiss }) {
  const highIssues = issues.filter((i) => i.severity === "high");
  if (!highIssues.length) return null;
  return (
    <div className="flex items-start justify-between gap-3 bg-red-600 text-white rounded-xl px-4 py-3 mb-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ShieldAlert size={17} className="flex-shrink-0" />
        <p className="text-sm font-semibold">
          🚨 High Risk Detected — {highIssues.map((i) => i.issue).join(", ")} require immediate attention.
        </p>
      </div>
      <button onClick={onDismiss} className="flex-shrink-0 p-0.5 hover:bg-red-500 rounded transition">
        <X size={14} />
      </button>
    </div>
  );
}

/** Circular risk score gauge */
function RiskGauge({ score }) {
  const R       = 26;
  const circ    = 2 * Math.PI * R;
  const offset  = circ - (score / 100) * circ;
  const color   = score >= 70 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626";
  const label   = score >= 70 ? "Good"    : score >= 40 ? "Fair"    : "At Risk";
  const Icon    = score >= 70 ? ShieldCheck : score >= 40 ? Shield : ShieldAlert;

  return (
    <div className="flex items-center gap-3">
      <div className="relative w-14 h-14 flex-shrink-0">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle cx="32" cy="32" r={R} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Risk Score</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Icon size={13} style={{ color }} />
          <p className="text-xs font-semibold" style={{ color }}>{label}</p>
        </div>
      </div>
    </div>
  );
}

/** Single expandable risk issue card */
function RiskIssueCard({ issue }) {
  const [open, setOpen] = useState(false);
  const cfg = RISK_CFG[issue.severity] || RISK_CFG.low;

  return (
    <div className={`rounded-xl border ${cfg.bg} ${cfg.border} px-4 py-3 transition-all`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {cfg.icon}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">{issue.issue}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {issue.severity.toUpperCase()}
              </span>
            </div>
            <p className={`text-xs font-medium mt-0.5 ${cfg.text}`}>{issue.value}</p>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-white/60 transition text-gray-400">
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-t border-white/60 pt-3">
              {issue.detail && (
                <p className="text-xs text-gray-500">{issue.detail}</p>
              )}
              <div className="flex items-start gap-1.5 bg-white/70 rounded-lg px-3 py-2">
                <Lightbulb size={11} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-700">{issue.suggestion}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Severity pill summary */
function SeverityPills({ issues }) {
  const counts = issues.reduce((acc, i) => { acc[i.severity] = (acc[i.severity] || 0) + 1; return acc; }, {});
  const MAP = {
    high:   { bg: "bg-red-50 border-red-200 text-red-700",     dot: "bg-red-500"   },
    medium: { bg: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-400" },
    low:    { bg: "bg-blue-50 border-blue-200 text-blue-700",   dot: "bg-blue-400"  },
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {["high","medium","low"].map((sev) => counts[sev] ? (
        <span key={sev} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${MAP[sev].bg}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${MAP[sev].dot}`} />
          {counts[sev]} {sev}
        </span>
      ) : null)}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DataQualityPanel({ filename }) {
  const { analyze, isLoading, isError, error, data, reset } = useDataQuality();
  const [bannerVisible, setBannerVisible] = useState(true);
  const [riskFilter,    setRiskFilter]    = useState("all");

  // Original auto-trigger (UNCHANGED)
  useEffect(() => {
    if (!filename) { reset(); return; }
    analyze(filename).catch(() => {});
    setBannerVisible(true);
    setRiskFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  // ── Derived risk data ────────────────────────────────────────────────────
  const riskIssues  = data?.risk_issues  ?? [];
  const riskScore   = data?.risk_score   ?? null;
  const riskSummary = data?.risk_summary ?? "";
  const hasHighRisk = riskIssues.some((i) => i.severity === "high");

  const filteredRisk = riskFilter === "all"
    ? riskIssues
    : riskIssues.filter((i) => i.severity === riskFilter);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <motion.section
      initial={fadeInUp.initial}
      animate={fadeInUp.animate}
      transition={fadeInUp.transition}
      className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10"
    >
      {/* ── Panel header (original layout preserved) ─────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
            <BarChart2 className="w-7 h-7 text-white" />
          </div>
          <div className="flex flex-col space-y-1">
            <h2 className="text-xl font-semibold text-slate-800">
              Data Quality Monitoring
            </h2>
            <p className="text-sm text-gray-600">
              {filename ? `Analyzing: ${filename}` : "Select a file to view quality metrics"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* ✅ NEW: Risk gauge (only when data loaded) */}
          {data && riskScore !== null && <RiskGauge score={riskScore} />}

          {/* Original refresh button */}
          {filename && (
            <button
              onClick={() => analyze(filename).catch(() => {})}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              {isLoading ? "Analyzing…" : "Refresh"}
            </button>
          )}
        </div>
      </div>

      {/* ── Empty state (UNCHANGED) ──────────────────────────────────────── */}
      {!filename && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <BarChart2 className="w-12 h-12 mb-3 opacity-25" />
          <p className="text-sm font-medium">No dataset selected</p>
          <p className="text-xs mt-1">Upload or select a file above to begin quality analysis</p>
        </div>
      )}

      {/* ── Error state (UNCHANGED) ──────────────────────────────────────── */}
      {isError && filename && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error?.data?.detail || error?.message || "Failed to analyze file. Please try again."}</span>
        </div>
      )}

      {/* ── Skeleton cards (UNCHANGED) ───────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {METRICS.map((m) => <SkeletonCard key={m.key} />)}
        </div>
      )}

      {/* ── Live content ─────────────────────────────────────────────────── */}
      {!isLoading && data && (
        <>
          {/* ✅ NEW: High-risk alert banner */}
          {hasHighRisk && bannerVisible && (
            <RiskBanner issues={riskIssues} onDismiss={() => setBannerVisible(false)} />
          )}

          {/* Original metric cards grid (UNCHANGED) */}
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

          {/* Original overall badge (UNCHANGED) */}
          <OverallBadge data={data} />

          {/* ✅ NEW: Risk issues section — only shown when issues exist */}
          {riskIssues.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              {/* Risk section header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-800">Risk Analysis</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{riskSummary}</p>
                </div>
                <SeverityPills issues={riskIssues} />
              </div>

              {/* Filter tabs */}
              {riskIssues.length > 1 && (
                <div className="flex items-center gap-1 mb-4 p-1 bg-gray-100 rounded-lg w-fit">
                  {["all", "high", "medium", "low"].map((f) => {
                    const count = f === "all"
                      ? riskIssues.length
                      : riskIssues.filter((i) => i.severity === f).length;
                    if (f !== "all" && count === 0) return null;
                    return (
                      <button
                        key={f}
                        onClick={() => setRiskFilter(f)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                          riskFilter === f
                            ? "bg-white text-gray-800 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Risk issue cards — sorted high → medium → low */}
              <div className="space-y-3">
                {[...filteredRisk]
                  .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] ?? 3) - ({ high: 0, medium: 1, low: 2 }[b.severity] ?? 3))
                  .map((issue, idx) => (
                    <RiskIssueCard key={idx} issue={issue} />
                  ))}
              </div>

              <p className="text-[11px] text-gray-400 mt-4 text-right">
                Click any card to expand fix suggestions · Re-analyze after cleaning
              </p>
            </div>
          )}

          {/* Clean state — no risk issues */}
          {riskIssues.length === 0 && (
            <div className="mt-6 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <ShieldCheck size={18} className="text-green-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-700">No risk issues detected</p>
                <p className="text-xs text-green-600 mt-0.5">Dataset is clean and ready for modeling.</p>
              </div>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}
