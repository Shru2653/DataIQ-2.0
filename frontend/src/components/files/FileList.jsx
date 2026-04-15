/**
 * FileList.jsx  — with file preview support
 *
 * Changes vs original:
 *   • Each file card has a "Preview" button
 *   • Clicking preview opens FilePreviewModal
 *   • Everything else (onSelect, onDelete, cleanedCounts, onViewCleaned) unchanged
 */

import React, { useState } from "react";
import {
  FileText,
  CheckCircle2,
  Eye,
  Layers,
  Trash2,
  Clock,
} from "lucide-react";
import FilePreviewModal from "./FilePreviewModal";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ── File card ─────────────────────────────────────────────────────────────────
function FileCard({
  file,
  isSelected,
  onSelect,
  onDelete,
  onPreview,
  onViewCleaned,
  cleanedCount,
}) {
  const filename = file.filename || file.name || "";
  const ext      = filename.split(".").pop()?.toUpperCase() ?? "";
  const extColor = ext === "CSV"
    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
    : ext === "XLSX" || ext === "XLS"
    ? "bg-[var(--accent-light)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent),#ffffff_60%)]"
    : "bg-[color-mix(in_srgb,var(--border),#ffffff_55%)] text-[var(--text2)] border border-[var(--border)]";

  return (
    <div
      onClick={() => onSelect(file)}
      className={`group relative rounded-xl border transition-all duration-150 cursor-pointer
        ${isSelected
          ? "border-[var(--border-active)] bg-[var(--accent-light)] shadow-sm ring-1 ring-[color-mix(in_srgb,var(--accent),#ffffff_55%)]"
          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-active)] hover:shadow-sm"
        }`}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3">
          <CheckCircle2 size={16} className="text-[var(--accent)]" />
        </div>
      )}

      <div className="p-4">
        {/* Top row: icon + name */}
        <div className="flex items-start gap-3 pr-5">
          <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${extColor}`}>
            {ext || <FileText size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-base font-semibold text-[var(--text)] truncate leading-snug"
              title={filename}
            >
              {filename}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {file.size && (
                <span className="text-xs text-[var(--text3)]">{fmtSize(file.size)}</span>
              )}
              {file.uploaded_at && (
                <span className="flex items-center gap-0.5 text-xs text-[var(--text3)]">
                  <Clock size={10} />
                  {fmtDate(file.uploaded_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div
          className="mt-3 flex items-center gap-2 flex-wrap"
          onClick={(e) => e.stopPropagation()}  /* don't trigger onSelect */
        >
          {/* Preview */}
          <button
            onClick={() => onPreview(file)}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg
                       bg-[var(--accent-light)] hover:bg-[color-mix(in_srgb,var(--accent-light),#ffffff_40%)]
                       text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent),#ffffff_60%)]
                       hover:border-[var(--border-active)] transition"
            title="Preview file contents"
          >
            <Eye size={12} />
            Preview
          </button>

          {/* View cleaned versions */}
          {cleanedCount > 0 && onViewCleaned && (
            <button
              onClick={() => onViewCleaned(file)}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg
                         bg-[color-mix(in_srgb,var(--icon-violet),#ffffff_92%)]
                         hover:bg-[color-mix(in_srgb,var(--icon-violet),#ffffff_88%)]
                         text-[var(--icon-violet)]
                         border border-[color-mix(in_srgb,var(--icon-violet),#ffffff_70%)]
                         transition"
              title={`${cleanedCount} cleaned version(s)`}
            >
              <Layers size={12} />
              {cleanedCount} cleaned
            </button>
          )}

          {/* Delete */}
          {onDelete && (
            <button
              onClick={() => onDelete(file)}
              className="flex items-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded-lg
                         bg-red-50 hover:bg-red-100 text-red-600 border border-red-200
                         hover:border-red-300 transition ml-auto"
              title="Delete file"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main FileList ─────────────────────────────────────────────────────────────
export default function FileList({
  files = [],
  selectedId,
  onSelect,
  onDelete,
  cleanedCounts,
  onViewCleaned,
}) {
  const [previewFile, setPreviewFile] = useState(null);

  if (!files.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-[var(--text3)] gap-2">
        <FileText size={32} className="opacity-40" />
        <p className="text-base font-medium text-[var(--text)]">No files uploaded yet</p>
        <p className="text-sm text-[var(--text2)]">Upload a CSV or Excel file to get started</p>
      </div>
    );
  }

  return (
    <>
      {/* File grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {files.map((file) => {
          const id    = file.id ?? file._id ?? file.filename ?? file.name;
          const fname = file.filename || file.name || "";
          const cleanedCount = cleanedCounts?.get?.(fname) ?? 0;

          return (
            <FileCard
              key={id}
              file={file}
              isSelected={selectedId === id}
              onSelect={onSelect}
              onDelete={onDelete}
              onPreview={(f) => setPreviewFile(f.filename || f.name)}
              onViewCleaned={onViewCleaned}
              cleanedCount={cleanedCount}
            />
          );
        })}
      </div>

      {/* Preview modal */}
      {previewFile && (
        <FilePreviewModal
          filename={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}
