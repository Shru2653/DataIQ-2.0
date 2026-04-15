import React, { useMemo } from "react";

export default function CleanedFiles({
  selectedOriginal,
  setSelectedOriginal,
  originalsDropdown = [],
  isLoading = false,
  cleanedFiles = [],
  isEmpty = true,
  selectedId,
  onSelect,
  onDownload,
  showFilterNotice = false,
}) {
  const list = useMemo(
    () => (Array.isArray(cleanedFiles) ? cleanedFiles : []),
    [cleanedFiles],
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:gap-3 gap-2">
        <label className="text-sm text-[var(--text2)]">Original file</label>
        <select
          className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] bg-[var(--card)]"
          value={selectedOriginal}
          onChange={(e) => setSelectedOriginal(e.target.value)}
        >
          {originalsDropdown.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {isLoading && <div className="text-xs text-[var(--text3)]">Loading…</div>}
        {!isLoading && selectedOriginal && showFilterNotice && (
          <button
            className="text-xs text-[var(--accent)] underline"
            onClick={() => setSelectedOriginal("")}
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {!isLoading && selectedOriginal && showFilterNotice && (
          <div className="text-xs text-amber-600 col-span-full">
            No cleaned files found for "{selectedOriginal}". Showing all cleaned
            files.
          </div>
        )}

        {list.map((f, idx) => {
          const name = f.filename || `cleaned_${idx}`;
          const isSelected = !!selectedId && selectedId === name;
          return (
            <div
              key={name}
              className={`w-full p-6 lg:p-8 rounded-lg border shadow-sm transition-all min-h-[200px] flex flex-col bg-[var(--card)] ${
                isSelected
                  ? "border-[var(--border-active)] bg-[var(--accent-light)]"
                  : "border-[var(--border)]"
              }`}
            >
              <div className={`text-lg font-semibold break-all ${isSelected ? "text-[var(--text-active)]" : "text-[var(--text)]"}`}>
                {name}
              </div>
              <div className="text-sm text-[var(--text3)] mt-1 flex items-center gap-2">
                <span>
                  Size: {f.size ? (f.size / 1024).toFixed(1) : "—"} KB
                </span>
                {f.created_at && (
                  <span>• {new Date(f.created_at).toLocaleString()}</span>
                )}
              </div>
              {f.original && (
                <div className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--text2)] bg-[color-mix(in_srgb,var(--border),#ffffff_55%)] px-2 py-0.5 rounded">
                  <span>Cleaned from:</span>
                  <span className="font-medium">{f.original}</span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="px-3 py-1.5 text-sm rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors"
                  onClick={() =>
                    onSelect?.({ filename: name, original: f.original })
                  }
                >
                  Select
                </button>
                <button
                  className="px-3 py-1.5 text-sm rounded-md border border-[var(--border)] text-[var(--text)] hover:bg-[var(--accent-light)] hover:border-[var(--border-active)] transition-colors"
                  onClick={() => onDownload?.(name)}
                >
                  Download
                </button>
              </div>
            </div>
          );
        })}

        {list.length === 0 && (
          <div className="text-sm text-[var(--text2)]">No cleaned files found.</div>
        )}
      </div>
    </div>
  );
}
