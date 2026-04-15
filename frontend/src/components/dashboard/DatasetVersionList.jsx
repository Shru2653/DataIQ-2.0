/**
 * DatasetVersionList.jsx — Main component for dataset versioning UI
 */

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Database, AlertCircle } from "lucide-react";
import axiosClient from "../../api/axiosClient";
import DatasetCard from "./DatasetCard";

export default function DatasetVersionList({
  onSelectFile = null,
  onDownloadFile = null,
}) {
  const [selectedVersion, setSelectedVersion] = useState(null);

  // Fetch datasets grouped by version
  const { data, isLoading, error } = useQuery({
    queryKey: ["datasets:grouped"],
    queryFn: async () => {
      const response = await axiosClient.get("/api/dataset-versions/grouped");
      return response.data;
    },
    staleTime: 30000,
    retry: 2,
  });

  const datasets = data?.datasets || [];

  const handleSelectVersion = (version) => {
    setSelectedVersion(version);
    // Call parent's onSelectFile if provided
    if (onSelectFile) {
      onSelectFile({
        filename: version.filename,
        dataset_name: version.dataset_name,
        version: version.version,
        operation: version.operation,
      });
    }
  };

  const handleDownloadVersion = async (filename) => {
    try {
      // Ideally, use a secure download endpoint instead of direct file access
      const response = await axiosClient.get(`/api/files/download/${filename}`, {
        responseType: "blob",
      });

      // Create blob download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      // Fallback to onDownloadFile callback
      if (onDownloadFile) {
        onDownloadFile(filename);
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 animate-pulse mb-4">
          <Database className="w-8 h-8 text-blue-600" />
        </div>
        <p className="text-gray-600 font-medium">Loading datasets...</p>
        <p className="text-sm text-gray-500 mt-1">
          Organizing files by dataset and version
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900">Failed to load datasets</h3>
            <p className="text-sm text-red-700 mt-1">
              {error?.response?.data?.detail || error.message || "Unknown error"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!datasets || datasets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-200 mb-4">
          <Database className="w-8 h-8 text-gray-600" />
        </div>
        <h3 className="font-semibold text-gray-900 mb-1">No datasets yet</h3>
        <p className="text-gray-600 text-sm">
          Upload files to organize them into datasets with version history.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mb-6">
        <h2
          className="flex items-center gap-2"
          style={{ fontSize: "18px", fontWeight: 800, color: "var(--text)", lineHeight: 1.15 }}
        >
          <Database className="w-7 h-7 text-blue-600" />
          Dataset Versioning
        </h2>
        <p style={{ color: "var(--text2)", fontSize: "12px", marginTop: "6px" }}>
          {datasets.length} {datasets.length === 1 ? "dataset" : "datasets"} with version
          history
        </p>
      </div>

      {/* Dataset cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        {datasets.map((dataset) => (
          <DatasetCard
            key={dataset.dataset_name}
            dataset={dataset}
            onSelectVersion={handleSelectVersion}
            onDownloadVersion={handleDownloadVersion}
          />
        ))}
      </motion.div>

      {/* Selected version info (debug/status) */}
      {selectedVersion && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
        >
          <strong>Selected:</strong> {selectedVersion.human_readable_name} (v
          {selectedVersion.version}) - {selectedVersion.filename}
        </motion.div>
      )}
    </div>
  );
}
