import React, { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Wrench,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Lightbulb,
  Info,
} from "lucide-react";

import { fadeInUp, staggerContainer, item } from "../../utils/animations";
import useCleaningRecommendations from "../../hooks/useCleaningRecommendations";

// ─── Severity configuration ───────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  high: {
    card: "border-red-200 bg-red-50",
    badge: "bg-red-100 text-red-700 border border-red-200",
    icon: "text-red-600",
    iconBg: "bg-red-100",
    dot: "bg-red-500",
    strip: "bg-red-100 border-red-200 text-red-700",
    label: "High",
    Icon: AlertCircle,
  },
  medium: {
    card: "border-yellow-200 bg-yellow-50",
    badge: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    icon: "text-yellow-600",
    iconBg: "bg-yellow-100",
    dot: "bg-yellow-500",
    strip: "bg-yellow-100 border-yellow-200 text-yellow-700",
    label: "Medium",
    Icon: AlertTriangle,
  },
  low: {
    card: "border-green-200 bg-green-50",
    badge: "bg-green-100 text-green-700 border border-green-200",
    icon: "text-green-600",
    iconBg: "bg-green-100",
    dot: "bg-green-500",
    strip: "bg-green-100 border-green-200 text-green-700",
    label: "Low",
    Icon: CheckCircle,
  },
};

// ─── Skeleton card (shown while loading) ──────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 animate-pulse">
      {/* icon + badge row */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-slate-200" />
        <div className="w-16 h-5 rounded-full bg-slate-200" />
      </div>
      {/* issue title */}
      <div className="w-3/4 h-4 rounded bg-slate-200 mb-2" />
      <div className="w-full h-3 rounded bg-slate-150 mb-1" />
      {/* recommendation box */}
      <div className="mt-3 p-2 rounded-lg bg-slate-100">
        <div className="w-full h-2.5 rounded bg-slate-200 mb-1.5" />
        <div className="w-5/6 h-2.5 rounded bg-slate-200" />
      </div>
      {/* affected rows */}
      <div className="w-1/3 h-2.5 rounded bg-slate-100 mt-3" />
    </div>
  );
}

// ─── Single recommendation card ───────────────────────────────────────────────

function RecommendationCard({ recommendation }) {
  const severity = (recommendation.severity ?? "low").toLowerCase();
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.low;
  const { Icon } = config;

  // Map action_type to a short human-friendly label
  const ACTION_LABELS = {
    fill_missing: "Fill Missing",
    remove_duplicates: "Remove Duplicates",
    fix_dates: "Fix Dates",
    drop_column: "Drop Column",
    fix_types: "Fix Types",
  };
  const actionLabel = recommendation.action_type
    ? (ACTION_LABELS[recommendation.action_type] ?? recommendation.action_type)
    : null;

  return (
    <motion.div
      variants={item}
      className={`h-full flex flex-col bg-white rounded-xl border shadow-sm p-6 lg:p-8 min-h-[200px] hover:shadow-md transition-shadow ${config.card}`}
    >
      {/* ── Header: severity icon + badge ─────────────────────────────── */}
      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 ${config.iconBg}`}
        >
          <Icon className={`w-7 h-7 ${config.icon}`} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${config.badge}`}
          >
            {config.label}
          </span>
          {actionLabel && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-slate-600 border border-slate-200">
              {actionLabel}
            </span>
          )}
        </div>
      </div>

      {/* ── Issue title ───────────────────────────────────────────────── */}
      <p className="text-lg font-semibold text-slate-800 leading-snug mb-3">
        {recommendation.issue}
      </p>

      {/* ── Suggested fix box ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/70 border border-slate-100">
        <Lightbulb className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600 leading-relaxed">
          {recommendation.recommendation}
        </p>
      </div>

      {/* ── Affected rows (when available) ────────────────────────────── */}
      {recommendation.affected_rows != null && (
        <div className="mt-3 text-sm text-slate-500">
          Affected rows:{" "}
          <span className="font-semibold text-slate-700">
            {recommendation.affected_rows.toLocaleString()}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ summary }) {
  if (!summary || summary.total === 0) return null;

  return (
    <div className="mt-5 pt-4 border-t border-purple-100 flex flex-wrap items-center gap-2.5">
      {/* Total pill */}
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-purple-100 border-purple-200 text-purple-700">
        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-500" />
        {summary.total} Recommendation{summary.total !== 1 ? "s" : ""}
      </span>

      {summary.high > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-red-100 border-red-200 text-red-700">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-500" />
          {summary.high} High
        </span>
      )}

      {summary.medium > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-yellow-100 border-yellow-200 text-yellow-700">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-yellow-500" />
          {summary.medium} Medium
        </span>
      )}

      {summary.low > 0 && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-green-100 border-green-200 text-green-700">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
          {summary.low} Low
        </span>
      )}

      {/* Hint text */}
      <span className="text-xs text-slate-500 ml-1">
        Sorted by severity · Review each suggestion before applying
      </span>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

/**
 * CleaningRecommendationsPanel
 *
 * Renders a "Cleaning Recommendations" panel below the Data Quality Monitoring module.
 * Automatically calls POST /api/cleaning-recommendations whenever `filename` changes.
 * Shows skeleton cards while loading, an error banner on failure, a congratulatory
 * empty state when no issues are found, and severity-coloured recommendation cards
 * (High → red, Medium → yellow, Low → green) on success.
 *
 * Props:
 *   filename {string | null | undefined}  – the currently selected file name
 */
export default function CleaningRecommendationsPanel({ filename }) {
  const { analyze, isLoading, isError, error, data, reset } =
    useCleaningRecommendations();

  // ── Auto-trigger analysis on file change (mirrors DataQualityPanel pattern) ──
  useEffect(() => {
    if (!filename) {
      reset();
      return;
    }
    analyze(filename).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  const recommendations = data?.recommendations ?? [];
  const summary = data?.summary;

  return (
    <motion.section
      initial={fadeInUp.initial}
      animate={fadeInUp.animate}
      transition={fadeInUp.transition}
      className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10"
    >
      {/* ── Panel header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Icon badge — matches the style used in DataQualityPanel */}
          <div className="w-14 h-14 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
            <Wrench className="w-7 h-7 text-white" />
          </div>
          <div className="flex flex-col space-y-1">
            <h2 className="text-xl font-semibold text-slate-800">
              Cleaning Recommendations
            </h2>
            <p className="text-sm text-gray-600">
              {filename
                ? `Analyzing: ${filename}`
                : "Select a file to generate cleaning recommendations"}
            </p>
          </div>
        </div>

        {/* Refresh button — only shown when a file is selected */}
        {filename && (
          <button
            onClick={() => analyze(filename).catch(() => {})}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <Wrench className="w-12 h-12 mb-3 opacity-25" />
          <p className="text-sm font-medium">No dataset selected</p>
          <p className="text-xs mt-1">
            Upload or select a file above to get cleaning recommendations
          </p>
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {isError && filename && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>
            {error?.data?.detail ||
              error?.message ||
              "Failed to generate recommendations. Please try again."}
          </span>
        </div>
      )}

      {/* ── Skeleton cards (loading) ─────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* ── All-clear state (no issues detected) ────────────────────────── */}
      {!isLoading && data && recommendations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-7 h-7 text-green-500" />
          </div>
          <p className="text-sm font-semibold text-green-700">
            No issues detected!
          </p>
          <p className="text-xs mt-1 text-slate-500">
            This dataset looks clean and ready to use.
          </p>
        </div>
      )}

      {/* ── Recommendation cards grid ────────────────────────────────────── */}
      {!isLoading && recommendations.length > 0 && (
        <>
          {/* Info notice */}
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-white/60 border border-purple-100 text-xs text-slate-600">
            <Info className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
            <span>
              The following recommendations are auto-generated based on detected
              data quality issues. Review each suggestion carefully before
              applying changes to your dataset.
            </span>
          </div>

          <motion.div
            variants={staggerContainer(0.07)}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {recommendations.map((rec, idx) => (
              <RecommendationCard key={idx} recommendation={rec} />
            ))}
          </motion.div>

          {/* Summary strip */}
          <SummaryStrip summary={summary} />
        </>
      )}
    </motion.section>
  );
}
