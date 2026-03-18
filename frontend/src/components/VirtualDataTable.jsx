import React, { useMemo, useRef, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

// Reusable virtualized data table
// Props:
// - columns: TanStack column defs
// - data: array of rows
// - height: px height of scroll container (default 480)
// - rowEstimate: estimated row height in px (default 36)
// - isLoading: show skeleton loader when true
// - enableColumnVisibility: show column visibility toggles (default true)
// - enableSorting: enable basic sorting via header clicks (default true)
export default function VirtualDataTable({
  columns = [],
  data = [],
  height = 480,
  rowEstimate = 36,
  isLoading = false,
  enableColumnVisibility = true,
  enableSorting = true,
}) {
  const [sorting, setSorting] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({});

  const memoCols = useMemo(() => columns, [columns]);
  const memoData = useMemo(() => data, [data]);

  const table = useReactTable({
    data: memoData,
    columns: memoCols,
    state: { sorting, columnVisibility },
    enableSorting,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: false,
  });

  const parentRef = useRef(null);
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowEstimate,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className="w-full">
      {/* Controls */}
      {(enableColumnVisibility || enableSorting) && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
          {enableColumnVisibility && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">Columns:</span>
              {table.getAllLeafColumns().map((col) => (
                <label key={col.id} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-slate-300">
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                  />
                  <span>{col.columnDef.header || col.id}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table with sticky header and virtualized body in SAME table for perfect alignment */}
      <div ref={parentRef} style={{ maxHeight: height }} className="overflow-auto rounded-lg border border-slate-800 bg-slate-900">
        <table className="w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-800">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = enableSorting && header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 border-b border-r last:border-r-0 border-slate-700 select-none ${
                        canSort ? 'cursor-pointer hover:bg-slate-700/50' : ''
                      }`}
                      style={{ width: header.getSize?.() ?? 150, boxSizing: 'border-box' }}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' && <span className="text-slate-400">▲</span>}
                          {sortDir === 'desc' && <span className="text-slate-400">▼</span>}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody style={{ position: 'relative', height: totalSize }}>
            {isLoading ? (
              <SkeletonRows columns={table.getAllLeafColumns().length} height={height} />
            ) : (
              virtualItems.map((vi) => {
                const row = rows[vi.index];
                return (
                  <tr
                    key={row.id}
                    data-index={vi.index}
                    style={{ position: 'absolute', transform: `translateY(${vi.start}px)`, width: '100%' }}
                    className="border-b border-slate-800 hover:bg-slate-800/50 even:bg-slate-800/30"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-3 py-2 text-sm text-slate-200 border-r last:border-r-0 border-slate-800 align-middle whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{ width: cell.column.getSize?.() ?? 150, boxSizing: 'border-box' }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination (client-side) */}
      <div className="mt-2 flex items-center justify-between text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-slate-700 px-2 py-1 disabled:opacity-50"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
          >
            « First
          </button>
          <button
            className="rounded border border-slate-700 px-2 py-1 disabled:opacity-50"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            ‹ Prev
          </button>
          <button
            className="rounded border border-slate-700 px-2 py-1 disabled:opacity-50"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next ›
          </button>
          <button
            className="rounded border border-slate-700 px-2 py-1 disabled:opacity-50"
            onClick={() => table.lastPage?.()}
            disabled={!table.getCanNextPage()}
          >
            Last »
          </button>
        </div>
        <div>
          Page <span className="font-semibold">{table.getState().pagination.pageIndex + 1}</span> of{' '}
          <span className="font-semibold">{table.getPageCount()}</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows({ columns = 5, height = 480 }) {
  // render placeholder skeleton blocks to match scroll container height
  const count = Math.ceil(height / 32);
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <tr key={idx} className="animate-pulse border-b border-slate-800">
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c} className="px-3 py-2">
              <div className="h-4 w-full rounded bg-slate-700/50" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
