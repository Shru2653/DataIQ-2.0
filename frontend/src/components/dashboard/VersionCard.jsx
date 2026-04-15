/**
 * VersionCard.jsx — Single dataset version display
 */

import React from "react";
import { Download, Copy, Clock, Check } from "lucide-react";
import { motion } from "framer-motion";

function formatDate(isoString) {
  if (!isoString) return "Unknown";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Unknown";
  }
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function VersionCard({
  version,
  datasetName,
  isLatest = false,
  onSelect,
  onDownload,
}) {
  const {
    version: versionNum,
    operation,
    human_readable_name,
    filename,
    file_size,
    created_at,
    parent_version,
  } = version;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`relative rounded-xl border transition-all duration-200 overflow-hidden ${
        isLatest
          ? "border-[var(--border-active)] bg-[var(--accent-light)] ring-1 ring-[color-mix(in_srgb,var(--accent),#ffffff_55%)]"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-active)] hover:shadow-sm"
      }`}
    >
      {/* Latest badge */}
      {isLatest && (
        <div className="absolute top-3 right-3 px-3 py-1 bg-[var(--card)] text-[var(--accent)] text-xs font-semibold rounded-full flex items-center gap-1 border border-[color-mix(in_srgb,var(--accent),#ffffff_60%)]">
          <Check size={12} />
          Latest
        </div>
      )}

      <div className="p-5">
        {/* Version header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[var(--text)]">
              {human_readable_name}
            </h3>
            <p className="text-sm mt-1 flex items-center gap-1 text-[var(--text2)]">
              <Clock size={12} />
              {formatDate(created_at)}
            </p>
          </div>
          <div className="text-xs font-medium px-2.5 py-1 rounded-full bg-[color-mix(in_srgb,var(--border),#ffffff_55%)] text-[var(--text2)]">
            v{versionNum}
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-2 mb-4 text-sm text-[var(--text2)]">
          <div className="flex justify-between">
            <span>File Size:</span>
            <span className="font-medium text-[var(--text)]">{formatFileSize(file_size)}</span>
          </div>
          <div className="flex justify-between">
            <span>Filename:</span>
            <span className="font-medium text-[var(--text)] truncate max-w-[200px]" title={filename}>
              {filename}
            </span>
          </div>
          {parent_version && (
            <div className="flex justify-between">
              <span>Based on:</span>
              <span className="font-medium text-[var(--accent)]">v{parent_version}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onSelect?.(version)}
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors"
          >
            Select
          </button>
          <button
            onClick={() => onDownload?.(filename)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] hover:border-[var(--border-active)] text-[var(--text)] hover:bg-[var(--accent-light)] text-sm font-medium transition-colors"
            title="Download version"
          >
            <Download size={14} />
            Download
          </button>
        </div>
      </div>
    </motion.div>
  );
}
