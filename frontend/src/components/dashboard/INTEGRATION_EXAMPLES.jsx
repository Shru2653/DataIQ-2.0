/**
 * INTEGRATION EXAMPLES
 * How to use the Dataset Versioning System in your application
 */

// ===========================
// Example 1: Simple Integration in Home.jsx
// ===========================

import React, { useState } from "react";
import DatasetVersionList from "../components/dashboard/DatasetVersionList";
import { useAppStore } from "../stores/useAppStore";

export default function HomeWithDatasetVersioning() {
  const [selectedFile, setSelectedFile] = useState(null);
  const setAppFile = useAppStore((s) => s.setSelectedFile);

  const handleSelectVersion = (versionInfo) => {
    console.log("Version selected:", versionInfo);
    
    // Update app state with selected file
    setSelectedFile(versionInfo);
    setAppFile({
      filename: versionInfo.filename,
      dataset_name: versionInfo.dataset_name,
      version: versionInfo.version,
      operation: versionInfo.operation,
    });
  };

  const handleDownloadVersion = (filename) => {
    console.log("Downloading:", filename);
    // Implement download logic
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Main content */}
        <DatasetVersionList
          onSelectFile={handleSelectVersion}
          onDownloadFile={handleDownloadVersion}
        />

        {/* Display selected version info */}
        {selectedFile && (
          <div className="mt-8 p-6 rounded-lg border border-blue-200 bg-blue-50">
            <h3 className="font-semibold text-blue-900">Selected Version</h3>
            <p className="text-sm text-blue-800 mt-2">
              Dataset: <strong>{selectedFile.dataset_name}</strong> | 
              Version: <strong>v{selectedFile.version}</strong> | 
              Operation: <strong>{selectedFile.operation}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================
// Example 2: Using the Hook Directly
// ===========================

import useDatasetVersioning from "../hooks/useDatasetVersioning";

export function DashboardWithHook() {
  const {
    datasets,
    isLoading,
    error,
    downloadVersion,
    getLatestVersion,
  } = useDatasetVersioning();

  const handleLatestClick = async (datasetName) => {
    try {
      const latestVersion = await getLatestVersion(datasetName);
      console.log("Latest version:", latestVersion);
      // Use the latest version
    } catch (err) {
      console.error("Failed to get latest version:", err);
    }
  };

  if (isLoading) return <div>Loading datasets...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>Datasets ({datasets.length})</h1>
      {datasets.map((dataset) => (
        <div key={dataset.dataset_name} className="p-4 border rounded-lg mb-4">
          <h2>{dataset.dataset_name}</h2>
          <p>{dataset.version_count} versions available</p>
          <button onClick={() => handleLatestClick(dataset.dataset_name)}>
            Get Latest
          </button>
        </div>
      ))}
    </div>
  );
}

// ===========================
// Example 3: Processing Pipeline with Versions
// ===========================

import { useAppStore } from "../stores/useAppStore";

export function DataProcessingPipeline() {
  const selectedFile = useAppStore((s) => s.selectedFile);
  const { getDataset } = useDatasetVersioning();
  const [pipelineHistory, setPipelineHistory] = useState([]);

  const handleApplyTransformation = async (operation) => {
    if (!selectedFile?.dataset_name) return;

    try {
      // Get current dataset with all versions
      const dataset = await getDataset(selectedFile.dataset_name);
      
      // Add to pipeline
      const newStep = {
        operation,
        from_version: selectedFile.version,
        to_version: selectedFile.version + 1,
      };
      
      setPipelineHistory([...pipelineHistory, newStep]);
      console.log("Pipeline updated:", newStep);
    } catch (err) {
      console.error("Pipeline error:", err);
    }
  };

  return (
    <div>
      <h2>Processing Pipeline</h2>
      <div className="space-y-2">
        {pipelineHistory.map((step, idx) => (
          <div key={idx} className="p-4 bg-blue-50 rounded">
            {step.operation} (v{step.from_version} → v{step.to_version})
          </div>
        ))}
      </div>

      <div className="mt-6 space-x-2">
        <button onClick={() => handleApplyTransformation("outliers_removed")}>
          Remove Outliers
        </button>
        <button onClick={() => handleApplyTransformation("normalized")}>
          Normalize
        </button>
        <button onClick={() => handleApplyTransformation("encoded")}>
          Encode
        </button>
      </div>
    </div>
  );
}

// ===========================
// Example 4: Advanced - Custom Version Selector
// ===========================

import { useState } from "react";
import axiosClient from "../api/axiosClient";

export function AdvancedVersionSelector({ onVersionSelected }) {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);

  const loadDatasets = async () => {
    try {
      const response = await axiosClient.get("/api/datasets/grouped");
      setDatasets(response.data.datasets);
    } catch (err) {
      console.error("Failed to load datasets:", err);
    }
  };

  const currentDataset = datasets.find((d) => d.dataset_name === selectedDataset);

  return (
    <div className="space-y-4">
      <button onClick={loadDatasets} className="px-4 py-2 bg-blue-600 text-white rounded">
        Load Datasets
      </button>

      {/* Dataset selector */}
      <select
        value={selectedDataset || ""}
        onChange={(e) => {
          setSelectedDataset(e.target.value);
          setSelectedVersion(null);
        }}
        className="w-full border rounded px-3 py-2"
      >
        <option value="">Select Dataset...</option>
        {datasets.map((d) => (
          <option key={d.dataset_name} value={d.dataset_name}>
            {d.dataset_name} ({d.version_count} versions)
          </option>
        ))}
      </select>

      {/* Version selector */}
      {currentDataset && (
        <select
          value={selectedVersion || ""}
          onChange={(e) => {
            const version = currentDataset.versions.find(
              (v) => v.version === parseInt(e.target.value)
            );
            setSelectedVersion(version);
            onVersionSelected?.(version);
          }}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Select Version...</option>
          {currentDataset.versions.map((v) => (
            <option key={v.version} value={v.version}>
              v{v.version}: {v.human_readable_name}
            </option>
          ))}
        </select>
      )}

      {/* Show selected version details */}
      {selectedVersion && (
        <div className="p-4 bg-gray-100 rounded">
          <p>
            <strong>Selected:</strong> {selectedVersion.human_readable_name}
          </p>
          <p className="text-sm text-gray-600">
            File: {selectedVersion.filename}
          </p>
          <p className="text-sm text-gray-600">
            Size: {(selectedVersion.file_size / 1024).toFixed(1)} KB
          </p>
        </div>
      )}
    </div>
  );
}

// ===========================
// Example 5: API Usage - Backend
// ===========================

// Python backend example
/*
from app.utils.dataset_utils import extract_dataset_info, group_files_by_dataset

# When processing a file upload
filename = "outlier_handled_sales_data_20260406_143000.csv"

dataset_name, operation, timestamp = extract_dataset_info(filename)
print(f"Dataset: {dataset_name}, Operation: {operation}, Time: {timestamp}")
# Output: Dataset: sales_data, Operation: outliers_removed, Time: 20260406_143000

# Get all grouped datasets
files = get_all_files()
grouped = group_files_by_dataset(files)

for dataset_name, versions in grouped.items():
    print(f"{dataset_name}: {len(versions)} versions")
    for version in versions:
        print(f"  v{version.version}: {version.human_readable_name}")
*/

export default {
  HomeWithDatasetVersioning,
  DashboardWithHook,
  DataProcessingPipeline,
  AdvancedVersionSelector,
};
