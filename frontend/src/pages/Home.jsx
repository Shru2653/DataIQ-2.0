import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import {
  fadeIn, fadeInUp, staggerContainer, modalBackdrop, modalContent,
} from "../utils/animations";

import Navbar from "../components/layout/Navbar";
import FileUploader from "../components/files/FileUploader";
import FileList from "../components/files/FileList";
import CleanedFiles from "../components/files/CleanedFiles";
import ProcessingPanel from "../components/processing/ProcessingPanel";
import PreviewModal from "../components/processing/PreviewModal";
import Dashboard from "../components/dashboard/Dashboard";
import ChartPlot from "../components/dashboard/ChartPlot";
import useDatasets from "../hooks/useDatasets";
import InsightPanel from "../components/dashboard/InsightPanel";
import DataQualityPanel from "../components/dashboard/DataQualityPanel.jsx";
import CleaningRecommendationsPanel from "../components/dashboard/CleaningRecommendationsPanel.jsx";
import DriftDetectionPanel from "../components/dashboard/DriftDetectionPanel.jsx";
import { useAppStore } from "../stores/useAppStore";
import { useFiles } from "../hooks/useFiles";
import useNormalize from "../hooks/useNormalize";
import useOutliers from "../hooks/useOutliers";
import useFeatureEngineering from "../hooks/useFeatureEngineering";
import useMissingValues from "../hooks/useMissingValues";
import useDuplicates from "../hooks/useDuplicates";
import useDax from "../hooks/useDAX";
import {
  BarChart2, CheckSquare2, Filter, Layers, Search, Target, TrendingUp, Type, Zap,
  Download, FileDown, GitCompare, Sparkles, RefreshCw, CheckCircle, Info,
  Activity, ChevronDown, GripVertical, X, ArrowRight, AlertTriangle,
  TrendingDown, Minus, Brain, FlaskConical, BarChart,
} from "lucide-react";
import axiosClient from "../api/axiosClient";

// ─────────────────────────────────────────────────────────────────────────────
// Colour constants
// ─────────────────────────────────────────────────────────────────────────────
const KPI_COLOR = {
  blue:   { card: "bg-blue-50 border-blue-200",     value: "text-blue-700"   },
  green:  { card: "bg-green-50 border-green-200",   value: "text-green-700"  },
  amber:  { card: "bg-amber-50 border-amber-200",   value: "text-amber-700"  },
  red:    { card: "bg-red-50 border-red-200",       value: "text-red-700"    },
  purple: { card: "bg-purple-50 border-purple-200", value: "text-purple-700" },
};

const PERF_STYLE = {
  Excellent: { bg:"bg-green-50", border:"border-green-300", text:"text-green-700", badge:"bg-green-100", dot:"bg-green-500" },
  Good:      { bg:"bg-blue-50",  border:"border-blue-300",  text:"text-blue-700",  badge:"bg-blue-100",  dot:"bg-blue-500"  },
  Average:   { bg:"bg-amber-50", border:"border-amber-300", text:"text-amber-700", badge:"bg-amber-100", dot:"bg-amber-400" },
  Poor:      { bg:"bg-red-50",   border:"border-red-300",   text:"text-red-700",   badge:"bg-red-100",   dot:"bg-red-500"   },
};

const BAR_COLORS = ["#4f46e5","#7c3aed","#2563eb","#0284c7","#0891b2","#059669","#16a34a","#ca8a04"];

const IMPACT_STYLE = {
  high:   { bg: "bg-red-50",   border: "border-red-200",   text: "text-red-700",   dot: "bg-red-500"   },
  medium: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-400" },
  low:    { bg: "bg-gray-50",  border: "border-gray-200",  text: "text-gray-600",  dot: "bg-gray-400"  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Small display components
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

function ChartCard({ chart, dragHandleProps }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden h-full">
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0">
          <GripVertical size={16} />
        </div>
        <p className="text-sm font-semibold text-gray-800 flex-1 truncate">{chart.title}</p>
        {chart.anomaly_message && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
            {chart.anomaly_message}
          </span>
        )}
      </div>
      <ChartPlot type={chart.type === "grouped_bar" ? "bar" : chart.type}
        data={chart.traces} title={chart.title} height={300}
        layout={chart.layout ?? {}}
        config={{ displayModeBar: true, modeBarButtonsToAdd: ["downloadImage"], displaylogo: false }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compare Panel
// ─────────────────────────────────────────────────────────────────────────────
function ComparePanel({ serverFiles, currentFile }) {
  const [fileB, setFileB] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const compare = async () => {
    if (!currentFile || !fileB) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await axiosClient.post("/api/dashboard/compare", { filename_a: currentFile, filename_b: fileB });
      setResult(res.data);
    } catch (e) { setError(e?.response?.data?.detail ?? e?.message ?? "Compare failed."); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-blue-600 text-sm">{currentFile || "—"}</span>
        <span className="text-gray-400 text-sm">vs</span>
        <div className="relative">
          <select value={fileB} onChange={(e) => setFileB(e.target.value)}
            className="appearance-none text-sm border-2 border-gray-300 rounded-lg pl-3 pr-8 py-2 bg-white focus:outline-none focus:border-purple-400">
            <option value="">Select second file…</option>
            {serverFiles.filter((f) => f !== currentFile).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
        </div>
        <button onClick={compare} disabled={!fileB || !currentFile || loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 rounded-lg transition">
          {loading ? <RefreshCw size={13} className="animate-spin" /> : <GitCompare size={13} />}
          Compare
        </button>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[result.dataset_a, result.dataset_b].map((ds, i) => (
              <div key={i} className={`rounded-xl border p-4 ${i===0?"border-blue-200 bg-blue-50":"border-purple-200 bg-purple-50"}`}>
                <p className={`text-xs font-semibold mb-2 truncate ${i===0?"text-blue-700":"text-purple-700"}`}>{ds.filename}</p>
                {[["Rows",ds.row_count?.toLocaleString()],["Columns",ds.column_count],
                  ["Missing",`${ds.missing_percent}%`],["Duplicates",`${ds.duplicate_percent}%`],
                  ["Numeric cols",ds.numeric_cols],["Categorical",ds.categorical_cols]].map(([l,v]) => (
                  <div key={l} className="flex justify-between text-xs py-0.5">
                    <span className="text-gray-500">{l}</span>
                    <span className="font-medium text-gray-800">{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            {[
              {label:`Shared (${result.shared_columns.length})`,cols:result.shared_columns,c:"green"},
              {label:`Only in A (${result.only_in_a.length})`,cols:result.only_in_a,c:"blue"},
              {label:`Only in B (${result.only_in_b.length})`,cols:result.only_in_b,c:"purple"},
            ].map(({label,cols,c}) => (
              <div key={label} className={`rounded-lg bg-${c}-50 border border-${c}-200 p-3`}>
                <p className={`font-semibold text-${c}-700 mb-1`}>{label}</p>
                <p className="text-gray-600 truncate">{cols.slice(0,5).join(", ")||"—"}{cols.length>5?"…":""}</p>
              </div>
            ))}
          </div>
          {result.dataset_a.shared_column_comparison?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-600">Column</th>
                    <th className="text-center py-2 px-2 font-semibold text-blue-600">Mean A</th>
                    <th className="text-center py-2 px-2 font-semibold text-purple-600">Mean B</th>
                    <th className="text-center py-2 px-2 text-gray-500">Missing A</th>
                    <th className="text-center py-2 px-2 text-gray-500">Missing B</th>
                  </tr>
                </thead>
                <tbody>
                  {result.dataset_a.shared_column_comparison.map((row) => (
                    <tr key={row.column} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 px-2 font-medium text-gray-800">{row.column}</td>
                      <td className="text-center py-1.5 px-2 text-blue-700">{row.mean_a!=null?Number(row.mean_a).toFixed(2):row.top_a??"—"}</td>
                      <td className="text-center py-1.5 px-2 text-purple-700">{row.mean_b!=null?Number(row.mean_b).toFixed(2):row.top_b??"—"}</td>
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
// Prediction Form — dynamic inputs based on feature_input_specs
// ─────────────────────────────────────────────────────────────────────────────
function PredictionForm({ specs, values, onChange }) {
  if (!specs || specs.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {specs.map((spec) => (
        <div key={spec.name} className="space-y-1">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            {spec.name}
            {spec.input_type === "numeric" && spec.min_val != null && (
              <span className="ml-1 font-normal text-gray-400 normal-case">
                ({spec.min_val?.toFixed(1)} – {spec.max_val?.toFixed(1)})
              </span>
            )}
          </label>

          {spec.input_type === "categorical" ? (
            <select
              value={values[spec.name] ?? spec.default_value ?? ""}
              onChange={(e) => onChange(spec.name, e.target.value)}
              className="w-full text-sm border-2 border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:border-indigo-400 cursor-pointer"
            >
              {(spec.options ?? []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <div className="relative">
              <input
                type="number"
                value={values[spec.name] ?? spec.default_value ?? ""}
                onChange={(e) => onChange(spec.name, parseFloat(e.target.value) || 0)}
                min={spec.min_val ?? undefined}
                max={spec.max_val ?? undefined}
                step="any"
                placeholder={spec.mean_val != null ? `avg: ${spec.mean_val?.toFixed(1)}` : "Enter value"}
                className="w-full text-sm border-2 border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:border-indigo-400"
              />
              {spec.mean_val != null && (
                <button
                  type="button"
                  onClick={() => onChange(spec.name, parseFloat(spec.mean_val.toFixed(2)))}
                  title="Reset to average"
                  className="absolute right-2 top-2 text-[10px] text-indigo-400 hover:text-indigo-600 font-medium"
                >
                  avg
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Prediction Result card
// ─────────────────────────────────────────────────────────────────────────────
function PredictionResult({ result, targetColumn, taskType }) {
  const isClassifier = taskType === "classifier" || taskType === "classification";

  return (
    <div className="space-y-5">

      {/* Predicted value hero */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Prediction Result</p>
        <p className="text-4xl font-bold mb-1">{result.predicted_value}</p>
        <p className="text-sm opacity-80">Predicted value for <span className="font-semibold">{targetColumn}</span></p>
        {result.confidence != null && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 bg-white/20 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${result.confidence}%` }} />
            </div>
            <span className="text-sm font-bold">{result.confidence}% confidence</span>
          </div>
        )}
      </div>

      {/* Probabilities (classification only) */}
      {isClassifier && result.probabilities && Object.keys(result.probabilities).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Class Probabilities</p>
          <div className="space-y-2">
            {Object.entries(result.probabilities)
              .sort(([, a], [, b]) => b - a)
              .map(([cls, pct]) => (
                <div key={cls} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-700 w-28 truncate">{cls}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-10 text-right">{pct}%</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Plain-English explanation */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
        <div className="flex items-start gap-2 mb-3">
          <Brain size={16} className="text-indigo-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-indigo-800">Why this prediction?</p>
        </div>
        <p className="text-sm text-indigo-800 leading-relaxed mb-4">{result.simple_reason}</p>

        {/* Bullet summary */}
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm">
            <ArrowRight size={14} className="text-indigo-400 flex-shrink-0 mt-0.5" />
            <span className="text-indigo-700">
              <span className="font-semibold">Top factor influencing prediction:</span>{" "}
              {result.top_factor}
              {result.factors[0] && ` (${result.factors[0].importance_pct}% importance)`}
            </span>
          </div>
          {result.other_factors.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <ArrowRight size={14} className="text-indigo-400 flex-shrink-0 mt-0.5" />
              <span className="text-indigo-700">
                <span className="font-semibold">Other contributing factors:</span>{" "}
                {result.other_factors.join(", ")}
              </span>
            </div>
          )}
          {result.confidence != null && (
            <div className="flex items-start gap-2 text-sm">
              <ArrowRight size={14} className="text-indigo-400 flex-shrink-0 mt-0.5" />
              <span className="text-indigo-700">
                <span className="font-semibold">Confidence level:</span>{" "}
                {result.confidence >= 80 ? "High" : result.confidence >= 60 ? "Medium" : "Low"} ({result.confidence}%)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Per-feature impact cards */}
      {result.factors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Feature Impact on This Prediction
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.factors.map((factor) => {
              const st = IMPACT_STYLE[factor.impact] ?? IMPACT_STYLE.low;
              const DirIcon = factor.direction === "increases" ? TrendingUp
                : factor.direction === "decreases" ? TrendingDown : Minus;
              return (
                <div key={factor.feature}
                  className={`rounded-xl border ${st.border} ${st.bg} px-4 py-3 flex items-start justify-between gap-3`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                      <p className="text-xs font-bold text-gray-800 truncate">{factor.feature}</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      Value: <span className="font-semibold text-gray-700">{String(factor.value)}</span>
                    </p>
                    <p className={`text-xs font-medium mt-0.5 ${st.text}`}>
                      {factor.impact.charAt(0).toUpperCase() + factor.impact.slice(1)} impact
                      {factor.direction !== "neutral" && ` · ${factor.direction} prediction`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <DirIcon size={16} className={st.text} />
                    <span className={`text-sm font-bold mt-1 ${st.text}`}>{factor.importance_pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ML AutoPredictor Panel — full implementation
// ─────────────────────────────────────────────────────────────────────────────
function MLPanel({ filename }) {
  // ── Train state ──────────────────────────────────────────────────────────
  const [columns,      setColumns]      = useState([]);
  const [target,       setTarget]       = useState("");
  const [loadingCols,  setLoadingCols]  = useState(false);
  const [loadingTrain, setLoadingTrain] = useState(false);
  const [trainResult,  setTrainResult]  = useState(null);
  const [trainError,   setTrainError]   = useState(null);

  // ── Predict state ─────────────────────────────────────────────────────────
  const [formValues,    setFormValues]    = useState({});
  const [loadingPred,   setLoadingPred]   = useState(false);
  const [predResult,    setPredResult]    = useState(null);
  const [predError,     setPredError]     = useState(null);
  const [activeTab,     setActiveTab]     = useState("train"); // "train" | "predict"

  // Load column suggestions
  useEffect(() => {
    if (!filename) return;
    setColumns([]); setTarget(""); setTrainResult(null); setTrainError(null);
    setPredResult(null); setPredError(null); setFormValues({});
    setLoadingCols(true);
    axiosClient.post("/api/dashboard/ml-columns", { filename })
      .then((res) => {
        setColumns(res.data.columns ?? []);
        if (res.data.recommended?.length > 0) setTarget(res.data.recommended[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingCols(false));
  }, [filename]);

  // Auto-fill form defaults when specs arrive
  useEffect(() => {
    if (!trainResult?.feature_input_specs?.length) return;
    const defaults = {};
    trainResult.feature_input_specs.forEach((spec) => {
      defaults[spec.name] = spec.default_value ?? (spec.input_type === "categorical" ? spec.options?.[0] ?? "" : 0);
    });
    setFormValues(defaults);
  }, [trainResult?.feature_input_specs]);

  const handleFormChange = (name, value) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setPredResult(null);
  };

  // Train
  const train = async () => {
    if (!filename || !target) return;
    setLoadingTrain(true); setTrainError(null); setTrainResult(null); setPredResult(null);
    try {
      const res = await axiosClient.post("/api/dashboard/ml-predict", { filename, target_column: target });
      setTrainResult(res.data);
      setActiveTab("train");
    } catch (e) {
      setTrainError(e?.response?.data?.detail ?? e?.message ?? "Training failed.");
    } finally { setLoadingTrain(false); }
  };

  // Predict single row
  const predict = async () => {
    if (!trainResult?.model_ready) return;
    setLoadingPred(true); setPredError(null); setPredResult(null);
    try {
      const res = await axiosClient.post("/api/dashboard/ml-predict-single", { feature_values: formValues });
      setPredResult(res.data);
    } catch (e) {
      setPredError(e?.response?.data?.detail ?? e?.message ?? "Prediction failed.");
    } finally { setLoadingPred(false); }
  };

  const goodCols  = columns.filter((c) => c.recommendation === "good");
  const okCols    = columns.filter((c) => c.recommendation === "ok");
  const avoidCols = columns.filter((c) => c.recommendation === "avoid");
  const selectedColInfo = columns.find((c) => c.name === target);
  const perf = trainResult ? (PERF_STYLE[trainResult.performance_label] ?? PERF_STYLE.Average) : null;
  const specs = trainResult?.feature_input_specs ?? [];

  return (
    <div className="space-y-6">

      {/* ── Tip banner ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
        <Sparkles size={16} className="text-indigo-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-700">
          <p className="font-semibold mb-0.5">ML AutoPredictor — works with ANY dataset</p>
          <p>Step 1: Select a target column and train the model. Step 2: Enter values for key features and get an instant prediction with a plain-English explanation.</p>
        </div>
      </div>

      {/* ── Column pills ────────────────────────────────────────────────── */}
      {columns.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-lg font-medium">⭐ {goodCols.length} recommended</span>
          <span className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium">✓ {okCols.length} acceptable</span>
          <span className="bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-lg font-medium">⚠ {avoidCols.length} avoid</span>
        </div>
      )}

      {/* ── Target selector + Train ──────────────────────────────────────── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">Step 1 — Select target column &amp; train model</p>

        {loadingCols ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <RefreshCw size={13} className="animate-spin" /> Loading columns…
          </div>
        ) : columns.length === 0 ? (
          <input type="text" value={target} onChange={(e) => setTarget(e.target.value)}
            placeholder="Type column name e.g. salary"
            className="w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-400" />
        ) : (
          <>
            <select value={target} onChange={(e) => { setTarget(e.target.value); setTrainResult(null); setPredResult(null); }}
              className="w-full text-sm border-2 border-gray-300 rounded-lg px-3 py-2.5 bg-white text-gray-800 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer">
              <option value="">— choose a column to predict —</option>
              {goodCols.length > 0 && (
                <optgroup label="⭐ Recommended — great targets">
                  {goodCols.map((c) => (
                    <option key={c.name} value={c.name}>{c.name} · {c.task_type} · {c.unique_count} unique</option>
                  ))}
                </optgroup>
              )}
              {okCols.length > 0 && (
                <optgroup label="✓ Acceptable">
                  {okCols.map((c) => (
                    <option key={c.name} value={c.name}>{c.name} · {c.task_type} · {c.unique_count} unique</option>
                  ))}
                </optgroup>
              )}
              {avoidCols.length > 0 && (
                <optgroup label="⚠ Not recommended">
                  {avoidCols.map((c) => (
                    <option key={c.name} value={c.name}>{c.name} — not a good target</option>
                  ))}
                </optgroup>
              )}
            </select>

            {selectedColInfo && (
              <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                selectedColInfo.recommendation === "good" ? "bg-green-50 border-green-200 text-green-700" :
                selectedColInfo.recommendation === "ok"   ? "bg-blue-50 border-blue-200 text-blue-700" :
                                                            "bg-red-50 border-red-200 text-red-700"
              }`}>
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                  <strong>
                    {selectedColInfo.recommendation === "good" ? "⭐ Recommended" :
                     selectedColInfo.recommendation === "ok"   ? "✓ Acceptable"  : "⚠ Not recommended"}
                  </strong>
                  {" — "}{selectedColInfo.reason}
                  {" · Task: "}<strong className="capitalize">{selectedColInfo.task_type}</strong>
                </span>
              </div>
            )}
          </>
        )}

        <button onClick={train}
          disabled={!target || loadingTrain || selectedColInfo?.recommendation === "avoid"}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition">
          {loadingTrain
            ? <><RefreshCw size={14} className="animate-spin" /> Training model…</>
            : <><FlaskConical size={14} /> Train Model</>
          }
        </button>

        {trainError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{trainError}</span>
          </div>
        )}
      </div>

      {/* ── Results section — shown after training ─────────────────────── */}
      {trainResult && (
        <div className="space-y-5">

          {/* Inner tabs: Analysis | Predict */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
            {[
              { key: "train",   label: "Model Analysis", icon: BarChart   },
              { key: "predict", label: "Make Prediction", icon: Brain     },
            ].map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition ${
                  activeTab === key ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {/* ── Model Analysis tab ─────────────────────────────────────── */}
          {activeTab === "train" && (
            <div className="space-y-5">

              {/* Performance banner */}
              <div className={`rounded-xl border-2 ${perf.border} ${perf.bg} p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${perf.dot}`} />
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Model Performance</p>
                      <p className={`text-2xl font-bold ${perf.text}`}>{trainResult.performance_label}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${perf.badge} ${perf.text}`}>
                    {trainResult.task_label}
                  </span>
                </div>
              </div>

              {/* Metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {trainResult.accuracy != null && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Accuracy</p>
                    <p className={`text-3xl font-bold ${perf.text}`}>{trainResult.accuracy}%</p>
                    <p className="text-xs text-gray-400 mt-1">correct predictions</p>
                  </div>
                )}
                {trainResult.r2_score != null && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">R² Score</p>
                    <p className={`text-3xl font-bold ${perf.text}`}>{trainResult.r2_score}</p>
                    <p className="text-xs text-gray-400 mt-1">variance explained</p>
                  </div>
                )}
                {trainResult.rmse != null && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">RMSE</p>
                    <p className="text-3xl font-bold text-gray-700">{trainResult.rmse}</p>
                    <p className="text-xs text-gray-400 mt-1">avg error</p>
                  </div>
                )}
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Features</p>
                  <p className="text-3xl font-bold text-gray-700">{trainResult.features_used}</p>
                  <p className="text-xs text-gray-400 mt-1">used in model</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Trained on</p>
                  <p className="text-3xl font-bold text-gray-700">{trainResult.training_rows?.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-1">rows</p>
                </div>
              </div>

              {/* Insight */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4">
                <div className="flex items-start gap-2">
                  <Sparkles size={15} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-indigo-800 leading-relaxed">{trainResult.insight}</p>
                </div>
              </div>

              {/* Feature importances */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-800">Feature Importances</p>
                  <p className="text-xs text-gray-400">Which columns matter most</p>
                </div>
                <div className="space-y-3">
                  {trainResult.feature_importances.map((fi, i) => (
                    <div key={fi.feature} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] + "22" }}>
                        <span className="text-[9px] font-bold" style={{ color: BAR_COLORS[i % BAR_COLORS.length] }}>{i+1}</span>
                      </div>
                      <span className="text-xs text-gray-700 w-36 truncate font-medium">{fi.feature}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${fi.importance_pct}%`,
                          backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                          opacity: Math.max(0.4, 1 - i * 0.06),
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-12 text-right">{fi.importance_pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA to predict */}
              <button onClick={() => setActiveTab("predict")}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition">
                <Brain size={16} /> Make a Prediction with this Model
                <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* ── Make Prediction tab ────────────────────────────────────── */}
          {activeTab === "predict" && (
            <div className="space-y-5">

              {specs.length > 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-semibold text-gray-700">
                      Step 2 — Enter values for top {specs.length} features
                    </p>
                    <span className="text-xs text-gray-400">Defaults = dataset averages</span>
                  </div>

                  <PredictionForm specs={specs} values={formValues} onChange={handleFormChange} />

                  <button onClick={predict} disabled={loadingPred}
                    className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 rounded-xl transition shadow-sm">
                    {loadingPred
                      ? <><RefreshCw size={15} className="animate-spin" /> Predicting…</>
                      : <><Brain size={15} /> Get Prediction + Explanation</>
                    }
                  </button>

                  {predError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>{predError}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                  No prediction form available for this model. Try retraining with a different target column.
                </div>
              )}

              {/* Prediction result */}
              {predResult && (
                <PredictionResult
                  result={predResult}
                  targetColumn={trainResult.target_column}
                  taskType={trainResult.model_type}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF / CSV helpers
// ─────────────────────────────────────────────────────────────────────────────
async function exportPDF(ref, filename, setPdfLoading) {
  if (!ref.current) return;
  setPdfLoading(true);
  try {
    const canvas = await html2canvas(ref.current, { scale: 1.5, backgroundColor: "#fff", useCORS: true });
    const pdf    = new jsPDF("p", "pt", "a4");
    const pageW  = pdf.internal.pageSize.getWidth();
    const pageH  = pdf.internal.pageSize.getHeight();
    const imgW   = pageW;
    const imgH   = canvas.height * (imgW / canvas.width);
    if (imgH <= pageH) {
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgW, imgH);
    } else {
      const pxPP = Math.floor((pageH / pageW) * canvas.width);
      const pages = Math.ceil(canvas.height / pxPP);
      const pc = document.createElement("canvas");
      pc.width = canvas.width;
      const ctx = pc.getContext("2d");
      for (let p = 0; p < pages; p++) {
        const sY = p * pxPP;
        const sH = Math.min(pxPP, canvas.height - sY);
        pc.height = sH;
        ctx.clearRect(0, 0, pc.width, sH);
        ctx.drawImage(canvas, 0, sY, canvas.width, sH, 0, 0, canvas.width, sH);
        if (p > 0) pdf.addPage();
        pdf.addImage(pc.toDataURL("image/png"), "PNG", 0, 0, imgW, (sH / canvas.width) * imgW);
      }
    }
    pdf.save(`${filename}_dashboard.pdf`);
  } catch (e) { console.error("PDF failed:", e); }
  finally { setPdfLoading(false); }
}

function exportCSV(statistics, schema, filename) {
  const rows = [["=== KPIs ==="], ["Label","Value","Sub"]];
  (statistics.kpis ?? []).forEach((k) => rows.push([k.label, k.value, k.sub ?? ""]));
  rows.push([], ["=== Numeric Summary ==="]);
  const numCols = Object.keys(statistics.numeric_summary ?? {});
  if (numCols.length) {
    rows.push(["Metric",...numCols]);
    ["count","mean","std","min","25%","50%","75%","max"].forEach((m) =>
      rows.push([m, ...numCols.map((c) => statistics.numeric_summary[c]?.[m] ?? "")]));
  }
  const csv  = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `${filename}_dashboard.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Home
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const sidebarOpen       = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen    = useAppStore((s) => s.setSidebarOpen);
  const serverFiles       = useAppStore((s) => s.serverFiles);
  const setServerFiles    = useAppStore((s) => s.setServerFiles);
  const selectedFile      = useAppStore((s) => s.selectedFile);
  const setSelectedFile   = useAppStore((s) => s.setSelectedFile);
  const clearSelectedFile = useAppStore((s) => s.clearSelectedFile);
  const updateProcessingStep = useAppStore((s) => s.updateProcessingStep);
  const resetProcessing   = useAppStore((s) => s.resetProcessing);

  const { filesQuery, upload } = useFiles();
  const datasetsQuery = useDatasets();
  const [uploadProgress,   setUploadProgress]   = useState(0);
  const [fileTab,          setFileTab]           = useState("uploaded");
  const [selectedOriginal, setSelectedOriginal]  = useState("");

  const normalize  = useNormalize();
  const outliers   = useOutliers();
  const features   = useFeatureEngineering();
  const missing    = useMissingValues();
  const duplicates = useDuplicates();
  const dax        = useDax();

  const [showPreview,     setShowPreview]     = useState(false);
  const [previewData,     setPreviewData]     = useState(null);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [latestDashboard, setLatestDashboard] = useState(null);
  const [pdfLoading,      setPdfLoading]      = useState(false);
  const dashboardRef = useRef(null);

  const [dashTab,    setDashTab]    = useState("charts");
  const [chartOrder, setChartOrder] = useState([]);

  useEffect(() => { clearSelectedFile(); resetProcessing(); }, []);

  useEffect(() => {
    const ds = datasetsQuery?.data?.datasets;
    if (!Array.isArray(ds)) return;
    setServerFiles(ds.map((d) => ({ filename: d.filename, name: d.filename, size: d.size, uploaded_at: d.uploaded_at })));
  }, [datasetsQuery.data, setServerFiles]);

  useEffect(() => {
    const ds = datasetsQuery?.data?.datasets;
    const fs = filesQuery?.data?.files;
    if ((Array.isArray(ds) && ds.length > 0) || !Array.isArray(fs)) return;
    setServerFiles(fs.map((f) => ({ filename: f.filename, name: f.filename, size: f.size, uploaded_at: f.mtime })));
  }, [datasetsQuery.data, filesQuery.data, setServerFiles]);

  const serverFilesList = useMemo(() => {
    if (Array.isArray(serverFiles)) return serverFiles;
    if (Array.isArray(serverFiles?.files)) return serverFiles.files;
    return [];
  }, [serverFiles]);

  const selectedId = selectedFile?.id ?? selectedFile?._id ?? selectedFile?.name ?? selectedFile?.filename;
  useEffect(() => { if (!selectedId) resetProcessing(); }, [selectedId]);

  const allDatasets = useMemo(
    () => Array.isArray(datasetsQuery?.data?.datasets) ? datasetsQuery.data.datasets : [],
    [datasetsQuery.data]
  );
  const allCleaned = useMemo(
    () => allDatasets.flatMap((d) => (d.cleaned_versions||[]).map((cv) => ({ ...cv, original: d.filename }))),
    [allDatasets]
  );
  const originalsDropdown = useMemo(() => {
    const names = allDatasets.map((d) => d.filename).filter(Boolean);
    const set   = new Set(names);
    if (selectedOriginal) set.add(selectedOriginal);
    return Array.from(set).sort();
  }, [allDatasets, selectedOriginal]);

  useEffect(() => {
    if (fileTab==="cleaned" && !selectedOriginal && selectedId) {
      const selName = serverFilesList.find((f) => (f.filename||f.name)===selectedId)?.filename || selectedId;
      if (selName && originalsDropdown.includes(selName)) setSelectedOriginal(selName);
    }
  }, [fileTab, selectedOriginal, selectedId, serverFilesList, originalsDropdown]);

  const cleanedFilesList = useMemo(
    () => selectedOriginal ? allCleaned.filter((f) => f.original===selectedOriginal) : allCleaned,
    [allCleaned, selectedOriginal]
  );

  const cleanedFilesQuery = useQuery({
    queryKey: ["cleaned-files", selectedOriginal||"all"],
    queryFn: async () => {
      const qs = selectedOriginal ? `?original=${encodeURIComponent(selectedOriginal)}` : "";
      const res = await axiosClient.get(`/cleaned-files${qs}`);
      return res.data;
    },
    enabled: fileTab==="cleaned",
    staleTime: 5_000,
  });

  const apiCleaned = useMemo(
    () => Array.isArray(cleanedFilesQuery?.data?.files) ? cleanedFilesQuery.data.files : [],
    [cleanedFilesQuery.data]
  );
  const displayCleaned = useMemo(() => {
    const primary = cleanedFilesList.length ? cleanedFilesList : allCleaned;
    return primary.length > 0 ? primary : apiCleaned;
  }, [cleanedFilesList, allCleaned, apiCleaned]);

  const cleanedCounts = useMemo(() => {
    const map = new Map();
    allDatasets.forEach((d) => map.set(d.filename, (d.cleaned_versions||[]).length));
    return map;
  }, [allDatasets]);

  const handleUpload = (fileOrFiles) => {
    const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles;
    if (!file) return;
    setUploadProgress(0);
    upload.mutate(
      { file, onProgress: (pct) => setUploadProgress(pct) },
      { onSuccess: () => setUploadProgress(0), onError: () => setUploadProgress(0) }
    );
  };

  const openPreview  = (payload) => { setPreviewData(payload); setShowPreview(true); };
  const closePreview = () => setShowPreview(false);

  const downloadFromTemp = async (filename) => {
    if (!filename) return;
    try {
      const response = await axiosClient.get(`/api/files/cleaned/${encodeURIComponent(filename)}`, { responseType: "blob" });
      const blobUrl  = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch (err) { console.error("Download failed", err); }
  };

  const generateAutoDashboard = async () => {
    try {
      const fileToUse = selectedFile || (serverFilesList.length > 0 ? serverFilesList[0] : null);
      if (!fileToUse) { alert("Please upload or select a file first."); return; }
      const fname = fileToUse.filename || fileToUse.name || fileToUse.id || fileToUse;
      setPreviewLoading(true);
      const dashRes = await axiosClient.post("/api/dashboard/auto", { filename: fname });
      const stats   = dashRes.data.statistics;
      const charts  = stats?.charts ?? [];
      setLatestDashboard({ filename: fname, statistics: stats, schema: dashRes.data.schema, kpis: stats?.kpis??[], charts });
      setChartOrder(charts.map((c) => c.id));
      setDashTab("charts");
    } catch (e) {
      alert("Failed to generate dashboard: " + (e.response?.data?.detail || e.message));
    } finally { setPreviewLoading(false); }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const newOrder = Array.from(chartOrder);
    const [moved]  = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, moved);
    setChartOrder(newOrder);
  };

  const orderedCharts = useMemo(() => {
    const charts = latestDashboard?.charts ?? [];
    if (!chartOrder.length) return charts;
    const map     = Object.fromEntries(charts.map((c) => [c.id, c]));
    const ordered = chartOrder.map((id) => map[id]).filter(Boolean);
    charts.forEach((c) => { if (!ordered.find((o) => o.id === c.id)) ordered.push(c); });
    return ordered;
  }, [latestDashboard, chartOrder]);

  const steps = useMemo(() => [
    { key:"inspect", title:"Load and Inspect Data", description:"Upload and examine your dataset structure, columns, and initial insights", icon:Search, color:"blue", delay:0.1, category:"cleaning",
      options:{ actions:["Preview Data","Column Info","Data Summary","Memory Usage"], filters:["Show All Columns","Numeric Only","Text Only","Date Columns"], settings:{preview_rows:100,include_dtypes:true} },
      onRun: async () => { if (!selectedId) return; updateProcessingStep("inspect",{status:"running"}); try { const res = await axiosClient.post("/api/datatypes/preview",{filename:selectedId}); updateProcessingStep("inspect",{status:"done",output:res.data}); openPreview({before:res.data?.preview_data,after:res.data?.preview_data}); } catch(e){ updateProcessingStep("inspect",{status:"error",error:e?.message}); } },
      onPreview: async () => { if (!selectedId) return; const res = await axiosClient.post("/api/datatypes/preview",{filename:selectedId}); openPreview({before:res.data?.preview_data,after:res.data?.preview_data}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.inspect?.output?.new_file) },
    { key:"missing", title:"Handle Missing Values", description:"Detect, analyze, and resolve missing data points with intelligent strategies.", icon:Target, color:"indigo", delay:0.2, category:"cleaning",
      options:{ actions:["Drop Rows","Fill Forward","Fill Backward","Mean/Median Fill","Custom Value"], filters:["All Columns","Numeric Only","Text Only","High Missing %","Low Missing %"], settings:{threshold:0.5,method:"mean",custom_value:""} },
      onRun: async ({action,filters,settings}) => { if (!selectedId) return; updateProcessingStep("missing",{status:"running"}); try { const actionMap={"Drop Rows":"drop","Fill Forward":"forward","Fill Backward":"backward","Mean/Median Fill":"mean","Custom Value":"custom"}; const filterMap=(arr)=>arr?.includes("Numeric Only")?"numeric":arr?.includes("Text Only")?"text":"all"; const res = await missing.execute({filename:selectedId,action:actionMap[action]||"mean",filter:filterMap(filters),threshold:settings?.threshold??0.5,custom_value:settings?.custom_value??null}); updateProcessingStep("missing",{status:"done",output:res}); const prev = await axiosClient.post("/api/datatypes/preview",{filename:res?.new_file||res?.data?.new_file||selectedId}); openPreview({before:[],after:Array.isArray(prev.data?.preview_data)?prev.data.preview_data:[]}); datasetsQuery.refetch?.(); } catch(e){ updateProcessingStep("missing",{status:"error",error:e?.message}); } },
      onPreview: async () => { if (!selectedId) return; const res = await axiosClient.post("/api/datatypes/preview",{filename:selectedId}); openPreview({before:[],after:Array.isArray(res.data?.preview_data)?res.data.preview_data:[]}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.missing?.output?.new_file) },
    { key:"duplicates", title:"Remove Duplicates", description:"Identify and eliminate duplicate records to ensure data quality.", icon:Filter, color:"purple", delay:0.3, category:"cleaning",
      options:{ actions:["Find Duplicates","Remove All","Keep First","Keep Last","Mark Duplicates"], filters:["Exclude ID (Default)","Key Columns Only","All Columns"], settings:{subset:[],keep:"first",mark_only:false} },
      onRun: async ({action,settings}) => { if (!selectedId) return; updateProcessingStep("duplicates",{status:"running"}); try { const actionMap={"Find Duplicates":"find_duplicates","Remove All":"remove_all","Keep First":"keep_first","Keep Last":"keep_last","Mark Duplicates":"mark_duplicates"}; const res = await duplicates.execute({filename:selectedId,action:actionMap[action]||"remove_all",subset:Array.isArray(settings?.subset)?settings.subset:[]}); updateProcessingStep("duplicates",{status:"done",output:res}); const prev = await axiosClient.post("/api/datatypes/preview",{filename:res?.new_file||res?.data?.new_file||selectedId}); openPreview({before:[],after:Array.isArray(prev.data?.preview_data)?prev.data.preview_data:[]}); datasetsQuery.refetch?.(); } catch(e){ updateProcessingStep("duplicates",{status:"error",error:e?.message}); } },
      onPreview: async ({settings}) => { if (!selectedId) return; const res = await axiosClient.post("/api/duplicates/preview",{filename:selectedId,subset:Array.isArray(settings?.subset)?settings.subset:null,preview_limit:100}); const raw=Array.isArray(res.data?.preview)?res.data.preview:[]; openPreview({before:[],after:raw.map((r)=>({row_index:r?.row_index,...(r?.data||{})}))}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.duplicates?.output?.new_file) },
    { key:"types", title:"Correct Data Types", description:"Optimize column data types for better performance and accuracy", icon:Type, color:"blue", delay:0.4, category:"cleaning",
      options:{ actions:["Auto Detect","Convert to Numeric","Convert to Date","Convert to Category","Custom Type"], filters:["All Columns","Object Type","Numeric Type","DateTime Type","Mixed Types"], settings:{auto_convert:true,date_format:"infer",errors:"coerce"} },
      onRun: async ({action,settings}) => { if (!selectedId) return; updateProcessingStep("types",{status:"running"}); try { const actionMap={"Auto Detect":"auto_detect","Convert to Numeric":"convert_to_numeric","Convert to Date":"convert_to_datetime","Convert to Category":"convert_to_category","Custom Type":"custom_mapping"}; const res = await axiosClient.post("/api/datatypes/convert",{filename:selectedId,action:actionMap[action]||"auto_detect",settings}); updateProcessingStep("types",{status:"done",output:res.data}); openPreview({before:[],after:res.data?.preview_data}); } catch(e){ updateProcessingStep("types",{status:"error",error:e?.message}); } },
      onPreview: async () => { if (!selectedId) return; const res = await axiosClient.post("/api/datatypes/preview",{filename:selectedId}); openPreview({before:[],after:res.data?.preview_data}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.types?.output?.new_file) },
    { key:"normalize", title:"Normalize / Scale Data", description:"Apply scaling techniques to prepare data for machine learning.", icon:BarChart2, color:"indigo", delay:0.5, category:"preparation",
      options:{ actions:["Standard Scale","Min-Max Scale","Robust Scale","Unit Vector","Quantile Transform"], filters:["Numeric Columns","High Range","Skewed Distribution","Selected Features"], settings:{method:"standard",feature_range:[0,1],with_mean:true} },
      onRun: async ({action,filters,settings}) => { if (!selectedId) return; updateProcessingStep("normalize",{status:"running"}); try { const methodMap={"Standard Scale":"standard","Min-Max Scale":"minmax","Robust Scale":"robust","Unit Vector":"unit_vector","Quantile Transform":"quantile"}; const res = await normalize.execute({filename:selectedId,settings:{method:methodMap[action]||settings?.method||"standard",feature_range:settings?.feature_range??[0,1],with_mean:settings?.with_mean??true,preview_limit:100},filters:filters?.length?filters:["Numeric Columns"]}); updateProcessingStep("normalize",{status:"done",output:res}); openPreview({before:[],after:res?.preview_data}); } catch(e){ updateProcessingStep("normalize",{status:"error",error:e?.message}); } },
      onPreview: async ({action,filters,settings}) => { if (!selectedId) return; const methodMap={"Standard Scale":"standard","Min-Max Scale":"minmax","Robust Scale":"robust","Unit Vector":"unit_vector","Quantile Transform":"quantile"}; const res = await axiosClient.post("/api/normalize/preview",{filename:selectedId,settings:{method:methodMap[action]||settings?.method||"standard",feature_range:settings?.feature_range??[0,1],with_mean:settings?.with_mean??true,preview_limit:100},filters:filters?.length?filters:["Numeric Columns"]}); openPreview({before:[],after:res.data?.preview_data}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.normalize?.output?.new_file) },
    { key:"outliers", title:"Handle Outliers", description:"Detect and manage statistical outliers that could affect your analysis.", icon:TrendingUp, color:"purple", delay:0.6, category:"preparation",
      options:{ actions:["IQR Method","Z-Score","Modified Z-Score","Isolation Forest","Remove Outliers"], filters:["Numeric Columns","High Variance","Distribution Based","Custom Threshold"], settings:{method:"iqr",threshold:3,action:"flag"} },
      onRun: async ({action,filters,settings}) => { if (!selectedId) return; updateProcessingStep("outliers",{status:"running"}); try { const methodMap={"IQR Method":"iqr","Z-Score":"zscore","Modified Z-Score":"modified_zscore","Isolation Forest":"isolation_forest"}; const act=action==="Remove Outliers"?"remove":settings?.action||"flag"; const res = await outliers.execute({filename:selectedId,method:methodMap[action]||settings?.method||"iqr",settings:{threshold:settings?.threshold??3,action:act,preview_limit:100},filters:filters?.length?filters:["Numeric Columns"]}); updateProcessingStep("outliers",{status:"done",output:res}); openPreview({before:[],after:res?.preview_data}); datasetsQuery.refetch?.(); } catch(e){ updateProcessingStep("outliers",{status:"error",error:e?.message}); } },
      onPreview: async ({action,filters,settings}) => { if (!selectedId) return; const methodMap={"IQR Method":"iqr","Z-Score":"zscore","Modified Z-Score":"modified_zscore","Isolation Forest":"isolation_forest"}; const act=action==="Remove Outliers"?"remove":settings?.action||"flag"; const res = await axiosClient.post("/api/outliers/preview",{filename:selectedId,method:methodMap[action]||settings?.method||"iqr",settings:{threshold:settings?.threshold??3,action:act,preview_limit:100},filters:filters?.length?filters:["Numeric Columns"]}); openPreview({before:[],after:res.data?.preview_data}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.outliers?.output?.new_file) },
    { key:"features", title:"Feature Engineering", description:"Create new features and transform existing ones for better insights.", icon:Layers, color:"blue", delay:1, category:"preparation",
      options:{ actions:["Polynomial Features","Interaction Terms","Binning","Date Features","Text Features"], filters:["Numeric Features","Date Columns","Text Columns","Selected Columns"], settings:{degree:2,include_bias:false,interaction_only:false} },
      onRun: async ({action,filters,settings}) => { if (!selectedId) return; updateProcessingStep("features",{status:"running"}); try { const actionMap={"Polynomial Features":"polynomial","Interaction Terms":"interaction","Binning":"binning","Date Features":"date","Text Features":"text"}; const feSettings={action:actionMap[action]||settings?.action||"polynomial",degree:settings?.degree??2,include_bias:!!settings?.include_bias,interaction_only:!!settings?.interaction_only,binning_strategy:settings?.binning_strategy||"equal_width",bins:settings?.bins??5,date_parts:settings?.date_parts||["year","month","day","weekday"],text_options:settings?.text_options||{use_tfidf:false,max_features:100},selected_columns:settings?.selected_columns||null,preview_limit:100}; const res = await features.execute({filename:selectedId,filters:filters?.length?filters:["Numeric Features"],settings:feSettings}); updateProcessingStep("features",{status:"done",output:res}); openPreview({before:[],after:res?.preview_data}); } catch(e){ updateProcessingStep("features",{status:"error",error:e?.message}); } },
      onPreview: async ({action,filters,settings}) => { if (!selectedId) return; const actionMap={"Polynomial Features":"polynomial","Interaction Terms":"interaction","Binning":"binning","Date Features":"date","Text Features":"text"}; const feSettings={action:actionMap[action]||settings?.action||"polynomial",degree:settings?.degree??2,include_bias:!!settings?.include_bias,interaction_only:!!settings?.interaction_only,binning_strategy:settings?.binning_strategy||"equal_width",bins:settings?.bins??5,date_parts:settings?.date_parts||["year","month","day","weekday"],text_options:settings?.text_options||{use_tfidf:false,max_features:100},selected_columns:settings?.selected_columns||null,preview_limit:100}; const res = await axiosClient.post("/api/features/preview",{filename:selectedId,filters:filters?.length?filters:["Numeric Features"],settings:feSettings}); openPreview({before:[],after:res.data?.preview_data}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.features?.output?.new_file) },
    { key:"dax", title:"DAX Computations", description:"Apply DAX-like computations.", icon:Zap, color:"indigo", delay:0.6, category:"analysis",
      options:{ actions:["Generate DAX Queries"], filters:["All Columns"], settings:{min_queries:10,max_queries:30,preview_limit:10} },
      onRun: async ({settings}) => { if (!selectedId) return; updateProcessingStep("dax",{status:"running"}); try { const res = await dax.execute({filename:selectedId,settings:{min_queries:settings?.min_queries??10,max_queries:settings?.max_queries??30,preview_limit:100}}); updateProcessingStep("dax",{status:"done",output:res}); openPreview({before:[],after:res?.queries}); } catch(e){ updateProcessingStep("dax",{status:"error",error:e?.message}); } },
      onPreview: async ({settings}) => { if (!selectedId) return; const res = await axiosClient.post("/api/dax/generate",{filename:selectedId,settings:{min_queries:settings?.min_queries??10,max_queries:settings?.max_queries??30,preview_limit:100}}); openPreview({before:[],after:res.data?.queries}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.dax?.output?.new_file) },
    { key:"dax_measures", title:"DAX Measures Generator", description:"Auto-generate 20-100 meaningful DAX measures with PDF export", icon:CheckSquare2, color:"purple", delay:1.1, category:"analysis",
      options:{ actions:["Generate Measures"], filters:["All Columns"], settings:{min_measures:20,max_measures:60,preview_limit:20} },
      onRun: async ({settings}) => { if (!selectedId) return; updateProcessingStep("dax_measures",{status:"running"}); try { const res = await axiosClient.post("/api/dax/measures",{filename:selectedId,settings:{min_measures:settings?.min_measures??20,max_measures:settings?.max_measures??60,preview_limit:100}}); updateProcessingStep("dax_measures",{status:"done",output:res.data}); openPreview({before:[],after:res.data?.measures}); } catch(e){ updateProcessingStep("dax_measures",{status:"error",error:e?.message}); } },
      onPreview: async ({settings}) => { if (!selectedId) return; const res = await axiosClient.post("/api/dax/measures",{filename:selectedId,settings:{min_measures:settings?.min_measures??10,max_measures:settings?.max_measures??20,preview_limit:100}}); openPreview({before:[],after:res.data?.measures}); },
      onDownload: async () => downloadFromTemp(useAppStore.getState().processingSteps?.dax_measures?.output?.new_file) },
  ], [selectedId, missing.execute, duplicates.execute, normalize.execute, outliers.execute, features.execute, dax.execute, updateProcessingStep]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <main className="pt-24 pb-12">
        <div className="w-full px-12 py-10">
          <div className="w-full space-y-16">

            <motion.section initial={fadeInUp.initial} animate={fadeInUp.animate} transition={fadeInUp.transition}
              className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10">
              <div className="flex flex-col space-y-1 mb-4">
                <h2 className="text-xl font-semibold text-slate-800">Upload Section</h2>
                <p className="text-sm text-gray-600">Upload datasets to begin analysis and processing.</p>
              </div>
              <div className="space-y-6">
                <FileUploader onSelect={handleUpload} uploading={upload.isPending} progress={uploadProgress} accept=".csv,.xlsx,.xls,.json,.parquet" />
                {filesQuery.isLoading && <div className="text-sm text-slate-500">Loading files…</div>}
              </div>
            </motion.section>

            <section className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10">
              <div className="flex flex-col space-y-1 mb-4">
                <h2 className="text-xl font-semibold text-slate-800">Server Files</h2>
                <p className="text-sm text-gray-600">Select uploaded or cleaned files from the server.</p>
              </div>
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <button onClick={() => setFileTab("uploaded")} className={`px-3 py-1.5 rounded-md text-sm ${fileTab==="uploaded"?"bg-blue-600 text-white":"bg-white text-slate-700 border"}`}>Uploaded Files</button>
                  <button onClick={() => setFileTab("cleaned")} className={`px-3 py-1.5 rounded-md text-sm ${fileTab==="cleaned"?"bg-blue-600 text-white":"bg-white text-slate-700 border"}`}>Cleaned Files</button>
                </div>
                {fileTab==="uploaded" && (
                  <FileList files={serverFilesList} selectedId={selectedId} onSelect={(f) => setSelectedFile(f)}
                    onDelete={undefined} cleanedCounts={cleanedCounts}
                    onViewCleaned={(file) => { setSelectedFile(file); const name=file?.filename||file?.name; if(name) setSelectedOriginal(name); setFileTab("cleaned"); }} />
                )}
                {fileTab==="cleaned" && (
                  <CleanedFiles selectedOriginal={selectedOriginal} setSelectedOriginal={setSelectedOriginal}
                    originalsDropdown={originalsDropdown} isLoading={datasetsQuery.isLoading}
                    cleanedFiles={displayCleaned} selectedId={selectedId}
                    onSelect={(f) => { setSelectedFile({filename:f.filename,name:f.filename}); setSelectedOriginal(f.original||selectedOriginal); }}
                    onDownload={(fname) => downloadFromTemp(fname)}
                    showFilterNotice={Boolean(selectedOriginal)&&Array.isArray(displayCleaned)&&displayCleaned.length===0} />
                )}
              </div>
            </section>

            <DataQualityPanel filename={selectedId} />
            <CleaningRecommendationsPanel filename={selectedId} />

            <motion.section initial={fadeIn.initial} animate={fadeIn.animate} transition={fadeIn.transition}
              className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10">
              <div className="flex flex-col space-y-1 mb-4">
                <h2 className="text-xl font-semibold text-slate-800">Data Processing Pipeline</h2>
                <p className="text-sm text-gray-600">Configure and execute pipeline actions on the selected dataset.</p>
              </div>
              <motion.div variants={staggerContainer(0.06)} initial="initial" animate="animate" exit="exit">
                <ProcessingPanel steps={steps} hasSelectedFile={Boolean(selectedId)} />
              </motion.div>
            </motion.section>

            <DriftDetectionPanel filename={selectedId} />

            <section className="w-full">
              <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10 flex flex-col md:flex-row md:items-center gap-4 justify-between">
                <div>
                  <div className="text-xl font-semibold text-gray-800">Generate Auto Dashboard</div>
                  {selectedId && <div className="text-sm text-gray-500 mt-1">Selected: <span className="font-medium text-blue-600">{selectedId}</span></div>}
                </div>
                <button onClick={generateAutoDashboard} disabled={previewLoading||!selectedId}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white ${previewLoading||!selectedId?"bg-blue-400 cursor-not-allowed":"bg-blue-600 hover:bg-blue-700"} transition-colors`}>
                  {previewLoading ? <RefreshCw size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                  {previewLoading ? "Generating..." : "Generate Dashboard"}
                </button>
              </div>
            </section>

            {latestDashboard && (
              <section className="w-full">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Auto Dashboard
                    {latestDashboard.filename && <span className="ml-3 text-base font-normal text-gray-400">{latestDashboard.filename}</span>}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => exportCSV(latestDashboard.statistics, latestDashboard.schema, latestDashboard.filename.replace(/\.[^.]+$/, ""))}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition">
                      <Download size={14} /> CSV
                    </button>
                    <button onClick={() => exportPDF(dashboardRef, latestDashboard.filename.replace(/\.[^.]+$/,""), setPdfLoading)}
                      disabled={pdfLoading}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-50 rounded-lg transition">
                      {pdfLoading ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />}
                      {pdfLoading ? "Exporting…" : "PDF"}
                    </button>
                  </div>
                </div>

                <div ref={dashboardRef} className="space-y-8">
                  {(latestDashboard.kpis||[]).length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                      {(latestDashboard.kpis||[]).map((kpi, idx) => <KpiCard key={idx} kpi={kpi} />)}
                    </div>
                  )}

                  <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                    {[
                      { key:"charts",  label:"Charts",          icon:BarChart2  },
                      { key:"compare", label:"Compare",          icon:GitCompare },
                      { key:"ml",      label:"ML AutoPredictor", icon:Brain      },
                    ].map(({ key, label, icon: Icon }) => (
                      <button key={key} onClick={() => setDashTab(key)}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition ${dashTab===key?"bg-white text-gray-800 shadow-sm":"text-gray-500 hover:text-gray-700"}`}>
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>

                  {dashTab==="charts" && (
                    <>
                      {(latestDashboard.statistics?.insights||[]).length > 0 && (
                        <InsightPanel insights={latestDashboard.statistics.insights} dataQuality={latestDashboard.data_quality} />
                      )}
                      {orderedCharts.length > 0 && (
                        <DragDropContext onDragEnd={onDragEnd}>
                          <Droppable droppableId="charts" direction="horizontal">
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {orderedCharts.map((ch, idx) => (
                                  <Draggable key={ch.id} draggableId={ch.id} index={idx}>
                                    {(prov, snapshot) => (
                                      <div ref={prov.innerRef} {...prov.draggableProps}
                                        className={`${["line","heatmap","scatter"].includes(ch.type)?"lg:col-span-2":""} ${snapshot.isDragging?"opacity-75 scale-[1.01] shadow-xl z-10":""} transition-all`}>
                                        <ChartCard chart={ch} dragHandleProps={prov.dragHandleProps} />
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
                      {latestDashboard.statistics && (
                        <Dashboard statistics={latestDashboard.statistics} schema={latestDashboard.schema} dataQuality={null} />
                      )}
                    </>
                  )}

                  {dashTab==="compare" && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <GitCompare size={18} className="text-purple-500" />
                        <h3 className="text-base font-semibold text-gray-800">Compare Datasets</h3>
                      </div>
                      <ComparePanel
                        serverFiles={serverFilesList.map((f) => f.filename||f.name).filter(Boolean)}
                        currentFile={latestDashboard.filename} />
                    </div>
                  )}

                  {dashTab==="ml" && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                      <div className="flex items-center gap-2 mb-5">
                        <Brain size={18} className="text-indigo-500" />
                        <h3 className="text-base font-semibold text-gray-800">ML AutoPredictor</h3>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Random Forest</span>
                        <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">Train → Predict → Explain</span>
                      </div>
                      <MLPanel filename={latestDashboard.filename} />
                    </div>
                  )}
                </div>
              </section>
            )}

          </div>
        </div>
      </main>

      <AnimatePresence>
        {showPreview && (
          <motion.div className="fixed inset-0 z-50 bg-black/40"
            initial={modalBackdrop.initial} animate={modalBackdrop.animate}
            exit={modalBackdrop.exit} transition={modalBackdrop.transition}
            onClick={closePreview}>
            <motion.div initial={modalContent.initial} animate={modalContent.animate}
              exit={modalContent.exit} transition={modalContent.transition}
              className="mx-auto mt-16 w-[90vw] max-w-5xl" onClick={(e) => e.stopPropagation()}>
              <PreviewModal open={showPreview} onClose={closePreview}
                beforeData={previewData?.before} afterData={previewData?.after} title="Preview" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pdfLoading && (
          <motion.div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center"
            initial={modalBackdrop.initial} animate={modalBackdrop.animate}
            exit={modalBackdrop.exit} transition={modalBackdrop.transition}>
            <motion.div initial={modalContent.initial} animate={modalContent.animate}
              exit={modalContent.exit} transition={modalContent.transition}
              className="bg-white rounded-xl shadow-xl px-6 py-5 flex items-center space-x-3">
              <RefreshCw className="animate-spin h-6 w-6 text-blue-600" />
              <div className="text-sm font-medium text-slate-800">Generating PDF…</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}