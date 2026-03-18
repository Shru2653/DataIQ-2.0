import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Filter,
  Play,
  CheckCircle,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Download,
  AlertCircle,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";

export default function ActionCard({
  card,
  isExpanded,
  hasSelectedFile = false,
  onToggle,
  onExecute,
  onPreview,
  onDownload,
}) {
  const Icon = card.icon;
  const [selectedAction, setSelectedAction] = useState(
    card.options?.actions?.[0] || "",
  );
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [settings, setSettings] = useState(card.options?.settings || {});
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  // Read stepStatus directly from the Zustand store so the card always reflects
  // the latest run state without relying on ProcessingPanel's local copy.
  const stepStatus = useAppStore((s) => s.processingSteps?.[card.key]?.status);
  const stepOutput = useAppStore((s) => s.processingSteps?.[card.key]?.output);

  // A file is available to download when the step has completed and the
  // backend returned a new_file name in its response payload.
  const hasFile = Boolean(stepOutput?.new_file);

  const colorClasses = {
    blue: "from-blue-500   to-blue-600   hover:shadow-blue-200",
    indigo: "from-indigo-500 to-indigo-600 hover:shadow-indigo-200",
    purple: "from-purple-500 to-purple-600 hover:shadow-purple-200",
  };

  const handleFilterToggle = (filter) => {
    setSelectedFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter],
    );
  };

  const handleSettingChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleExecute = async () => {
    if (onExecute) {
      await onExecute({
        stepId: card.key,
        action: selectedAction,
        filters: selectedFilters,
        settings,
      });
    }
  };

  const handlePreview = async () => {
    if (onPreview) {
      await onPreview({
        stepId: card.key,
        action: selectedAction,
        filters: selectedFilters,
        settings,
      });
    }
  };

  const handleDownload = async () => {
    if (!onDownload) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      await onDownload();
    } catch (err) {
      setDownloadError(err?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        layout: { type: "spring", stiffness: 300, damping: 30 },
        opacity: { duration: 0.3, delay: card.delay || 0 },
        y: { duration: 0.3, delay: card.delay || 0 },
      }}
      className={`group w-full h-full min-h-[260px] flex flex-col justify-between bg-white rounded-xl p-6 border border-slate-200 shadow-sm
        hover:border-blue-300 transition-all duration-500
        ${
          isExpanded
            ? "md:col-span-2 lg:col-span-3 xl:col-span-4 2xl:col-span-5 shadow-xl border-blue-400"
            : "hover:shadow-xl hover:-translate-y-2"
        }`}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-14 h-14 bg-gradient-to-r ${colorClasses[card.color] ?? colorClasses.blue}
          rounded-xl flex items-center justify-center shadow-lg
          group-hover:scale-110 transition-transform duration-300`}
        >
          <Icon className="w-7 h-7 text-white" />
        </div>

        <div className="flex items-center space-x-2">
          {hasSelectedFile && stepStatus === "done" && (
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
          )}
          {hasSelectedFile && stepStatus === "running" && (
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-white animate-spin" />
            </div>
          )}
          {hasSelectedFile && stepStatus === "error" && (
            <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            onClick={onToggle}
            className="p-2 rounded-lg hover:bg-blue-50 transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-600" />
            )}
          </button>
        </div>
      </div>

      {/* ── Title & Description ─────────────────────────────────────────── */}
      <div className="cursor-pointer" onClick={onToggle}>
        <h3 className="text-lg font-semibold text-slate-800 mb-3 group-hover:text-blue-700 transition-colors">
          {card.title}
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          {card.description}
        </p>
      </div>

      {/* ── Collapsed footer ────────────────────────────────────────────── */}
      {!isExpanded && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 mt-auto">
          <div
            className="inline-flex items-center gap-2 text-blue-600 font-semibold cursor-pointer hover:text-blue-700 transition-colors self-end"
            onClick={onToggle}
          >
            <span>Configure &amp; Run</span>
            <Play className="w-4 h-4 shrink-0 group-hover:translate-x-1 transition-transform" />
          </div>
          <div className="flex items-center gap-2 self-end whitespace-nowrap">
            <span className="text-sm leading-none text-slate-500">
              {card.options?.actions?.length || 0} actions
            </span>
            <Sliders className="w-4 h-4 shrink-0 text-slate-400" />
          </div>
        </div>
      )}

      {/* ── Expanded panel ──────────────────────────────────────────────── */}
      {/*
        NOTE: intentionally NOT using height:0→auto animation here.
        Framer Motion's height clip leaves overflow:hidden on the element
        in certain re-render patterns, making the action buttons unreachable.
        opacity + translateY gives a smooth entrance with zero clipping risk.
      */}
      <AnimatePresence initial={false}>
        {isExpanded && card.options && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-6 pt-6 border-t border-slate-200"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Actions */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Play className="w-4 h-4 text-blue-600" />
                  </div>
                  <h4 className="font-semibold text-slate-800">Actions</h4>
                </div>
                <div className="space-y-2">
                  {card.options.actions?.map((action, idx) => (
                    <label
                      key={idx}
                      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={`action-${card.key}`}
                        checked={selectedAction === action}
                        onChange={() => setSelectedAction(action)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-slate-700">{action}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Filters */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Filter className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h4 className="font-semibold text-slate-800">Filters</h4>
                </div>
                <div className="space-y-2">
                  {card.options.filters?.map((filter, idx) => (
                    <label
                      key={idx}
                      className="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFilters.includes(filter)}
                        onChange={() => handleFilterToggle(filter)}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="text-sm text-slate-700">{filter}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Sliders className="w-4 h-4 text-purple-600" />
                  </div>
                  <h4 className="font-semibold text-slate-800">Settings</h4>
                </div>
                <div className="space-y-3">
                  {card.options.settings &&
                    Object.entries(card.options.settings).map(
                      ([key, value]) => (
                        <div key={key}>
                          <label className="block text-sm font-medium text-slate-700 mb-1 capitalize">
                            {key.replace(/_/g, " ")}
                          </label>
                          {typeof value === "boolean" ? (
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={settings[key]}
                                onChange={(e) =>
                                  handleSettingChange(key, e.target.checked)
                                }
                                className="w-4 h-4 text-purple-600 rounded"
                              />
                              <span className="text-sm text-slate-600">
                                Enable
                              </span>
                            </label>
                          ) : typeof value === "number" ? (
                            <input
                              type="number"
                              value={settings[key]}
                              onChange={(e) =>
                                handleSettingChange(
                                  key,
                                  parseFloat(e.target.value),
                                )
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg
                              focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          ) : (
                            <input
                              type="text"
                              value={settings[key]}
                              onChange={(e) =>
                                handleSettingChange(key, e.target.value)
                              }
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg
                              focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          )}
                        </div>
                      ),
                    )}
                </div>
              </div>
            </div>

            {/* ── Action buttons row ──────────────────────────────────── */}
            <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-slate-200 sm:flex-row sm:items-center sm:justify-between">
              {/* Status / selection summary */}
              <div className="text-sm text-slate-500">
                Action:{" "}
                <span className="font-medium text-slate-700">
                  {selectedAction || "None"}
                </span>
                {selectedFilters.length > 0 && (
                  <span className="ml-3">
                    Filters:{" "}
                    <span className="font-medium text-slate-700">
                      {selectedFilters.length}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {/* Execute */}
                <button
                  onClick={handleExecute}
                  disabled={!hasSelectedFile || stepStatus === "running"}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white
                    rounded-lg font-semibold hover:shadow-lg hover:scale-105
                    transition-all duration-300
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100
                    flex items-center space-x-2"
                >
                  {stepStatus === "running" ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Running…</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Execute</span>
                    </>
                  )}
                </button>

                {/* Preview */}
                <button
                  onClick={handlePreview}
                  disabled={!hasSelectedFile || stepStatus === "running"}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg
                    font-semibold hover:bg-slate-50 transition-all duration-300
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Preview
                </button>

                {/* Download ─ only fully active once a processed file exists */}
                <button
                  onClick={handleDownload}
                  disabled={!hasSelectedFile || downloading || !hasFile}
                  title={
                    !hasSelectedFile
                      ? "Select a file first"
                      : !hasFile
                        ? "Run Execute first to generate a file"
                        : downloading
                          ? "Downloading…"
                          : `Download ${stepOutput?.new_file ?? "result"}`
                  }
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold
                    transition-all duration-300 border
                    ${
                      hasFile && !downloading
                        ? "bg-green-50 border-green-300 text-green-700 hover:bg-green-100 hover:border-green-400"
                        : "border-slate-300 text-slate-400 cursor-not-allowed opacity-60"
                    }`}
                >
                  {downloading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>{downloading ? "Downloading…" : "Download"}</span>
                </button>
              </div>
            </div>

            {/* Download error message */}
            {downloadError && (
              <div
                className="mt-3 flex items-center gap-2 p-2.5 rounded-lg
                bg-red-50 border border-red-200 text-red-700 text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{downloadError}</span>
              </div>
            )}

            {/* Hint when no file yet */}
            {!hasSelectedFile && (
              <p className="mt-3 text-xs text-slate-400 text-right">
                Select a file to enable Execute, Preview, and Download.
              </p>
            )}
            {hasSelectedFile && !hasFile && stepStatus !== "running" && (
              <p className="mt-3 text-xs text-slate-400 text-right">
                {stepStatus === "done"
                  ? "No output file was produced by this step."
                  : "Click Execute to process the dataset, then Download will become available."}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
