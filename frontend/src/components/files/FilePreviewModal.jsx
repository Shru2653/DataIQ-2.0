/**
 * FilePreviewModal.jsx
 *
 * Drop-in preview modal for any CSV/Excel file.
 * Props:
 *   filename  – string  (filename on server)
 *   onClose   – fn()    (called when modal should close)
 */

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  X,
  Search,
  Download,
  AlertCircle,
  Loader2,
  FileText,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import axiosClient from "../../api/axiosClient";

// ─── dtype → readable label + colour ────────────────────────────────────────
function DtypeBadge({ dtype }) {
  const map = {
    int:    { label: "int",    cls: "bg-[var(--accent-light)] text-[var(--accent)]"   },
    float:  { label: "float",  cls: "bg-[color-mix(in_srgb,var(--icon-violet),#ffffff_92%)] text-[var(--icon-violet)]" },
    object: { label: "text",   cls: "bg-[color-mix(in_srgb,var(--border),#ffffff_55%)] text-[var(--text2)]"   },
    bool:   { label: "bool",   cls: "bg-[var(--accent-light)] text-[var(--accent)]" },
    date:   { label: "date",   cls: "bg-green-100 text-green-700" },
  };
  const key = Object.keys(map).find((k) => dtype.toLowerCase().includes(k)) ?? "object";
  const { label, cls } = map[key];
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  );
}

// ─── Single table cell ────────────────────────────────────────────────────────
function Cell({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-[var(--text3)] italic text-xs">null</span>;
  }
  const str = String(value);
  return (
    <span
      title={str.length > 40 ? str : undefined}
      className="block max-w-[180px] truncate"
    >
      {str}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FilePreviewModal({ filename, onClose }) {
  const [data,    setData]    = useState(null);   // API response
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [search,  setSearch]  = useState("");
  const [sort,    setSort]    = useState({ col: null, dir: "asc" });
  const [rows,    setRows]    = useState(20);

  const searchRef = useRef(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!filename) return;
    setLoading(true);
    setError(null);
    axiosClient
      .get("/api/preview", { params: { filename, rows } })
      .then((res) => setData(res.data))
      .catch((err) => {
        setError(
          err?.response?.data?.detail ||
          err?.message ||
          "Failed to load preview."
        );
      })
      .finally(() => setLoading(false));
  }, [filename, rows]);

  // Focus search on open
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 100);
  }, [loading]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Filtered + sorted rows ───────────────────────────────────────────────────
  const displayRows = useMemo(() => {
    if (!data?.rows) return [];
    let r = data.rows;

    // Search across all columns
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((row) =>
        Object.values(row).some((v) =>
          v !== null && String(v).toLowerCase().includes(q)
        )
      );
    }

    // Sort
    if (sort.col) {
      r = [...r].sort((a, b) => {
        const va = a[sort.col], vb = b[sort.col];
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        const na = parseFloat(va), nb = parseFloat(vb);
        const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : String(va).localeCompare(String(vb));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }

    return r;
  }, [data, search, sort]);

  function toggleSort(col) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );
  }

  function SortIcon({ col }) {
    if (sort.col !== col) return <ChevronsUpDown size={11} className="opacity-30" />;
    return sort.dir === "asc"
      ? <ChevronUp size={11} className="text-blue-500" />
      : <ChevronDown size={11} className="text-blue-500" />;
  }

  // ── Missing % bar colour ─────────────────────────────────────────────────────
  function missingColor(pct) {
    if (pct === 0)  return "bg-green-400";
    if (pct < 10)   return "bg-yellow-400";
    if (pct < 30)   return "bg-blue-400";
    return "bg-red-500";
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Modal */}
      <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-[var(--border)]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-light)] flex items-center justify-center">
              <FileText size={18} className="text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--text)] text-base leading-none">
                {filename}
              </h2>
              {data && (
                <p className="text-xs text-[var(--text3)] mt-0.5">
                  {data.total_rows?.toLocaleString()} rows ·{" "}
                  {data.total_columns} columns
                  {data.total_rows > rows && (
                    <span className="text-amber-600 ml-1">
                      · showing first {rows}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--accent-light)] text-[var(--text2)] hover:text-[var(--text)] transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            <p className="text-sm text-[var(--text3)]">Loading preview…</p>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
            <AlertCircle size={32} className="text-red-400" />
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button
              onClick={() => { setError(null); setLoading(true); }}
              className="text-xs text-[var(--accent)] underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Content ── */}
        {!loading && !error && data && (
          <>
            {/* Column metadata strip */}
            <div className="px-6 py-3 bg-[color-mix(in_srgb,var(--bg),#ffffff_60%)] border-b border-[var(--border)] flex-shrink-0 overflow-x-auto">
              <div className="flex gap-3 min-w-max">
                {data.columns.map((col) => (
                  <div
                    key={col.name}
                    className="flex flex-col items-start bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-2 min-w-[100px]"
                  >
                    <span className="text-[11px] font-semibold text-[var(--text)] truncate max-w-[120px]" title={col.name}>
                      {col.name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <DtypeBadge dtype={col.dtype} />
                      {col.missing_pct > 0 && (
                        <span className="text-[10px] text-[var(--accent)]">
                          {col.missing_pct}% null
                        </span>
                      )}
                    </div>
                    {/* Missing % bar */}
                    <div className="mt-1.5 w-full h-1 bg-[color-mix(in_srgb,var(--border),#ffffff_55%)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${missingColor(col.missing_pct)}`}
                        style={{ width: `${Math.max(col.missing_pct, col.missing_pct > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Search + rows control */}
            <div className="px-6 py-3 flex items-center gap-3 border-b border-[var(--border)] flex-shrink-0">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-3 top-2.5 text-[var(--text3)]" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search in preview…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[color-mix(in_srgb,var(--bg),#ffffff_60%)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:bg-[var(--card)]"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-2.5 text-[var(--text3)] hover:text-[var(--text2)]"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <span className="text-xs text-[var(--text3)]">
                {search
                  ? `${displayRows.length} match${displayRows.length !== 1 ? "es" : ""}`
                  : `${displayRows.length} rows shown`}
              </span>

              <div className="ml-auto flex items-center gap-2">
                <label className="text-xs text-[var(--text2)]">Show rows:</label>
                <select
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                  className="text-xs border border-[var(--border)] rounded-lg px-2 py-1.5 bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {displayRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[var(--text3)] text-sm gap-2">
                  <Search size={24} />
                  <p>No rows match <strong>"{search}"</strong></p>
                  <button onClick={() => setSearch("")} className="text-[var(--accent)] text-xs underline">
                    Clear search
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[color-mix(in_srgb,var(--bg),#ffffff_60%)] border-b border-[var(--border)]">
                      {/* Row number column */}
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-[var(--text3)] w-10 select-none">
                        #
                      </th>
                      {data.columns.map((col) => (
                        <th
                          key={col.name}
                          onClick={() => toggleSort(col.name)}
                          className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text2)] cursor-pointer hover:bg-[var(--accent-light)] transition select-none whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[140px]" title={col.name}>
                              {col.name}
                            </span>
                            <SortIcon col={col.name} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-[color-mix(in_srgb,var(--border),#ffffff_55%)] hover:bg-[var(--accent-light)] transition-colors ${
                          i % 2 === 0 ? "bg-[var(--card)]" : "bg-[color-mix(in_srgb,var(--bg),#ffffff_80%)]"
                        }`}
                      >
                        <td className="py-2 px-3 text-xs text-[var(--text3)] font-mono select-none">
                          {i + 1}
                        </td>
                        {data.columns.map((col) => (
                          <td
                            key={col.name}
                            className="py-2 px-3 text-[var(--text)] text-xs font-mono whitespace-nowrap"
                          >
                            <Cell value={row[col.name]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[var(--border)] flex items-center justify-between flex-shrink-0 bg-[color-mix(in_srgb,var(--bg),#ffffff_60%)]">
              <p className="text-xs text-[var(--text3)]">
                Previewing {displayRows.length} of {data.total_rows?.toLocaleString()} rows
                {search && ` (filtered)`}
              </p>
              <div className="flex gap-2">
                {data.total_rows > rows && (
                  <button
                    onClick={() => setRows((r) => Math.min(r + 20, 100))}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--card)] hover:border-[var(--border-active)] transition text-[var(--text2)]"
                  >
                    Load more
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="text-xs px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
