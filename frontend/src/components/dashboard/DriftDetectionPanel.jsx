import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  Database,
  GitCompare,
  Info,
  Minus,
  Plus,
  RefreshCw,
} from "lucide-react";

import { fadeInUp, staggerContainer, item } from "../../utils/animations";
import useDriftDetection from "../../hooks/useDriftDetection";
import useRawDatasets from "../../hooks/useRawDatasets";
import useCleanedDatasets from "../../hooks/useCleanedDatasets";

// ─── Drift status config (mirrors SEVERITY_CONFIG in CleaningRecommendationsPanel) ─

const DRIFT_STATUS = {
  stable: {
    card: "border-green-200 bg-green-50",
    badge: "bg-green-100 text-green-700 border border-green-200",
    icon: "text-green-600",
    iconBg: "bg-green-100",
    dot: "bg-green-500",
    bar: "bg-green-400",
    label: "Stable",
    Icon: CheckCircle,
  },
  warning: {
    card: "border-yellow-200 bg-yellow-50",
    badge: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    icon: "text-yellow-600",
    iconBg: "bg-yellow-100",
    dot: "bg-yellow-500",
    bar: "bg-yellow-400",
    label: "Moderate Drift",
    Icon: AlertTriangle,
  },
  drift_detected: {
    card: "border-red-200 bg-red-50",
    badge: "bg-red-100 text-red-700 border border-red-200",
    icon: "text-red-600",
    iconBg: "bg-red-100",
    dot: "bg-red-500",
    bar: "bg-red-400",
    label: "High Drift",
    Icon: AlertCircle,
  },
};

// ─── Skeleton card (shown while loading) ──────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:p-7 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="w-14 h-14 rounded-lg bg-slate-200" />
        <div className="w-24 h-5 rounded-full bg-slate-200" />
      </div>
      <div className="w-1/2 h-4 rounded bg-slate-200 mb-3" />
      <div className="flex items-center justify-between mb-1.5">
        <div className="w-20 h-3 rounded bg-slate-150" />
        <div className="w-12 h-3 rounded bg-slate-200" />
      </div>
      <div className="h-1.5 rounded-full bg-slate-100" />
      <div className="w-32 h-2.5 rounded bg-slate-100 mt-3" />
    </div>
  );
}

// ─── Single drift result card ─────────────────────────────────────────────────

function DriftCard({ result }) {
  const status = result.status ?? "stable";
  const config = DRIFT_STATUS[status] ?? DRIFT_STATUS.stable;
  const { Icon } = config;

  // KS statistic is 0–1; show as a percentage width bar
  const barPct = Math.min(100, Math.round((result.drift_score ?? 0) * 100));

  return (
    <motion.div
      variants={item}
      className={`h-full flex flex-col bg-white rounded-xl border shadow-sm p-6 lg:p-7 min-h-[260px] hover:shadow-md transition-shadow ${config.card}`}
    >
      {/* Header: icon + status badge */}
      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 ${config.iconBg}`}
        >
          <Icon className={`w-7 h-7 ${config.icon}`} />
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${config.badge}`}
        >
          {config.label}
        </span>
      </div>

      {/* Column name */}
      <p
        className="text-sm font-bold text-slate-800 mb-3 truncate"
        title={result.column}
      >
        {result.column}
      </p>

      {/* Drift score row */}
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
        <span>Drift Score (KS)</span>
        <span className={`font-semibold ${config.icon}`}>
          {(result.drift_score ?? 0).toFixed(4)}
        </span>
      </div>

      {/* Animated score bar */}
      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2 mb-2.5">
        <motion.div
          className={`h-full rounded-full ${config.bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${barPct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>

      {/* p-value */}
      <div className="mt-auto pt-1 text-xs text-slate-400">
        p-value:{" "}
        <span className="font-medium text-slate-600">
          {(result.p_value ?? 0).toFixed(4)}
        </span>
        {result.p_value < 0.05 && (
          <span className="ml-1.5 text-red-500 font-semibold">&lt; 0.05</span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Schema changes section ───────────────────────────────────────────────────

function SchemaChangesSection({ schemaChanges }) {
  const {
    new_columns = [],
    removed_columns = [],
    type_changes = [],
  } = schemaChanges;

  const hasAny =
    new_columns.length + removed_columns.length + type_changes.length > 0;

  if (!hasAny) {
    return (
      <div className="flex items-center gap-2.5 p-3 rounded-lg bg-green-50 border border-green-200">
        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
        <p className="text-sm text-green-700 font-medium">
          No schema changes detected — both datasets share the same structure.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* New columns */}
      {new_columns.length > 0 && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Plus className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-blue-700">
              New Columns&nbsp;
              <span className="font-bold">({new_columns.length})</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {new_columns.map((col) => (
              <span
                key={col}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Removed columns */}
      {removed_columns.length > 0 && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <Minus className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-700">
              Removed Columns&nbsp;
              <span className="font-bold">({removed_columns.length})</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {removed_columns.map((col) => (
              <span
                key={col}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Type changes */}
      {type_changes.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <ArrowRight className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-amber-700">
              Data Type Changes&nbsp;
              <span className="font-bold">({type_changes.length})</span>
            </span>
          </div>
          <div className="space-y-1.5">
            {type_changes.map((tc) => (
              <div
                key={tc.column}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <span className="font-semibold text-amber-900">
                  {tc.column}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 font-mono">
                  {tc.previous_type}
                </span>
                <ArrowRight className="w-3 h-3 text-amber-500 flex-shrink-0" />
                <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 font-mono">
                  {tc.current_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ summary, prevFile, currFile }) {
  if (!summary) return null;

  return (
    <div className="mt-5 pt-4 border-t border-teal-100">
      {/* File pair label */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mb-3">
        <Database className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-medium text-slate-700 truncate max-w-[160px]">
          {prevFile}
        </span>
        <ArrowRight className="w-3 h-3 text-slate-400" />
        <span className="font-medium text-slate-700 truncate max-w-[160px]">
          {currFile}
        </span>
      </div>

      {/* Count pills */}
      <div className="flex flex-wrap gap-2.5">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-teal-100 border-teal-200 text-teal-700">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-teal-500" />
          {summary.total_columns_checked} Column
          {summary.total_columns_checked !== 1 ? "s" : ""} Checked
        </span>

        {summary.drifted_columns > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-red-100 border-red-200 text-red-700">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-500" />
            {summary.drifted_columns} High Drift
          </span>
        )}

        {summary.warning_columns > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-yellow-100 border-yellow-200 text-yellow-700">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-500" />
            {summary.warning_columns} Moderate
          </span>
        )}

        {summary.stable_columns > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-green-100 border-green-200 text-green-700">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
            {summary.stable_columns} Stable
          </span>
        )}

        {summary.schema_changes_count > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-amber-100 border-amber-200 text-amber-700">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-500" />
            {summary.schema_changes_count} Schema Change
            {summary.schema_changes_count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Section heading (reused for Schema + Drift sections) ────────────────────

function SectionHeading({ icon: Icon, label, count, iconClass, badgeClass }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
        {label}
      </h3>
      {count != null && (
        <span
          className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ─── File selector dropdown ───────────────────────────────────────────────────

function FileSelect({ label, value, onChange, options, exclude }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-3 py-2 pr-8 text-sm border border-slate-300
            rounded-lg bg-white text-slate-700
            focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors"
        >
          <option value="">— Select a file —</option>
          {options
            .filter((name) => name !== exclude)
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

/**
 * DriftDetectionPanel
 *
 * Renders a "Data Drift & Schema Monitoring" panel below CleaningRecommendationsPanel.
 * The user selects a baseline (previous) and a current dataset from their uploaded files,
 * then clicks "Compare" to run POST /api/drift-analysis.
 *
 * Results are split into two sections:
 *   1. Schema Changes  – new/removed columns + type changes
 *   2. Data Drift      – per-column KS drift score cards (green/yellow/red)
 *
 * Props:
 *   filename {string | null | undefined} – the currently selected file; pre-fills
 *                                          the "Current Dataset" selector.
 */
export default function DriftDetectionPanel({ filename }) {
  const { analyze, isLoading, isError, error, data, reset } =
    useDriftDetection();

  const [previousFile, setPreviousFile] = useState("");
  const [currentFile, setCurrentFile] = useState(filename || "");

  // ── File lists for dropdowns ──────────────────────────────────────────────
  const rawQuery = useRawDatasets();
  const cleanedQuery = useCleanedDatasets();

  // Previous Dataset (Baseline) — original uploaded files only
  const rawOptions = useMemo(
    () =>
      (rawQuery.data?.files ?? [])
        .map((f) => f.filename)
        .filter(Boolean)
        .sort(),
    [rawQuery.data],
  );

  // Current Dataset — cleaned / processed files only
  const cleanedOptions = useMemo(
    () =>
      (cleanedQuery.data?.files ?? [])
        .map((f) => f.filename)
        .filter(Boolean)
        .sort(),
    [cleanedQuery.data],
  );

  // ── Sync current file when parent selection changes ───────────────────────
  useEffect(() => {
    if (filename) setCurrentFile(filename);
  }, [filename]);

  // ── Clear results when file selection changes ─────────────────────────────
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousFile, currentFile]);

  const canAnalyze =
    Boolean(previousFile) &&
    Boolean(currentFile) &&
    previousFile !== currentFile;

  const handleAnalyze = () => {
    if (!canAnalyze) return;
    analyze({
      previous_filename: previousFile,
      current_filename: currentFile,
    }).catch(() => {});
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const schemaChanges = data?.schema_changes;
  const driftResults = data?.drift_results ?? [];
  const summary = data?.summary;

  const driftedCount = driftResults.filter(
    (r) => r.status === "drift_detected",
  ).length;
  const warningCount = driftResults.filter(
    (r) => r.status === "warning",
  ).length;
  const stableCount = driftResults.filter((r) => r.status === "stable").length;

  return (
    <motion.section
      initial={fadeInUp.initial}
      animate={fadeInUp.animate}
      transition={fadeInUp.transition}
      className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10"
    >
      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md">
            <GitCompare className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col space-y-1">
            <h2 className="text-xl font-semibold text-slate-800">
              Data Drift &amp; Schema Monitoring
            </h2>
            <p className="text-sm text-gray-600">
              Compare two datasets to detect distribution drift and schema
              changes
            </p>
          </div>
        </div>

        {/* Re-run button — only shown once a comparison has been made */}
        {data && (
          <button
            onClick={handleAnalyze}
            disabled={isLoading || !canAnalyze}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-teal-700
              bg-teal-100 hover:bg-teal-200 rounded-lg transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
            {isLoading ? "Analyzing…" : "Re-run"}
          </button>
        )}
      </div>

      {/* ── File selector card ─────────────────────────────────────────────── */}
      <div className="bg-white/70 border border-teal-100 rounded-xl p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <FileSelect
            label="Previous Dataset (Baseline)"
            value={previousFile}
            onChange={setPreviousFile}
            options={rawOptions}
            exclude={currentFile}
          />
          <FileSelect
            label="Current Dataset"
            value={currentFile}
            onChange={setCurrentFile}
            options={cleanedOptions}
            exclude={previousFile}
          />
        </div>

        {/* Hint when same file selected */}
        {previousFile && currentFile && previousFile === currentFile && (
          <div className="flex items-center gap-2 mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              Please select two <strong>different</strong> files to compare.
            </span>
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={isLoading || !canAnalyze}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2
            bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-semibold
            rounded-lg shadow hover:shadow-md hover:scale-[1.02]
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Activity className="w-4 h-4" />
              Compare Datasets
            </>
          )}
        </button>

        {/* Hints when no files are available in a given category */}
        {rawOptions.length === 0 && !rawQuery.isLoading && (
          <p className="mt-2 text-xs text-slate-400">
            No raw datasets found. Upload a dataset to use it as the baseline.
          </p>
        )}
        {cleanedOptions.length === 0 && !cleanedQuery.isLoading && (
          <p className="mt-2 text-xs text-slate-400">
            No cleaned datasets found. Run the pipeline on a dataset first to
            generate a processed version.
          </p>
        )}
      </div>

      {/* ── Error state ────────────────────────────────────────────────────── */}
      {isError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mb-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>
            {error?.data?.detail ||
              error?.message ||
              "Failed to run drift analysis. Please try again."}
          </span>
        </div>
      )}

      {/* ── Loading skeletons ──────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-6">
          {/* Schema skeleton */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-slate-200 animate-pulse" />
              <div className="w-36 h-4 rounded bg-slate-200 animate-pulse" />
            </div>
            <div className="h-16 rounded-lg bg-slate-100 animate-pulse" />
          </div>
          {/* Drift skeleton */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-slate-200 animate-pulse" />
              <div className="w-28 h-4 rounded bg-slate-200 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {!isLoading && data && (
        <div className="space-y-6">
          {/* Info banner */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-white/60 border border-teal-100 text-xs text-slate-600">
            <Info className="w-3.5 h-3.5 text-teal-500 flex-shrink-0 mt-0.5" />
            <span>
              Schema changes compare column names and data types between the two
              files. Drift scores use the Kolmogorov-Smirnov two-sample test — a
              p-value below 0.05 indicates a statistically significant shift in
              distribution.
            </span>
          </div>

          {/* ── Section 1: Schema Changes ─────────────────────────────────── */}
          <div>
            <SectionHeading
              icon={Database}
              label="Schema Changes"
              count={summary?.schema_changes_count}
              iconClass="bg-amber-100 text-amber-600"
              badgeClass={
                summary?.schema_changes_count > 0
                  ? "bg-amber-100 border-amber-200 text-amber-700"
                  : "bg-green-100 border-green-200 text-green-700"
              }
            />
            {schemaChanges && (
              <SchemaChangesSection schemaChanges={schemaChanges} />
            )}
          </div>

          {/* ── Section 2: Data Drift ─────────────────────────────────────── */}
          <div>
            <SectionHeading
              icon={Activity}
              label="Data Drift"
              count={driftResults.length}
              iconClass="bg-teal-100 text-teal-600"
              badgeClass="bg-teal-100 border-teal-200 text-teal-700"
            />

            {driftResults.length === 0 ? (
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <p className="text-sm text-slate-500">
                  No numeric columns shared between the two datasets — drift
                  analysis requires at least one common numeric column.
                </p>
              </div>
            ) : (
              <>
                {/* Quick legend */}
                <div className="flex flex-wrap gap-3 mb-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Stable (p ≥ 0.05)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                    Moderate (p &lt; 0.05, KS &lt; 0.3)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    High Drift (p &lt; 0.05, KS ≥ 0.3)
                  </span>
                </div>

                <motion.div
                  variants={staggerContainer(0.06)}
                  initial="initial"
                  animate="animate"
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6"
                >
                  {driftResults.map((result) => (
                    <DriftCard key={result.column} result={result} />
                  ))}
                </motion.div>
              </>
            )}
          </div>

          {/* Summary strip */}
          <SummaryStrip
            summary={summary}
            prevFile={data.previous_filename}
            currFile={data.current_filename}
          />
        </div>
      )}
    </motion.section>
  );
}
