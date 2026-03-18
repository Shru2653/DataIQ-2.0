import { motion } from "framer-motion";
import { Database, CheckCircle, Download, Trash2, Layers } from "lucide-react";
import React from "react";

// Optional: define API base if you use file URLs
const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function FileList({
  files = [],
  selectedId,
  onSelect,
  onDelete,
  cleanedCounts,
  onViewCleaned,
}) {
  // Normalize possible file list formats
  const list = Array.isArray(files)
    ? files
    : Array.isArray(files?.files)
      ? files.files
      : Array.isArray(files?.data)
        ? files.data
        : [];

  // Find the selected file object
  const selectedFile = list.find(
    (f) => (f.id ?? f._id ?? f.name ?? f.filename) === selectedId,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
      style={{ animationDelay: "0.8s" }}
    >
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
          <Database className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800">Server Files</h2>
      </div>

      {/* File Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {list.map((f, i) => {
          const id = f.id ?? f._id ?? f.name ?? f.filename;
          const filename = f.filename ?? f.name ?? `File ${i + 1}`;
          const sizeKB = f.size ? (f.size / 1024).toFixed(1) : "—";
          const isSelected = selectedId === id;
          const count = cleanedCounts?.get(filename) || 0;

          return (
            <div
              key={id}
              onClick={() => onSelect?.(f)}
              className={`w-full p-6 lg:p-8 rounded-lg border shadow-sm bg-white transition-all cursor-pointer hover:shadow-md min-h-[200px] flex flex-col ${
                isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900 break-all">
                    {filename}
                  </div>
                  <div className="text-sm text-gray-500">{sizeKB} KB</div>
                </div>

                <div className="flex items-center space-x-2">
                  {isSelected && (
                    <CheckCircle className="w-5 h-5 text-blue-500" />
                  )}

                  {/* Download button (if file has URL) */}
                  {f.url && (
                    <a
                      href={`${API_BASE}${f.url}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}

                  {/* Delete button (if enabled) */}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.(id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100">
                {count > 0 ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent card's onSelect
                      onViewCleaned?.(f);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    View Cleaned ({count})
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg">
                    Pending Cleaning
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {list.length === 0 && (
          <div className="text-sm text-gray-500">No files uploaded yet.</div>
        )}
      </div>

      {/* Footer tips */}
      {selectedFile ? (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-700">
            <strong>Selected:</strong>{" "}
            {selectedFile.filename ?? selectedFile.name} — Click “Preview” in
            any module to view this file
          </div>
        </div>
      ) : list.length > 0 ? (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-sm text-yellow-700">
            <strong>Tip:</strong> Click on a file above to select it, or use
            “Preview” to automatically view the first file
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
