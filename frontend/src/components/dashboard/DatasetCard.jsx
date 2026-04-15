/**
 * DatasetCard.jsx — Grouped dataset with version history
 */

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import VersionCard from "./VersionCard";

function formatDate(isoString) {
  if (!isoString) return "Unknown";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

export default function DatasetCard({
  dataset,
  onSelectVersion,
  onDownloadVersion,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    dataset_name,
    version_count,
    created_at,
    updated_at,
    latest_version,
    versions = [],
  } = dataset;

  // Sort versions chronologically
  const sortedVersions = [...versions].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeA - timeB;
  });

  const latestVersionNum = latest_version?.version;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border bg-[var(--card)] shadow-sm overflow-hidden hover:shadow-md transition-shadow border-[var(--border)]"
    >
      {/* Dataset Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between transition-colors hover:bg-[var(--accent-light)]"
      >
        <div className="flex items-center gap-4 text-left">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--icon-blue)]">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
              {dataset_name.replace(/_/g, " ").toUpperCase()}
            </h3>
            <p style={{ fontSize: "11px", marginTop: "4px", color: "var(--text2)" }}>
              {version_count} {version_count === 1 ? "version" : "versions"} •{" "}
              Updated {formatDate(updated_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-[var(--accent)]">LATEST</p>
            <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text)" }}>
              {latest_version?.human_readable_name || "Unknown"}
            </p>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-6 h-6 text-[var(--text3)]" />
          ) : (
            <ChevronDown className="w-6 h-6 text-[var(--text3)]" />
          )}
        </div>
      </button>

      {/* Version Timeline (Expanded) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t px-6 py-6 border-[var(--border)] bg-[color-mix(in_srgb,var(--bg),#ffffff_55%)]"
          >
            {/* Version Flow (optional visual) */}
            {version_count > 1 && (
              <div className="mb-6 pb-6 border-b border-[var(--border)]">
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {sortedVersions.map((version, idx) => (
                    <React.Fragment key={`${version.version}-flow`}>
                      <div
                        className={`px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 whitespace-nowrap transition-colors ${
                          version.version === latestVersionNum
                            ? "bg-[var(--accent-light)] text-[var(--accent)] ring-1 ring-[color-mix(in_srgb,var(--accent),#ffffff_55%)]"
                            : "bg-[color-mix(in_srgb,var(--border),#ffffff_45%)] text-[var(--text2)]"
                        }`}
                      >
                        {version.human_readable_name}
                      </div>
                      {idx < sortedVersions.length - 1 && (
                        <div className="text-[var(--text3)] text-lg flex-shrink-0">
                          →
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                <p className="text-xs mt-2 text-[var(--text2)]">
                  Version progression from original to latest
                </p>
              </div>
            )}

            {/* Version Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedVersions.map((version) => (
                <VersionCard
                  key={`${version.version}-card`}
                  version={version}
                  datasetName={dataset_name}
                  isLatest={version.version === latestVersionNum}
                  onSelect={onSelectVersion}
                  onDownload={onDownloadVersion}
                />
              ))}
            </div>

            {/* Empty state */}
            {sortedVersions.length === 0 && (
              <div className="text-center py-8">
                <p className="text-[var(--text2)]">No versions found</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
