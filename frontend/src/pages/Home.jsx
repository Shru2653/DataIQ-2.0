import React, { useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { motion, AnimatePresence } from "framer-motion";
import {
  fadeIn,
  fadeInUp,
  slideUp,
  staggerContainer,
  item,
  modalBackdrop,
  modalContent,
} from "../utils/animations";

import Navbar from "../components/layout/Navbar";
import FileUploader from "../components/files/FileUploader";
import FileList from "../components/files/FileList";
import CleanedFiles from "../components/files/CleanedFiles";
import ProcessingPanel from "../components/processing/ProcessingPanel";
import PreviewModal from "../components/processing/PreviewModal";
import Dashboard from "../components/dashboard/Dashboard";
import ChartPlot from "../components/dashboard/ChartPlot";
import useDatasets from "../hooks/useDatasets";
import InsightPanel from "../components/dashboard/InsightPanel";
import DataQualityPanel from "../components/dashboard/DataQualityPanel.jsx";
import CleaningRecommendationsPanel from "../components/dashboard/CleaningRecommendationsPanel.jsx";
import DriftDetectionPanel from "../components/dashboard/DriftDetectionPanel.jsx";

import { useAppStore } from "../stores/useAppStore";
import { useFiles } from "../hooks/useFiles";
import useNormalize from "../hooks/useNormalize";
import useOutliers from "../hooks/useOutliers";
import useFeatureEngineering from "../hooks/useFeatureEngineering";
import useMissingValues from "../hooks/useMissingValues";
import useDuplicates from "../hooks/useDuplicates";
import useDax from "../hooks/useDAX";
import {
  BarChart2,
  CheckSquare,
  CheckSquare2,
  Filter,
  Layers,
  Search,
  Target,
  TrendingUp,
  Type,
  Zap,
  AlertCircle,
  TrendingDown,
  Minus,
} from "lucide-react";
import axiosClient from "../api/axiosClient";

// Utility function to format numbers nicely
const formatNumber = (num, type = "number") => {
  if (num === null || num === undefined || isNaN(num)) return "N/A";

  const absNum = Math.abs(num);

  if (type === "currency") {
    if (absNum >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (absNum >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (absNum >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  }

  if (type === "percentage") {
    return `${num.toFixed(1)}%`;
  }

  if (absNum >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (absNum >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (absNum >= 1e3) return `${(num / 1e3).toFixed(1)}K`;

  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export default function Home() {
  // Zustand state
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const serverFiles = useAppStore((s) => s.serverFiles);
  const setServerFiles = useAppStore((s) => s.setServerFiles);
  const selectedFile = useAppStore((s) => s.selectedFile);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const clearSelectedFile = useAppStore((s) => s.clearSelectedFile);
  const updateProcessingStep = useAppStore((s) => s.updateProcessingStep);
  const resetProcessing = useAppStore((s) => s.resetProcessing);

  // Files hook (React Query)
  const { filesQuery, upload } = useFiles();
  const datasetsQuery = useDatasets();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileTab, setFileTab] = useState("uploaded"); // 'uploaded' | 'cleaned'
  const [selectedOriginal, setSelectedOriginal] = useState("");
  console.log(datasetsQuery.data);
  // Mutations (React Query)
  const normalize = useNormalize();
  const outliers = useOutliers();
  const features = useFeatureEngineering();
  const missing = useMissingValues();
  const duplicates = useDuplicates();
  const dax = useDax();

  // Local UI states
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [latestDashboard, setLatestDashboard] = useState(null);
  const dashboardRef = useRef(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    clearSelectedFile();
    resetProcessing();
  }, [clearSelectedFile, resetProcessing]);

  // Sync uploaded files from datasets into store (source of truth)
  useEffect(() => {
    const ds = datasetsQuery?.data?.datasets;
    if (!Array.isArray(ds)) return;
    const uploaded = ds.map((d) => ({
      filename: d.filename,
      name: d.filename,
      size: d.size,
      uploaded_at: d.uploaded_at,
    }));
    setServerFiles(uploaded);
  }, [datasetsQuery.data, setServerFiles]);

  // Fallback: if datasets are empty but /files has items, use them so UI shows uploads
  useEffect(() => {
    const ds = datasetsQuery?.data?.datasets;
    const fs = filesQuery?.data?.files;
    if ((Array.isArray(ds) && ds.length > 0) || !Array.isArray(fs)) return;
    if (Array.isArray(fs)) {
      const uploaded = fs.map((f) => ({
        filename: f.filename,
        name: f.filename,
        size: f.size,
        uploaded_at: f.mtime,
      }));
      setServerFiles(uploaded);
    }
  }, [datasetsQuery.data, filesQuery.data, setServerFiles]);

  // Normalize server files to an array for safe rendering
  const serverFilesList = useMemo(() => {
    if (Array.isArray(serverFiles)) return serverFiles;
    if (Array.isArray(serverFiles?.files)) return serverFiles.files;
    return [];
  }, [serverFiles]);

  // Derived IDs for selection (used below)
  const selectedId =
    selectedFile?.id ??
    selectedFile?._id ??
    selectedFile?.name ??
    selectedFile?.filename;

  useEffect(() => {
    if (!selectedId) {
      resetProcessing();
    }
  }, [selectedId, resetProcessing]);

  // Cleaned files sourced from datasets collection
  const allDatasets = useMemo(
    () =>
      Array.isArray(datasetsQuery?.data?.datasets)
        ? datasetsQuery.data.datasets
        : [],
    [datasetsQuery.data],
  );
  const allCleaned = useMemo(() => {
    return allDatasets.flatMap((d) =>
      (d.cleaned_versions || []).map((cv) => ({ ...cv, original: d.filename })),
    );
  }, [allDatasets]);
  const originalsDropdown = useMemo(() => {
    const names = allDatasets.map((d) => d.filename).filter(Boolean);
    const set = new Set(names);
    if (selectedOriginal) set.add(selectedOriginal);
    return Array.from(set).sort();
  }, [allDatasets, selectedOriginal]);
  // Default original filter to currently selected upload when switching to Cleaned tab
  useEffect(() => {
    if (fileTab === "cleaned" && !selectedOriginal && selectedId) {
      const selName =
        serverFilesList.find((f) => (f.filename || f.name) === selectedId)
          ?.filename || selectedId;
      // Only set if the selectedId corresponds to an uploaded/original dataset filename
      const isDatasetFile = originalsDropdown.includes(selName);
      if (selName && isDatasetFile) setSelectedOriginal(selName);
    }
  }, [
    fileTab,
    selectedOriginal,
    selectedId,
    serverFilesList,
    originalsDropdown,
  ]);

  const cleanedFilesList = useMemo(() => {
    if (!selectedOriginal) return allCleaned;
    return allCleaned.filter((f) => f.original === selectedOriginal);
  }, [allCleaned, selectedOriginal]);
  // Fallback query: read cleaned files from API if datasets has none
  const cleanedFilesQuery = useQuery({
    queryKey: ["cleaned-files", selectedOriginal || "all"],
    queryFn: async () => {
      const qs = selectedOriginal
        ? `?original=${encodeURIComponent(selectedOriginal)}`
        : "";
      const res = await axiosClient.get(`/cleaned-files${qs}`);
      return res.data;
    },
    enabled: fileTab === "cleaned",
    staleTime: 5_000,
  });

  const apiCleaned = useMemo(
    () =>
      Array.isArray(cleanedFilesQuery?.data?.files)
        ? cleanedFilesQuery.data.files
        : [],
    [cleanedFilesQuery.data],
  );
  const displayCleaned = useMemo(() => {
    const primary = cleanedFilesList.length ? cleanedFilesList : allCleaned;
    if (primary.length > 0) return primary;
    return apiCleaned;
  }, [cleanedFilesList, allCleaned, apiCleaned]);
  const isCleanedEmpty = useMemo(
    () => (Array.isArray(displayCleaned) ? displayCleaned.length === 0 : true),
    [displayCleaned],
  );

  const cleanedCounts = useMemo(() => {
    const map = new Map();
    allDatasets.forEach((d) => {
      map.set(d.filename, (d.cleaned_versions || []).length);
    });
    return map;
  }, [allDatasets]);
  // Uploader handler (progress supported)
  const handleUpload = (fileOrFiles) => {
    const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles;
    if (!file) return;
    setUploadProgress(0);
    upload.mutate(
      { file, onProgress: (pct) => setUploadProgress(pct) },
      {
        onSuccess: () => setUploadProgress(0),
        onError: () => setUploadProgress(0),
      },
    );
  };

  // Preview open/close
  const openPreview = (payload) => {
    setPreviewData(payload);
    setShowPreview(true);
  };
  const closePreview = () => setShowPreview(false);

  const downloadDashboardPDF = async () => {
    try {
      setPdfLoading(true);
      const node = dashboardRef.current;
      if (!node) return;
      // Render at high scale for clarity
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const pdf = new jsPDF("p", "pt", "a4"); // portrait for more vertical space
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth; // full-width
      const imgHeight = canvas.height * (imgWidth / canvas.width);

      // If single page fits, just add directly
      if (imgHeight <= pageHeight) {
        const imgData = canvas.toDataURL("image/png");
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
        pdf.save("auto_dashboard.pdf");
        return;
      }

      // Multi-page: slice the big canvas into page-sized chunks
      const pxPageHeight = Math.floor((pageHeight / pageWidth) * canvas.width); // height in source px for one PDF page
      const totalPages = Math.ceil(canvas.height / pxPageHeight);

      const pageCanvas = document.createElement("canvas");
      const pageCtx = pageCanvas.getContext("2d");
      pageCanvas.width = canvas.width;
      pageCanvas.height = pxPageHeight;

      for (let page = 0; page < totalPages; page++) {
        const sX = 0;
        const sY = page * pxPageHeight;
        const sW = canvas.width;
        const sH = Math.min(pxPageHeight, canvas.height - sY);

        // Resize page canvas height for last slice
        pageCanvas.height = sH;
        pageCtx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageCtx.drawImage(canvas, sX, sY, sW, sH, 0, 0, pageCanvas.width, sH);

        const imgData = pageCanvas.toDataURL("image/png");
        const renderHeight = (sH / canvas.width) * imgWidth;

        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, renderHeight);
      }

      pdf.save("auto_dashboard.pdf");
    } catch (e) {
      console.error("PDF generation failed:", e);
    } finally {
      setPdfLoading(false);
    }
  };

  const generateAutoDashboard = async () => {
    try {
      const fileToUse =
        selectedFile ||
        (serverFilesList.length > 0 ? serverFilesList[0] : null);
      if (!fileToUse) {
        alert("Please upload or select a file first.");
        return;
      }
      const fname =
        fileToUse.filename || fileToUse.name || fileToUse.id || fileToUse;
      setPreviewLoading(true);
      const dashRes = await axiosClient.post("/api/auto-dashboard/analyze", {
        filename: fname,
      });
      setLatestDashboard({ filename: fname, ...dashRes.data });
    } catch (e) {
      alert(
        "Failed to generate dashboard: " +
          (e.response?.data?.detail || e.message),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  // Download helper for files served from FastAPI /api/files/cleaned/:filename
  // Uses axiosClient so the Authorization: Bearer token is included in the request.
  // A bare <a href> click would skip the request interceptor and always 401.
  const downloadFromTemp = async (filename) => {
    if (!filename) {
      console.warn(
        "[downloadFromTemp] No filename provided – skipping download.",
      );
      return;
    }
    try {
      const response = await axiosClient.get(
        `/api/files/cleaned/${encodeURIComponent(filename)}`,
        { responseType: "blob" },
      );
      const blobUrl = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Free the object URL after the browser has started the download
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch (err) {
      console.error(
        "[downloadFromTemp] Download failed for",
        filename,
        "–",
        err?.data?.detail ?? err?.message ?? err,
      );
    }
  };

  // Dashboard dataset: prefer latest preview 'after'
  const chartRows = useMemo(() => {
    return Array.isArray(previewData?.after) ? previewData.after : [];
  }, [previewData]);

  const tableData = chartRows;

  // Derive x/y keys for Plotly from table records
  const { xKey, yKeys, chartTitle } = useMemo(() => {
    if (!Array.isArray(tableData) || tableData.length === 0) {
      return { xKey: undefined, yKeys: [], chartTitle: "Preview" };
    }
    const first = tableData[0] || {};
    const keys = Object.keys(first);
    const guessX = keys[0];
    // pick up to 3 numeric-like keys other than x
    const numericKeys = keys
      .filter((k) => k !== guessX)
      .filter((k) => {
        const sample = tableData.find(
          (r) => r[k] !== null && r[k] !== undefined,
        )?.[k];
        const n = typeof sample === "number" ? sample : parseFloat(sample);
        return !Number.isNaN(n);
      })
      .slice(0, 3);
    return {
      xKey: guessX,
      yKeys: numericKeys.length ? numericKeys : keys.slice(1, 2),
      chartTitle: "Dataset Preview",
    };
  }, [tableData]);

  // Processing steps config (wire your actual handlers)
  const steps = useMemo(
    () => [
      {
        key: "inspect",
        title: "Load and Inspect Data",
        description:
          "Upload and examine your dataset structure, columns, and initial insights",
        icon: Search,
        color: "blue",
        delay: 0.1,
        category: "cleaning",
        options: {
          actions: [
            "Preview Data",
            "Column Info",
            "Data Summary",
            "Memory Usage",
          ],
          filters: [
            "Show All Columns",
            "Numeric Only",
            "Text Only",
            "Date Columns",
          ],
          settings: { preview_rows: 100, include_dtypes: true },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("inspect", { status: "running" });
          try {
            const res = await axiosClient.post("/api/datatypes/preview", {
              filename: selectedId,
            });
            updateProcessingStep("inspect", {
              status: "done",
              output: res.data,
            });
            openPreview({
              before: res.data?.preview_data,
              after: res.data?.preview_data,
            });
          } catch (e) {
            updateProcessingStep("inspect", {
              status: "error",
              error: e?.message,
            });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const res = await axiosClient.post("/api/datatypes/preview", {
            filename: selectedId,
          });
          openPreview({
            before: res.data?.preview_data,
            after: res.data?.preview_data,
          });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.types?.output?.new_file ||
            useAppStore.getState().processingSteps?.inspect?.output?.new_file;
          downloadFromTemp(file);
        },
      },
      {
        key: "missing",
        title: "Handle Missing Values",
        description:
          "Detect, analyze, and resolve missing data points with intelligent strategies.",
        icon: Target,
        color: "indigo",
        delay: 0.2,
        category: "cleaning",
        options: {
          actions: [
            "Drop Rows",
            "Fill Forward",
            "Fill Backward",
            "Mean/Median Fill",
            "Custom Value",
          ],
          filters: [
            "All Columns",
            "Numeric Only",
            "Text Only",
            "High Missing %",
            "Low Missing %",
          ],
          settings: { threshold: 0.5, method: "mean", custom_value: "" },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("missing", { status: "running" });
          try {
            const actionMap = {
              "Drop Rows": "drop",
              "Fill Forward": "forward",
              "Fill Backward": "backward",
              "Mean/Median Fill": "mean",
              "Custom Value": "custom",
            };
            const filterMap = (arr) => {
              if (arr?.includes("Numeric Only")) return "numeric";
              if (arr?.includes("Text Only")) return "text";
              return "all";
            };
            const payload = {
              filename: selectedId,
              action: actionMap[action] || "mean",
              filter: filterMap(filters),
              threshold: settings?.threshold ?? 0.5,
              custom_value: settings?.custom_value ?? null,
            };
            const res = await missing.execute(payload);
            updateProcessingStep("missing", { status: "done", output: res });
            const cleanedFilename =
              res?.new_file || res?.data?.new_file || selectedId;
            const prev = await axiosClient.post("/api/datatypes/preview", {
              filename: cleanedFilename,
            });
            const rows = Array.isArray(prev.data?.preview_data)
              ? prev.data.preview_data
              : [];
            openPreview({ before: [], after: rows });
            // Refresh datasets to reflect new cleaned version under the original
            datasetsQuery.refetch?.();
          } catch (e) {
            updateProcessingStep("missing", {
              status: "error",
              error: e?.message,
            });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const res = await axiosClient.post("/api/datatypes/preview", {
            filename: selectedId,
          });
          const rows = Array.isArray(res.data?.preview_data)
            ? res.data.preview_data
            : [];
          openPreview({ before: [], after: rows });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.missing?.output?.new_file;
          downloadFromTemp(file);
        },
      },
      {
        key: "duplicates",
        title: "Remove Duplicates",
        description:
          "Identify and eliminate duplicate records to ensure data quality.",
        icon: Filter,
        color: "purple",
        delay: 0.3,
        category: "cleaning",
        options: {
          actions: [
            "Find Duplicates",
            "Remove All",
            "Keep First",
            "Keep Last",
            "Mark Duplicates",
          ],
          filters: ["Exclude ID (Default)", "Key Columns Only", "All Columns"],
          settings: { subset: [], keep: "first", mark_only: false },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("duplicates", { status: "running" });
          try {
            const actionMap = {
              "Find Duplicates": "find_duplicates",
              "Remove All": "remove_all",
              "Keep First": "keep_first",
              "Keep Last": "keep_last",
              "Mark Duplicates": "mark_duplicates",
            };
            const res = await duplicates.execute({
              filename: selectedId,
              action: actionMap[action] || "remove_all",
              subset: Array.isArray(settings?.subset) ? settings.subset : [],
            });
            updateProcessingStep("duplicates", { status: "done", output: res });
            const cleanedFilename =
              res?.new_file || res?.data?.new_file || selectedId;
            const prev = await axiosClient.post("/api/datatypes/preview", {
              filename: cleanedFilename,
            });
            const rows = Array.isArray(prev.data?.preview_data)
              ? prev.data.preview_data
              : [];
            openPreview({ before: [], after: rows });
            datasetsQuery.refetch?.();
          } catch (e) {
            updateProcessingStep("duplicates", {
              status: "error",
              error: e?.message,
            });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const res = await axiosClient.post("/api/duplicates/preview", {
            filename: selectedId,
            subset: Array.isArray(settings?.subset) ? settings.subset : null,
            preview_limit: 100,
          });
          const raw = Array.isArray(res.data?.preview) ? res.data.preview : [];
          const flattened = raw.map((r) => ({
            row_index: r?.row_index,
            ...(r?.data || {}),
          }));
          openPreview({ before: [], after: flattened });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.duplicates?.output
              ?.new_file;
          downloadFromTemp(file);
        },
      },
      {
        key: "types",
        title: "Correct Data Types",
        description:
          "Optimize column data types for better performance and accuracy",
        icon: Type,
        color: "blue",
        delay: 0.4,
        category: "cleaning",
        options: {
          actions: [
            "Auto Detect",
            "Convert to Numeric",
            "Convert to Date",
            "Convert to Category",
            "Custom Type",
          ],
          filters: [
            "All Columns",
            "Object Type",
            "Numeric Type",
            "DateTime Type",
            "Mixed Types",
          ],
          settings: {
            auto_convert: true,
            date_format: "infer",
            errors: "coerce",
          },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("types", { status: "running" });
          try {
            const actionMap = {
              "Auto Detect": "auto_detect",
              "Convert to Numeric": "convert_to_numeric",
              "Convert to Date": "convert_to_datetime",
              "Convert to Category": "convert_to_category",
              "Custom Type": "custom_mapping",
            };
            const res = await axiosClient.post("/api/datatypes/convert", {
              filename: selectedId,
              action: actionMap[action] || "auto_detect",
              settings,
            });
            updateProcessingStep("types", { status: "done", output: res.data });
            openPreview({ before: [], after: res.data?.preview_data });
          } catch (e) {
            updateProcessingStep("types", {
              status: "error",
              error: e?.message,
            });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const res = await axiosClient.post("/api/datatypes/preview", {
            filename: selectedId,
          });
          openPreview({ before: [], after: res.data?.preview_data });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.types?.output?.new_file;
          downloadFromTemp(file);
        },
      },
      {
        key: "normalize",
        title: "Normalize / Scale Data",
        description:
          "Apply scaling techniques to prepare data for machine learning.",
        icon: BarChart2,
        color: "indigo",
        delay: 0.5,
        category: "preparation",
        options: {
          actions: [
            "Standard Scale",
            "Min-Max Scale",
            "Robust Scale",
            "Unit Vector",
            "Quantile Transform",
          ],
          filters: [
            "Numeric Columns",
            "High Range",
            "Skewed Distribution",
            "Selected Features",
          ],
          settings: {
            method: "standard",
            feature_range: [0, 1],
            with_mean: true,
          },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("normalize", { status: "running" });
          try {
            const methodMap = {
              "Standard Scale": "standard",
              "Min-Max Scale": "minmax",
              "Robust Scale": "robust",
              "Unit Vector": "unit_vector",
              "Quantile Transform": "quantile",
            };
            const req = {
              filename: selectedId,
              settings: {
                method: methodMap[action] || settings?.method || "standard",
                feature_range: settings?.feature_range ?? [0, 1],
                with_mean: settings?.with_mean ?? true,
                preview_limit: 100,
              },
              filters: filters?.length ? filters : ["Numeric Columns"],
            };
            const res = await normalize.execute(req);
            updateProcessingStep("normalize", { status: "done", output: res });
            openPreview({ before: [], after: res?.preview_data });
          } catch (e) {
            updateProcessingStep("normalize", {
              status: "error",
              error: e?.message,
            });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const methodMap = {
            "Standard Scale": "standard",
            "Min-Max Scale": "minmax",
            "Robust Scale": "robust",
            "Unit Vector": "unit_vector",
            "Quantile Transform": "quantile",
          };
          const res = await axiosClient.post("/api/normalize/preview", {
            filename: selectedId,
            settings: {
              method: methodMap[action] || settings?.method || "standard",
              feature_range: settings?.feature_range ?? [0, 1],
              with_mean: settings?.with_mean ?? true,
              preview_limit: 100,
            },
            filters: filters?.length ? filters : ["Numeric Columns"],
          });
          openPreview({ before: [], after: res.data?.preview_data });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.normalize?.output?.new_file;
          downloadFromTemp(file);
        },
      },
      {
        key: "outliers",
        title: "Handle Outliers",
        description:
          "Detect and manage statistical outliers that could affect your analysis.",
        icon: TrendingUp,
        color: "purple",
        delay: 0.6,
        category: "preparation",
        options: {
          actions: [
            "IQR Method",
            "Z-Score",
            "Modified Z-Score",
            "Isolation Forest",
            "Remove Outliers",
          ],
          filters: [
            "Numeric Columns",
            "High Variance",
            "Distribution Based",
            "Custom Threshold",
          ],
          settings: { method: "iqr", threshold: 3, action: "flag" },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("outliers", { status: "running" });
          try {
            const methodMap = {
              "IQR Method": "iqr",
              "Z-Score": "zscore",
              "Modified Z-Score": "modified_zscore",
              "Isolation Forest": "isolation_forest",
            };
            const act =
              action === "Remove Outliers"
                ? "remove"
                : settings?.action || "flag";
            const res = await outliers.execute({
              filename: selectedId,
              method: methodMap[action] || settings?.method || "iqr",
              settings: {
                threshold: settings?.threshold ?? 3,
                action: act,
                preview_limit: 100,
              },
              filters: filters?.length ? filters : ["Numeric Columns"],
            });
            updateProcessingStep("outliers", { status: "done", output: res });
            openPreview({ before: [], after: res?.preview_data });
            datasetsQuery.refetch?.();
          } catch (e) {
            updateProcessingStep("outliers", {
              status: "error",
              error: e?.message,
            });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const methodMap = {
            "IQR Method": "iqr",
            "Z-Score": "zscore",
            "Modified Z-Score": "modified_zscore",
            "Isolation Forest": "isolation_forest",
          };
          const act =
            action === "Remove Outliers"
              ? "remove"
              : settings?.action || "flag";
          const res = await axiosClient.post("/api/outliers/preview", {
            filename: selectedId,
            method: methodMap[action] || settings?.method || "iqr",
            settings: {
              threshold: settings?.threshold ?? 3,
              action: act,
              preview_limit: 100,
            },
            filters: filters?.length ? filters : ["Numeric Columns"],
          });
          openPreview({ before: [], after: res.data?.preview_data });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.outliers?.output?.new_file;
          downloadFromTemp(file);
        },
      },
      {
        key: "features",
        title: "Feature Engineering",
        description:
          "Create new features and transform existing ones for better insights.",
        icon: Layers,
        color: "blue",
        delay: 1,
        category: "preparation",
        options: {
          actions: [
            "Polynomial Features",
            "Interaction Terms",
            "Binning",
            "Date Features",
            "Text Features",
          ],
          filters: [
            "Numeric Features",
            "Date Columns",
            "Text Columns",
            "Selected Columns",
          ],
          settings: { degree: 2, include_bias: false, interaction_only: false },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("features", { status: "running" });
          try {
            const actionMap = {
              "Polynomial Features": "polynomial",
              "Interaction Terms": "interaction",
              Binning: "binning",
              "Date Features": "date",
              "Text Features": "text",
            };
            const feSettings = {
              action: actionMap[action] || settings?.action || "polynomial",
              degree: settings?.degree ?? 2,
              include_bias: !!settings?.include_bias,
              interaction_only: !!settings?.interaction_only,
              binning_strategy: settings?.binning_strategy || "equal_width",
              bins: settings?.bins ?? 5,
              date_parts: settings?.date_parts || [
                "year",
                "month",
                "day",
                "weekday",
              ],
              text_options: settings?.text_options || {
                use_tfidf: false,
                max_features: 100,
              },
              selected_columns: settings?.selected_columns || null,
              preview_limit: 100,
            };
            const res = await features.execute({
              filename: selectedId,
              filters: filters?.length ? filters : ["Numeric Features"],
              settings: feSettings,
            });
            updateProcessingStep("features", { status: "done", output: res });
            openPreview({ before: [], after: res?.preview_data });
          } catch (e) {
            updateProcessingStep("features", {
              status: "error",
              error: e?.message,
            });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const actionMap = {
            "Polynomial Features": "polynomial",
            "Interaction Terms": "interaction",
            Binning: "binning",
            "Date Features": "date",
            "Text Features": "text",
          };
          const feSettings = {
            action: actionMap[action] || settings?.action || "polynomial",
            degree: settings?.degree ?? 2,
            include_bias: !!settings?.include_bias,
            interaction_only: !!settings?.interaction_only,
            binning_strategy: settings?.binning_strategy || "equal_width",
            bins: settings?.bins ?? 5,
            date_parts: settings?.date_parts || [
              "year",
              "month",
              "day",
              "weekday",
            ],
            text_options: settings?.text_options || {
              use_tfidf: false,
              max_features: 100,
            },
            selected_columns: settings?.selected_columns || null,
            preview_limit: 100,
          };
          const res = await axiosClient.post("/api/features/preview", {
            filename: selectedId,
            filters: filters?.length ? filters : ["Numeric Features"],
            settings: feSettings,
          });
          openPreview({ before: [], after: res.data?.preview_data });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.features?.output?.new_file;
          downloadFromTemp(file);
        },
      },
      {
        key: "dax",
        title: "DAX Computations",
        description: "Apply DAX-like computations.",
        icon: Zap,
        color: "indigo",
        delay: 0.6,
        category: "analysis",
        options: {
          actions: ["Generate DAX Queries"],
          filters: ["All Columns"],
          settings: { min_queries: 10, max_queries: 30, preview_limit: 10 },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("dax", { status: "running" });
          try {
            const res = await dax.execute({
              filename: selectedId,
              settings: {
                min_queries: settings?.min_queries ?? 10,
                max_queries: settings?.max_queries ?? 30,
                preview_limit: 100,
              },
            });
            updateProcessingStep("dax", { status: "done", output: res });
            openPreview({ before: [], after: res?.queries });
          } catch (e) {
            updateProcessingStep("dax", { status: "error", error: e?.message });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const res = await axiosClient.post("/api/dax/generate", {
            filename: selectedId,
            settings: {
              min_queries: settings?.min_queries ?? 10,
              max_queries: settings?.max_queries ?? 30,
              preview_limit: 100,
            },
          });
          openPreview({ before: [], after: res.data?.queries });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.dax?.output?.new_file;
          downloadFromTemp(file);
        },
      },
      {
        key: "dax_measures",
        title: "DAX Measures Generator",
        description:
          "Auto-generate 20-100 meaningful DAX measures with PDF export",
        icon: CheckSquare2,
        color: "purple",
        delay: 1.1,
        category: "analysis",
        options: {
          actions: ["Generate Measures"],
          filters: ["All Columns"],
          settings: { min_measures: 20, max_measures: 60, preview_limit: 20 },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          updateProcessingStep("dax_measures", { status: "running" });
          try {
            const res = await axiosClient.post("/api/dax/measures", {
              filename: selectedId,
              settings: {
                min_measures: settings?.min_measures ?? 20,
                max_measures: settings?.max_measures ?? 60,
                preview_limit: 100,
              },
            });
            updateProcessingStep("dax_measures", {
              status: "done",
              output: res.data,
            });
            openPreview({ before: [], after: res.data?.measures });
          } catch (e) {
            updateProcessingStep("dax_measures", {
              status: "error",
              error: e?.message,
            });
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return;
          const res = await axiosClient.post("/api/dax/measures", {
            filename: selectedId,
            settings: {
              min_measures: settings?.min_measures ?? 10,
              max_measures: settings?.max_measures ?? 20,
              preview_limit: 100,
            },
          });
          openPreview({ before: [], after: res.data?.measures });
        },
        onDownload: async () => {
          const file =
            useAppStore.getState().processingSteps?.dax_measures?.output
              ?.new_file;
          downloadFromTemp(file);
        },
      },
    ],
    [
      selectedId,
      missing.execute,
      duplicates.execute,
      normalize.execute,
      outliers.execute,
      features.execute,
      dax.execute,
      updateProcessingStep,
    ],
  );

  // Layout structure
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <main className="pt-24 pb-12">
        <div className="w-full px-12 py-10">
          <div className="w-full space-y-16">
            {/* Upload Section */}
            <motion.section
              initial={fadeInUp.initial}
              animate={fadeInUp.animate}
              transition={fadeInUp.transition}
              className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10"
            >
              <div className="flex flex-col space-y-1 mb-4">
                <h2 className="text-xl font-semibold text-slate-800">
                  Upload Section
                </h2>
                <p className="text-sm text-gray-600">
                  Upload datasets to begin analysis and processing.
                </p>
              </div>
              <div className="space-y-6">
                <FileUploader
                  onSelect={handleUpload}
                  uploading={upload.isPending}
                  progress={uploadProgress}
                  accept=".csv,.xlsx,.xls,.json,.parquet"
                />
                {filesQuery.isLoading && (
                  <div className="text-sm text-slate-500">Loading files…</div>
                )}
              </div>
            </motion.section>

            {/* Server Files Section */}
            <section className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10">
              <div className="flex flex-col space-y-1 mb-4">
                <h2 className="text-xl font-semibold text-slate-800">
                  Server Files
                </h2>
                <p className="text-sm text-gray-600">
                  Select uploaded or cleaned files from the server.
                </p>
              </div>
              <div className="space-y-6">
                {/* Tabs */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFileTab("uploaded")}
                    className={`px-3 py-1.5 rounded-md text-sm ${fileTab === "uploaded" ? "bg-blue-600 text-white" : "bg-white text-slate-700 border"}`}
                  >
                    Uploaded Files
                  </button>
                  <button
                    onClick={() => setFileTab("cleaned")}
                    className={`px-3 py-1.5 rounded-md text-sm ${fileTab === "cleaned" ? "bg-blue-600 text-white" : "bg-white text-slate-700 border"}`}
                  >
                    Cleaned Files
                  </button>
                </div>

                {fileTab === "uploaded" && (
                  <FileList
                    files={serverFilesList}
                    selectedId={selectedId}
                    onSelect={(f) => setSelectedFile(f)}
                    onDelete={undefined}
                    cleanedCounts={cleanedCounts}
                    onViewCleaned={(file) => {
                      setSelectedFile(file); // Select the file
                      const name = file?.filename || file?.name;
                      if (name) setSelectedOriginal(name); // Focus cleaned list on this original
                      setFileTab("cleaned"); // Switch to the 'cleaned' tab
                    }}
                  />
                )}

                {fileTab === "cleaned" && (
                  <CleanedFiles
                    selectedOriginal={selectedOriginal}
                    setSelectedOriginal={setSelectedOriginal}
                    originalsDropdown={originalsDropdown}
                    isLoading={datasetsQuery.isLoading}
                    cleanedFiles={displayCleaned}
                    selectedId={selectedId}
                    onSelect={(f) => {
                      setSelectedFile({
                        filename: f.filename,
                        name: f.filename,
                      });
                      setSelectedOriginal(f.original || selectedOriginal);
                    }}
                    onDownload={(fname) => downloadFromTemp(fname)}
                    showFilterNotice={
                      Boolean(selectedOriginal) &&
                      Array.isArray(displayCleaned) &&
                      displayCleaned.length === 0
                    }
                  />
                )}
              </div>
            </section>

            {/* Data Quality Monitoring Panel */}
            <DataQualityPanel filename={selectedId} />

            {/* Cleaning Recommendations Panel */}
            <CleaningRecommendationsPanel filename={selectedId} />

            {/* Processing Panel */}
            <motion.section
              initial={fadeIn.initial}
              animate={fadeIn.animate}
              transition={fadeIn.transition}
              className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10"
            >
              <div className="flex flex-col space-y-1 mb-4">
                <h2 className="text-xl font-semibold text-slate-800">
                  Data Processing Pipeline
                </h2>
                <p className="text-sm text-gray-600">
                  Configure and execute pipeline actions on the selected
                  dataset.
                </p>
              </div>
              <motion.div
                variants={staggerContainer(0.06)}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <ProcessingPanel
                  steps={steps}
                  hasSelectedFile={Boolean(selectedId)}
                />
              </motion.div>
            </motion.section>

            {/* Data Drift & Schema Monitoring Panel */}
            <DriftDetectionPanel filename={selectedId} />

            {/* Auto Dashboard Controls */}
            <section className="w-full">
              <div className="w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 lg:p-10 flex flex-col md:flex-row md:items-center md:space-x-4 space-y-4 md:space-y-0 justify-between">
                <div className="text-xl font-semibold text-gray-800">
                  Generate Auto Dashboard
                </div>
                {/* <div className="flex-1">
                <select
                  className="w-full md:w-auto border rounded-lg px-3 py-2 text-sm"
                  value={selectedFile?.filename || selectedId || ''}
                  onChange={(e) => {
                    const f = serverFilesList.find((s) => (s.filename || s.name) === e.target.value);
                    setSelectedFile(f || null);
                  }}
                >
                  <option value="" disabled>Select a file</option>
                  {serverFilesList.map((f) => (
                    <option key={f.filename || f.name} value={f.filename || f.name}>{f.filename || f.name}</option>
                  ))}
                </select>
              </div> */}
                <button
                  onClick={generateAutoDashboard}
                  disabled={previewLoading || serverFilesList.length === 0}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-white ${previewLoading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"} transition-colors`}
                >
                  {previewLoading ? "Generating..." : "Generate Dashboard"}
                </button>
              </div>
            </section>

            {/* Enhanced Auto Dashboard */}
            {latestDashboard && (
              <section className="w-full py-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Auto Dashboard
                  </h2>
                  <button
                    onClick={downloadDashboardPDF}
                    disabled={pdfLoading}
                    className={`inline-flex items-center px-4 py-2 rounded-lg text-white ${pdfLoading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"} transition-colors`}
                  >
                    {pdfLoading ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          ></path>
                        </svg>
                        Preparing PDF…
                      </>
                    ) : (
                      "Download as PDF"
                    )}
                  </button>
                </div>
                <div ref={dashboardRef} className="space-y-10">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {(latestDashboard.kpis || []).map((kpi, idx) => {
                      const trendIcon =
                        kpi.trend === "increasing"
                          ? TrendingUp
                          : kpi.trend === "decreasing"
                            ? TrendingDown
                            : Minus;
                      const trendColor =
                        kpi.trend === "increasing"
                          ? "text-green-600"
                          : kpi.trend === "decreasing"
                            ? "text-red-600"
                            : "text-gray-400";
                      const TrendIcon = trendIcon;

                      return (
                        <div
                          key={idx}
                          className="bg-white rounded-xl shadow-sm border p-6 lg:p-8 min-h-[200px] hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              {kpi.label || kpi.key}
                            </div>
                            <TrendIcon className={`w-4 h-4 ${trendColor}`} />
                          </div>
                          <div className="text-2xl font-bold text-gray-900 mb-1">
                            {formatNumber(kpi.total, kpi.type)}
                          </div>
                          {kpi.trend !== "stable" && (
                            <div
                              className={`text-xs font-medium ${trendColor}`}
                            >
                              {kpi.trend === "increasing" ? "↑" : "↓"}{" "}
                              {Math.abs(kpi.trend_percent).toFixed(1)}%
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-2 space-y-1">
                            <div>Avg: {formatNumber(kpi.avg, kpi.type)}</div>
                            <div className="flex justify-between">
                              <span>
                                Min: {formatNumber(kpi.min, kpi.type)}
                              </span>
                              <span>
                                Max: {formatNumber(kpi.max, kpi.type)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Insights Panel */}
                  {latestDashboard.insights &&
                    latestDashboard.insights.length > 0 && (
                      <InsightPanel
                        insights={latestDashboard.insights}
                        dataQuality={latestDashboard.data_quality}
                      />
                    )}

                  {/* Charts Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {(latestDashboard.charts || []).map((ch, idx) => (
                      <div
                        key={idx}
                        className={`bg-white rounded-xl shadow-sm border p-6 lg:p-8 ${
                          ["line", "grouped_bar", "scatter"].includes(ch.type)
                            ? "lg:col-span-2"
                            : ""
                        }`}
                      >
                        <div className="text-lg font-semibold text-gray-800 mb-4">
                          {ch.title}
                        </div>
                        <div className="h-80">
                          <ChartPlot
                            type={ch.type === "grouped_bar" ? "bar" : ch.type}
                            data={ch.data}
                            xKey={ch.xKey || ch.nameKey}
                            yKeys={ch.yKeys || [ch.valueKey]}
                            title={ch.title}
                            height={320}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Statistics Section */}
                  {latestDashboard.statistics && (
                    <Dashboard
                      statistics={latestDashboard.statistics}
                      schema={latestDashboard.schema}
                      dataQuality={latestDashboard.data_quality}
                    />
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40"
            initial={modalBackdrop.initial}
            animate={modalBackdrop.animate}
            exit={modalBackdrop.exit}
            transition={modalBackdrop.transition}
            onClick={closePreview}
          >
            <motion.div
              initial={modalContent.initial}
              animate={modalContent.animate}
              exit={modalContent.exit}
              transition={modalContent.transition}
              className="mx-auto mt-16 w-[90vw] max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              <PreviewModal
                open={showPreview}
                onClose={closePreview}
                beforeData={previewData?.before}
                afterData={previewData?.after}
                title="Preview"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Loading Overlay */}
      <AnimatePresence>
        {pdfLoading && (
          <motion.div
            className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center"
            initial={modalBackdrop.initial}
            animate={modalBackdrop.animate}
            exit={modalBackdrop.exit}
            transition={modalBackdrop.transition}
          >
            <motion.div
              initial={modalContent.initial}
              animate={modalContent.animate}
              exit={modalContent.exit}
              transition={modalContent.transition}
              className="bg-white rounded-xl shadow-xl px-6 py-5 flex items-center space-x-3"
            >
              <svg
                className="animate-spin h-6 w-6 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                ></path>
              </svg>
              <div className="text-sm font-medium text-slate-800">
                Generating high-quality PDF…
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
