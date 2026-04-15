import React, { useState, useEffect, useRef } from "react";
import Navbar from "../components/layout/Navbar";
import axios from "axios";
// import { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart as RPieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, Tooltip, Legend, AreaChart, Area } from 'recharts'
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  Search,
  Upload,
  Database,
  BarChart3,
  Settings,
  Zap,
  Filter,
  Target,
  CheckCircle,
  FileText,
  TrendingUp,
  PieChart,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sliders,
  Code,
  Eye,
  Download,
  Type,
  Hash,
  BarChart2,
  Layers,
  CheckSquare,
} from "lucide-react";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  "http://127.0.0.1:8000";

function classNames(...args) {
  return args.filter(Boolean).join(" ");
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [particles, setParticles] = useState([]);
  const [expandedCard, setExpandedCard] = useState(null);
  const [processingSteps, setProcessingSteps] = useState({});
  const [serverFiles, setServerFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const inputRef = useRef(null);
  const [latestDashboard, setLatestDashboard] = useState(null);
  const dashboardRef = useRef(null);

  const chartColors = [
    "#4361ee",
    "#10b981",
    "#3b82f6",
    "#ef4444",
    "#8b5cf6",
    "#14b8a6",
    "#22c55e",
    "#6366f1",
  ];

  const downloadDashboardPDF = async () => {
    try {
      const node = dashboardRef.current;
      if (!node) return;
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("l", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 40;
      const imgHeight = canvas.height * (imgWidth / canvas.width);
      const y = (pageHeight - imgHeight) / 2;
      pdf.addImage(
        imgData,
        "PNG",
        20,
        Math.max(20, y),
        imgWidth,
        Math.min(imgHeight, pageHeight - 40),
      );
      pdf.save("auto_dashboard.pdf");
    } catch (e) {
      console.error(e);
    }
  };

  const generateAutoDashboard = async () => {
    try {
      const fileToUse =
        selectedFile || (serverFiles.length > 0 ? serverFiles[0] : null);
      if (!fileToUse) {
        alert("Please upload or select a file first.");
        return;
      }
      const fname = fileToUse.filename || fileToUse;
      setPreviewLoading(true);
      const dashRes = await axios.post(
        `${API_BASE}/api/auto-dashboard/analyze`,
        { filename: fname },
      );
      setPreviewData({
        kind: "auto_dashboard",
        filename: fname,
        dashboard: dashRes.data,
      });
      setLatestDashboard({ filename: fname, ...dashRes.data });
      setShowPreview(true);
    } catch (e) {
      console.error(e);
      alert("Failed to generate dashboard.");
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    const newParticles = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 5,
    }));
    setParticles(newParticles);
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await axios.get(`${API_BASE}/files`);
      setServerFiles(res.data.files || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDaxMeasures = async (file, action, filters, settings) => {
    try {
      const req = {
        filename: file.filename,
        settings: {
          min_measures:
            typeof settings.min_measures === "number"
              ? settings.min_measures
              : 20,
          max_measures:
            typeof settings.max_measures === "number"
              ? settings.max_measures
              : 60,
          preview_limit:
            typeof settings.preview_limit === "number"
              ? settings.preview_limit
              : 20,
        },
      };
      const resp = await axios.post(`${API_BASE}/api/dax/measures`, req);
      setPreviewData({
        kind: "dax_measures",
        filename: file.filename,
        measures: resp.data?.measures || [],
        result: resp.data,
      });
      setShowPreview(true);
      setProcessingSteps((prev) => ({
        ...prev,
        dax_measures: {
          ...prev.dax_measures,
          status: "completed",
          result: `${resp.data.message}. Measures: ${resp.data.count}. File: ${resp.data.new_file}`,
          resultData: resp.data,
        },
      }));
    } catch (error) {
      setProcessingSteps((prev) => ({
        ...prev,
        dax_measures: {
          ...prev.dax_measures,
          status: "error",
          error: error.response?.data?.detail || error.message,
        },
      }));
      throw new Error(
        `Failed to generate DAX measures: ${error.response?.data?.detail || error.message}`,
      );
    }
  };
  const handleDax = async (file, action, filters, settings) => {
    try {
      const req = {
        filename: file.filename,
        settings: {
          min_queries:
            typeof settings.min_queries === "number"
              ? settings.min_queries
              : 20,
          max_queries:
            typeof settings.max_queries === "number"
              ? settings.max_queries
              : 30,
          preview_limit:
            typeof settings.preview_limit === "number"
              ? settings.preview_limit
              : 10,
        },
      };
      const resp = await axios.post(`${API_BASE}/api/dax/generate`, req);

      setPreviewData({
        kind: "dax",
        filename: file.filename,
        queries: resp.data?.queries || [],
        result: resp.data,
      });
      setShowPreview(true);

      setProcessingSteps((prev) => ({
        ...prev,
        dax: {
          ...prev.dax,
          status: "completed",
          result: `${resp.data.message}. Queries: ${resp.data.count}. File: ${resp.data.new_file}`,
          resultData: resp.data,
        },
      }));
    } catch (error) {
      setProcessingSteps((prev) => ({
        ...prev,
        dax: {
          ...prev.dax,
          status: "error",
          error: error.response?.data?.detail || error.message,
        },
      }));
      throw new Error(
        `Failed to generate DAX: ${error.response?.data?.detail || error.message}`,
      );
    }
  };
  const handleFeatures = async (file, action, filters, settings) => {
    try {
      console.log("🔧 FEATURES PROCESSING STARTED");
      console.log("📁 File:", file.filename);
      console.log("🎯 Action:", action);
      console.log("🔧 Filters:", filters);
      console.log("⚙️ Settings:", settings);

      // Map UI action to backend action string
      let feAction = (settings.action || "").toLowerCase();
      if (!feAction) {
        if (action === "Polynomial Features") feAction = "polynomial";
        else if (action === "Interaction Terms") feAction = "interaction";
        else if (action === "Binning") feAction = "binning";
        else if (action === "Date Features") feAction = "date";
        else if (action === "Text Features") feAction = "text";
      }

      const featureRequest = {
        filename: file.filename,
        filters,
        settings: {
          action: feAction,
          degree: typeof settings.degree === "number" ? settings.degree : 2,
          include_bias: !!settings.include_bias,
          interaction_only: !!settings.interaction_only,
          binning_strategy: settings.binning_strategy || "equal_width",
          bins: typeof settings.bins === "number" ? settings.bins : 5,
          date_parts: settings.date_parts || [
            "year",
            "month",
            "day",
            "weekday",
          ],
          text_options: settings.text_options || {
            use_tfidf: false,
            max_features: 100,
          },
          selected_columns: settings.selected_columns || null,
          preview_limit: 10,
        },
      };

      console.log("Final feature engineering request:", featureRequest);

      const applyResponse = await axios.post(
        `${API_BASE}/api/features/apply`,
        featureRequest,
      );
      console.log("Features apply response:", applyResponse.data);

      // Original preview (first 10 rows)
      const originalPreviewRes = await axios.post(`${API_BASE}/apply-filters`, {
        filename: file.filename,
        limit: 10,
        offset: 0,
      });
      const originalColumns = originalPreviewRes.data?.data?.columns || [];
      const originalRows = originalPreviewRes.data?.data?.rows || [];

      const processedRows = applyResponse.data?.preview_data || [];
      const processedColumns =
        processedRows.length > 0 ? Object.keys(processedRows[0]) : [];

      setPreviewData({
        kind: "features",
        filename: file.filename,
        original: { columns: originalColumns, rows: originalRows },
        processed: { columns: processedColumns, rows: processedRows },
        result: applyResponse.data,
      });
      setShowPreview(true);

      setProcessingSteps((prev) => ({
        ...prev,
        engineering: {
          ...prev.engineering,
          status: "completed",
          result: `${applyResponse.data.message}. New columns: ${applyResponse.data.new_columns?.length || 0}. New file: ${applyResponse.data.new_file}`,
          resultData: applyResponse.data,
          preview: {
            original: { columns: originalColumns, rows: originalRows },
            processed: { columns: processedColumns, rows: processedRows },
          },
        },
      }));
    } catch (error) {
      throw new Error(
        `Failed to engineer features: ${error.response?.data?.detail || error.message}`,
      );
    }
  };
  const handleNormalize = async (file, action, filters, settings) => {
    try {
      console.log("🔧 NORMALIZE PROCESSING STARTED");
      console.log("📁 File:", file.filename);
      console.log("🎯 Action:", action);
      console.log("🔧 Filters:", filters);
      console.log("⚙️ Settings:", settings);

      // Map UI action to method
      let method = settings.method || "standard";
      if (action === "Standard Scale") method = "standard";
      else if (action === "Min-Max Scale") method = "minmax";
      else if (action === "Robust Scale") method = "robust";
      else if (action === "Unit Vector") method = "unit_vector";
      else if (action === "Quantile Transform") method = "quantile";

      const normalizeRequest = {
        filename: file.filename,
        filters,
        settings: {
          method,
          feature_range: settings.feature_range || [0, 1],
          with_mean:
            settings.with_mean !== undefined ? settings.with_mean : true,
          preview_limit: 10,
          selected_features: settings.selected_features || null,
        },
      };

      console.log("Final normalize request:", normalizeRequest);

      // Apply normalization
      const applyResponse = await axios.post(
        `${API_BASE}/api/normalize/apply`,
        normalizeRequest,
      );
      console.log("Normalize apply response:", applyResponse.data);

      // Original preview (first 10 rows)
      const originalPreviewRes = await axios.post(`${API_BASE}/apply-filters`, {
        filename: file.filename,
        limit: 10,
        offset: 0,
      });
      const originalColumns = originalPreviewRes.data?.data?.columns || [];
      const originalRows = originalPreviewRes.data?.data?.rows || [];

      // Processed preview rows from response
      const processedRows = applyResponse.data?.preview_data || [];
      const processedColumns =
        processedRows.length > 0 ? Object.keys(processedRows[0]) : [];

      // Update preview modal
      setPreviewData({
        kind: "normalize",
        filename: file.filename,
        original: { columns: originalColumns, rows: originalRows },
        processed: { columns: processedColumns, rows: processedRows },
        result: applyResponse.data,
      });
      setShowPreview(true);

      // Mark as completed and store result
      setProcessingSteps((prev) => ({
        ...prev,
        normalize: {
          ...prev.normalize,
          status: "completed",
          result: `${applyResponse.data.message}. Columns scaled: ${applyResponse.data.columns_scaled?.length || 0}. New file: ${applyResponse.data.new_file}`,
          resultData: applyResponse.data,
        },
      }));
    } catch (error) {
      throw new Error(
        `Failed to normalize data: ${error.response?.data?.detail || error.message}`,
      );
    }
  };

  const handleOutliers = async (file, action, filters, settings) => {
    try {
      console.log("🔧 OUTLIERS PROCESSING STARTED");
      console.log("📁 File:", file.filename);
      console.log("🎯 Action:", action);
      console.log("🔧 Filters:", filters);
      console.log("⚙️ Settings:", settings);

      // Map UI action to method/action
      let method = settings.method || "iqr";
      if (action === "IQR Method") method = "iqr";
      else if (action === "Z-Score") method = "zscore";
      else if (action === "Modified Z-Score") method = "modified_zscore";
      else if (action === "Isolation Forest") method = "isolation_forest";

      const actionApplied =
        action === "Remove Outliers" ? "remove" : settings.action || "flag";

      const outlierRequest = {
        filename: file.filename,
        method,
        filters,
        settings: {
          method,
          threshold:
            typeof settings.threshold === "number" ? settings.threshold : 3,
          action: actionApplied,
          preview_limit: 10,
          high_variance_percentile: 0.8,
          skew_threshold: 1.0,
        },
      };

      console.log("Final outlier request:", outlierRequest);

      // Apply outlier handling
      const applyResponse = await axios.post(
        `${API_BASE}/api/outliers/apply`,
        outlierRequest,
      );
      console.log("Outliers apply response:", applyResponse.data);

      // Original preview (first 10 rows)
      const originalPreviewRes = await axios.post(`${API_BASE}/apply-filters`, {
        filename: file.filename,
        limit: 10,
        offset: 0,
      });
      const originalColumns = originalPreviewRes.data?.data?.columns || [];
      const originalRows = originalPreviewRes.data?.data?.rows || [];

      // Processed preview rows from response
      const processedRows = applyResponse.data?.preview_data || [];
      const processedColumns =
        processedRows.length > 0 ? Object.keys(processedRows[0]) : [];

      // Update preview modal
      setPreviewData({
        kind: "outliers",
        filename: file.filename,
        original: { columns: originalColumns, rows: originalRows },
        processed: { columns: processedColumns, rows: processedRows },
        result: applyResponse.data,
      });
      setShowPreview(true);

      // Mark as completed and store result
      setProcessingSteps((prev) => ({
        ...prev,
        outliers: {
          ...prev.outliers,
          status: "completed",
          result: `${applyResponse.data.message}. Rows before: ${applyResponse.data.rows_before}, after: ${applyResponse.data.rows_after}. Flagged: ${applyResponse.data.outliers_flagged}. New file: ${applyResponse.data.new_file}`,
          resultData: applyResponse.data,
        },
      }));
    } catch (error) {
      throw new Error(
        `Failed to handle outliers: ${error.response?.data?.detail || error.message}`,
      );
    }
  };

  const onPickFiles = () => inputRef.current?.click();

  const onFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const uploadRes = await axios.post(`${API_BASE}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (pe) => {
          if (pe.total) {
            setUploadProgress(Math.round((pe.loaded / pe.total) * 100));
          }
        },
      });
      await fetchFiles();

      // After upload, preselect the first uploaded file; dashboard generation is manual
      const uploaded = uploadRes?.data?.uploaded || [];
      if (uploaded.length > 0) {
        const fname = uploaded[0].filename;
        setSelectedFile({ filename: fname, url: `/uploads/${fname}` });
      }
    } catch (err) {
      alert("Upload failed");
      console.error(err);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const sidebarSections = [
    {
      title: "Data Cleaning",
      items: [
        { id: "overview", label: "Overview", icon: BarChart3 },
        { id: "missing", label: "Missing Values", icon: Target },
        { id: "duplicates", label: "Duplicates", icon: Filter },
        { id: "types", label: "Data Types", icon: Database },
        { id: "outliers", label: "Outliers", icon: TrendingUp },
      ],
    },
    {
      title: "Statistical Analysis",
      items: [
        { id: "descriptive", label: "Descriptive Stats", icon: BarChart3 },
        { id: "correlation", label: "Correlation", icon: TrendingUp },
        { id: "distributions", label: "Distributions", icon: PieChart },
      ],
    },
    {
      title: "Advanced Tools",
      items: [
        { id: "dax", label: "DAX Queries", icon: Zap },
        { id: "calculated", label: "Calculated Columns", icon: Settings },
        { id: "measures", label: "Measures", icon: Target },
      ],
    },
    {
      title: "Power BI Dashboard",
      items: [
        { id: "layouts", label: "Layouts", icon: BarChart3 },
        { id: "themes", label: "Themes", icon: Settings },
      ],
    },
  ];

  const actionCards = [
    {
      id: "inspect",
      title: "Load and Inspect Data",
      description:
        "Upload and examine your dataset structure, columns, and initial insights",
      icon: Search,
      color: "blue",
      delay: 0.1,
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
    },
    {
      id: "missing",
      title: "Handle Missing Values",
      description:
        "Detect, analyze, and resolve missing data points with intelligent strategies",
      icon: Target,
      color: "indigo",
      delay: 0.2,
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
    },
    {
      id: "duplicates",
      title: "Remove Duplicates",
      description:
        "Identify and eliminate duplicate records to ensure data quality",
      icon: Filter,
      color: "purple",
      delay: 0.3,
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
    },
    {
      id: "types",
      title: "Correct Data Types",
      description:
        "Optimize column data types for better performance and accuracy",
      icon: Type,
      color: "blue",
      delay: 0.4,
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
    },
    {
      id: "standardize",
      title: "Standardize Categorical/Text Data",
      description:
        "Normalize and standardize text fields and categorical variables",
      icon: Hash,
      color: "indigo",
      delay: 0.5,
      options: {
        actions: [
          "Lowercase",
          "Remove Special Chars",
          "Trim Whitespace",
          "One-Hot Encode",
          "Label Encode",
        ],
        filters: [
          "Text Columns",
          "Categorical",
          "High Cardinality",
          "Low Cardinality",
          "Mixed Case",
        ],
        settings: {
          encoding_type: "onehot",
          handle_unknown: "ignore",
          case_sensitive: false,
        },
      },
    },
    {
      id: "outliers",
      title: "Handle Outliers",
      description:
        "Detect and manage statistical outliers that could affect your analysis",
      icon: TrendingUp,
      color: "purple",
      delay: 0.6,
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
    },
    {
      id: "normalize",
      title: "Normalize/Scale Data",
      description:
        "Apply scaling techniques to prepare data for machine learning",
      icon: BarChart2,
      color: "blue",
      delay: 0.7,
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
    },
    {
      id: "engineering",
      title: "Feature Engineering",
      description:
        "Create new features and transform existing ones for better insights",
      icon: Layers,
      color: "indigo",
      delay: 0.8,
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
    },
    {
      id: "dax",
      title: "DAX Queries Generator",
      description:
        "Analyze your dataset and auto-generate ready-to-use Power BI DAX queries with PDF export",
      icon: Zap,
      color: "purple",
      delay: 0.9,
      options: {
        actions: ["Generate DAX"],
        filters: ["All Columns"],
        settings: { min_queries: 20, max_queries: 30, preview_limit: 10 },
      },
    },
    {
      id: "dax_measures",
      title: "DAX Measures Generator",
      description:
        "Auto-generate 20-100 meaningful DAX measures with PDF export",
      icon: CheckSquare,
      color: "blue",
      delay: 1.0,
      options: {
        actions: ["Generate Measures"],
        filters: ["All Columns"],
        settings: { min_measures: 20, max_measures: 60, preview_limit: 20 },
      },
    },
  ];

  const handleActionClick = (actionId) =>
    setExpandedCard(expandedCard === actionId ? null : actionId);

  const handleProcessStep = async (stepId, action, filters, settings) => {
    console.log("🚀 HANDLE PROCESS STEP CALLED");
    console.log("📋 Step ID:", stepId);
    console.log("🎯 Action:", action);
    console.log("🔧 Filters:", filters);
    console.log("⚙️ Settings:", settings);

    // Auto-select first file if none selected and files are available
    let fileToProcess = selectedFile;
    if (!fileToProcess && serverFiles.length > 0) {
      fileToProcess = serverFiles[0];
      setSelectedFile(fileToProcess);
    }

    if (!fileToProcess) {
      alert("No files available to process. Please upload a file first.");
      return;
    }

    setProcessingSteps((prev) => ({
      ...prev,
      [stepId]: { action, filters, settings, status: "processing" },
    }));

    try {
      // For "Load and Inspect Data" module, apply actual filtering
      if (stepId === "inspect") {
        console.log("✅ Calling handleDataFiltering for inspect module");
        await handleDataFiltering(
          stepId,
          fileToProcess,
          action,
          filters,
          settings,
        );
      } else if (stepId === "missing") {
        console.log("✅ Calling handleMissingValues for missing values module");
        await handleMissingValues(fileToProcess, action, filters, settings);
      } else if (stepId === "duplicates") {
        console.log("✅ Calling handleDuplicates for duplicates module");
        await handleDuplicates(fileToProcess, action, filters, settings);
      } else if (stepId === "types") {
        console.log("✅ Calling handleDataTypes for data types module");
        await handleDataTypes(fileToProcess, action, filters, settings);
      } else if (stepId === "standardize") {
        console.log("✅ Calling handleStandardize for standardize module");
        await handleStandardize(fileToProcess, action, filters, settings);
      } else if (stepId === "outliers") {
        console.log("✅ Calling handleOutliers for outliers module");
        await handleOutliers(fileToProcess, action, filters, settings);
      } else if (stepId === "normalize") {
        console.log("✅ Calling handleNormalize for normalize module");
        await handleNormalize(fileToProcess, action, filters, settings);
      } else if (stepId === "engineering") {
        console.log("✅ Calling handleFeatures for feature engineering module");
        await handleFeatures(fileToProcess, action, filters, settings);
      } else if (stepId === "dax") {
        console.log("✅ Calling handleDax for DAX queries generator");
        await handleDax(fileToProcess, action, filters, settings);
      } else if (stepId === "dax_measures") {
        console.log("✅ Calling handleDaxMeasures for DAX measures generator");
        await handleDaxMeasures(fileToProcess, action, filters, settings);
      } else {
        console.log(
          "⏭️ Using mock behavior for non-implemented module:",
          stepId,
        );
        // For other modules, keep the mock behavior for now
        setTimeout(
          () =>
            setProcessingSteps((prev) => ({
              ...prev,
              [stepId]: { ...prev[stepId], status: "completed" },
            })),
          2000,
        );
      }
    } catch (error) {
      console.error("❌ Processing error:", error);
      setProcessingSteps((prev) => ({
        ...prev,
        [stepId]: { ...prev[stepId], status: "error", error: error.message },
      }));
    }
  };

  const handleDataFiltering = async (
    stepId,
    file,
    action,
    filters,
    settings,
  ) => {
    try {
      console.log("🔍 FILTER PROCESSING STARTED");
      console.log("📁 File:", file.filename);
      console.log("🎯 Action:", action);
      console.log("🔧 Filters:", filters);
      console.log("⚙️ Settings:", settings);

      // Build filter request based on selected options
      const filterRequest = {
        filename: file.filename,
        limit: settings.preview_rows || 100,
      };

      // Get dataset info first
      console.log("📊 Getting dataset info...");
      const infoResponse = await axios.get(
        `${API_BASE}/dataset-info/${encodeURIComponent(file.filename)}`,
      );
      const allColumns = infoResponse.data.columns;
      console.log("📋 All columns:", Object.keys(allColumns));

      // Apply column selection based on filters
      if (filters.includes("Numeric Only")) {
        console.log("🔢 Applying Numeric Only filter");
        const numericColumns = Object.entries(allColumns)
          .filter(([_, info]) => info.is_numeric)
          .map(([name, _]) => name);
        filterRequest.column_selection = numericColumns;
        console.log("✅ Numeric columns found:", numericColumns);
      } else if (filters.includes("Text Only")) {
        console.log("📝 Applying Text Only filter");
        const textColumns = Object.entries(allColumns)
          .filter(([_, info]) => !info.is_numeric && info.dtype === "object")
          .map(([name, _]) => name);
        filterRequest.column_selection = textColumns;
        console.log("✅ Text columns found:", textColumns);
      } else if (filters.includes("Date Columns")) {
        console.log("📅 Applying Date Columns filter");
        const dateColumns = Object.entries(allColumns)
          .filter(([name, info]) => {
            // Check for datetime dtypes or column names that suggest dates
            return (
              info.dtype.includes("datetime") ||
              info.dtype.includes("date") ||
              name.toLowerCase().includes("date") ||
              name.toLowerCase().includes("time")
            );
          })
          .map(([name, _]) => name);
        filterRequest.column_selection = dateColumns;
        console.log("✅ Date columns found:", dateColumns);
      } else if (filters.includes("Show All Columns") || filters.length === 0) {
        console.log("📊 Showing all columns (no filtering)");
        // Don't set column_selection to show all columns
      } else {
        console.log("⚠️ Unknown filter combination:", filters);
        // Default to showing all columns
      }

      console.log("Final filter request:", filterRequest);

      // Apply the filters using the new endpoint
      const response = await axios.post(
        `${API_BASE}/apply-filters`,
        filterRequest,
      );
      console.log("Filter response:", response.data);

      // Store the filtered data for display
      setPreviewData({
        kind: "table",
        filename: file.filename,
        columns: response.data.data.columns,
        rows: response.data.data.rows,
        pagination: response.data.data.pagination,
        filters_applied: response.data.filters_applied,
      });

      // Show the filtered results
      setShowPreview(true);

      // Mark as completed
      setProcessingSteps((prev) => ({
        ...prev,
        [stepId]: {
          ...prev[stepId],
          status: "completed",
          result: `Filtered ${response.data.data.pagination.total_rows_original} rows to ${response.data.data.pagination.rows_returned} rows`,
        },
      }));
    } catch (error) {
      throw new Error(
        `Failed to apply filters: ${error.response?.data?.detail || error.message}`,
      );
    }
  };

  const handleMissingValues = async (file, action, filters, settings) => {
    try {
      console.log("🔧 MISSING VALUES PROCESSING STARTED");
      console.log("📁 File:", file.filename);
      console.log("🎯 Action:", action);
      console.log("🔧 Filters:", filters);
      console.log("⚙️ Settings:", settings);

      // First, get missing values preview
      console.log("📊 Getting missing values preview...");
      const previewResponse = await axios.post(
        `${API_BASE}/api/missing-values/preview`,
        {
          filename: file.filename,
        },
      );

      console.log("📋 Missing values preview:", previewResponse.data);

      // Map frontend action to backend action
      let backendAction = action;
      if (action === "Drop Rows") backendAction = "drop";
      else if (action === "Fill Forward") backendAction = "forward";
      else if (action === "Fill Backward") backendAction = "backward";
      else if (action === "Mean/Median Fill") backendAction = "mean";
      else if (action === "Custom Value") backendAction = "custom";

      // Map frontend filter to backend filter
      let backendFilter = "all";
      if (filters.includes("Numeric Only")) backendFilter = "numeric";
      else if (filters.includes("Text Only")) backendFilter = "text";

      // Apply missing values handling
      console.log("🔧 Applying missing values handling...");
      const handleRequest = {
        filename: file.filename,
        action: backendAction,
        filter: backendFilter,
        threshold: settings.threshold || 0.5,
        custom_value: settings.custom_value || null,
      };

      console.log("Final handle request:", handleRequest);

      const handleResponse = await axios.post(
        `${API_BASE}/api/missing-values/handle`,
        handleRequest,
      );
      console.log("Handle response:", handleResponse.data);

      // Store the preview data for display
      setPreviewData({
        kind: "missing_values",
        filename: file.filename,
        preview: previewResponse.data,
        result: handleResponse.data,
      });

      // Show the results
      setShowPreview(true);

      // Mark as completed
      setProcessingSteps((prev) => ({
        ...prev,
        missing: {
          ...prev.missing,
          status: "completed",
          result: `${handleResponse.data.message}. Rows affected: ${handleResponse.data.rows_affected}. New file: ${handleResponse.data.new_file}`,
          resultData: handleResponse.data, // Store full response for download
        },
      }));
    } catch (error) {
      throw new Error(
        `Failed to handle missing values: ${error.response?.data?.detail || error.message}`,
      );
    }
  };

  const handleDuplicates = async (file, action, filters, settings) => {
    try {
      console.log("🔧 DUPLICATES PROCESSING STARTED");
      console.log("📁 File:", file.filename);
      console.log("🎯 Action:", action);
      console.log("🔧 Filters:", filters);
      console.log("⚙️ Settings:", settings);

      // First, get duplicates preview
      console.log("📊 Getting duplicates preview...");

      // Handle subset based on filters
      let subset = null;
      if (filters.includes("Key Columns Only")) {
        // Use common key columns
        subset = ["name", "email"];
      } else if (filters.includes("All Columns")) {
        // Use all columns including ID (will find fewer duplicates)
        subset = null;
      } else if (settings.subset && settings.subset.length > 0) {
        subset = settings.subset;
      } else {
        // Default behavior: Exclude ID columns (most common use case)
        const infoResponse = await axios.get(
          `${API_BASE}/dataset-info/${encodeURIComponent(file.filename)}`,
        );
        const allColumns = Object.keys(infoResponse.data.columns);
        subset = allColumns.filter(
          (col) => !["id", "ID", "Id", "_id"].includes(col),
        );
      }

      const previewResponse = await axios.post(
        `${API_BASE}/api/duplicates/preview`,
        {
          filename: file.filename,
          subset: subset,
        },
      );

      console.log("📋 Duplicates preview:", previewResponse.data);

      // Map frontend action to backend action
      let backendAction = action;
      if (action === "Find Duplicates") backendAction = "find_duplicates";
      else if (action === "Remove All") backendAction = "remove_all";
      else if (action === "Keep First") backendAction = "keep_first";
      else if (action === "Keep Last") backendAction = "keep_last";
      else if (action === "Mark Duplicates") backendAction = "mark_duplicates";

      // Apply duplicates handling
      console.log("🔧 Applying duplicates handling...");
      const handleRequest = {
        filename: file.filename,
        action: backendAction,
        subset: subset, // Use the same subset logic as preview
        keep: settings.keep || "first",
        mark_only: settings.mark_only || false,
      };

      console.log("Final handle request:", handleRequest);

      const handleResponse = await axios.post(
        `${API_BASE}/api/duplicates/handle`,
        handleRequest,
      );
      console.log("Handle response:", handleResponse.data);

      // Store the preview data for display
      setPreviewData({
        kind: "duplicates",
        filename: file.filename,
        preview: previewResponse.data,
        result: handleResponse.data,
      });

      // Show the results
      setShowPreview(true);

      // Mark as completed
      setProcessingSteps((prev) => ({
        ...prev,
        duplicates: {
          ...prev.duplicates,
          status: "completed",
          result: `${handleResponse.data.message}. Rows before: ${handleResponse.data.rows_before}, after: ${handleResponse.data.rows_after}. New file: ${handleResponse.data.new_file}`,
          resultData: handleResponse.data, // Store full response for download
        },
      }));
    } catch (error) {
      throw new Error(
        `Failed to handle duplicates: ${error.response?.data?.detail || error.message}`,
      );
    }
  };

  const handleDataTypes = async (file, action, filters, settings) => {
    try {
      console.log("🔧 DATA TYPES PROCESSING STARTED");
      console.log("📁 File:", file.filename);
      console.log("🎯 Action:", action);
      console.log("🔧 Filters:", filters);
      console.log("⚙️ Settings:", settings);

      // First, get data types preview
      console.log("📊 Getting data types preview...");
      const previewResponse = await axios.post(
        `${API_BASE}/api/datatypes/preview`,
        {
          filename: file.filename,
        },
      );

      console.log("📋 Data types preview:", previewResponse.data);

      // Map frontend action to backend action
      let backendAction = action;
      if (action === "Auto Detect") backendAction = "auto_detect";
      else if (action === "Convert to Numeric")
        backendAction = "convert_to_numeric";
      else if (action === "Convert to Date")
        backendAction = "convert_to_datetime";
      else if (action === "Convert to Category")
        backendAction = "convert_to_category";
      else if (action === "Custom Type") backendAction = "custom_mapping";

      // Map frontend filter to backend filter_type
      let backendFilterType = "all";
      if (filters.includes("Object Type")) backendFilterType = "object";
      else if (filters.includes("Numeric Type")) backendFilterType = "numeric";
      else if (filters.includes("DateTime Type"))
        backendFilterType = "datetime";
      else if (filters.includes("Mixed Types")) backendFilterType = "mixed";

      // Apply data types conversion
      console.log("🔧 Applying data types conversion...");
      const convertRequest = {
        filename: file.filename,
        action: backendAction,
        filter_type: backendFilterType,
        columns: null, // Use all columns for now
        settings: settings,
        custom_mapping: settings.custom_mapping || null,
      };

      console.log("Final convert request:", convertRequest);

      const convertResponse = await axios.post(
        `${API_BASE}/api/datatypes/convert`,
        convertRequest,
      );
      console.log("Convert response:", convertResponse.data);

      // Store the preview data for display
      setPreviewData({
        kind: "data_types",
        filename: file.filename,
        preview: previewResponse.data,
        result: convertResponse.data,
      });

      // Show the results
      setShowPreview(true);

      // Mark as completed
      setProcessingSteps((prev) => ({
        ...prev,
        types: {
          ...prev.types,
          status: "completed",
          result: `${convertResponse.data.message}. Conversions applied: ${convertResponse.data.conversions_applied}. Memory saved: ${convertResponse.data.memory_saved}. New file: ${convertResponse.data.new_file}`,
          resultData: convertResponse.data, // Store full response for download
        },
      }));
    } catch (error) {
      throw new Error(
        `Failed to handle data types: ${error.response?.data?.detail || error.message}`,
      );
    }
  };

  const handleStandardize = async (file, action, filters, settings) => {
    try {
      console.log("🔧 STANDARDIZE PROCESSING STARTED");
      console.log("📁 File:", file.filename);
      console.log("🎯 Action:", action);
      console.log("🔧 Filters:", filters);
      console.log("⚙️ Settings:", settings);

      // Map UI action to backend StandardizeActions
      const actionsPayload = {
        lowercase: action === "Lowercase",
        remove_special: action === "Remove Special Chars",
        trim_whitespace: action === "Trim Whitespace",
        encode:
          action === "One-Hot Encode"
            ? "onehot"
            : action === "Label Encode"
              ? "label"
              : null,
      };

      const standardizeRequest = {
        filename: file.filename,
        actions: actionsPayload,
        filters: filters,
        settings: {
          encoding_type: settings.encoding_type || null,
          handle_unknown: settings.handle_unknown || "ignore",
          case_sensitive: !!settings.case_sensitive,
          high_cardinality_threshold: 50,
          low_cardinality_threshold: 10,
          preview_limit: 15,
        },
      };

      console.log("Final standardize request:", standardizeRequest);

      // Apply standardization to generate downloadable file
      const applyResponse = await axios.post(
        `${API_BASE}/api/standardize/apply`,
        standardizeRequest,
      );
      console.log("Standardize apply response:", applyResponse.data);

      // Fetch original preview (first N rows) for side-by-side comparison
      const n = 10;
      const originalPreviewRes = await axios.post(`${API_BASE}/apply-filters`, {
        filename: file.filename,
        limit: n,
        offset: 0,
      });

      const originalColumns = originalPreviewRes.data?.data?.columns || [];
      const originalRows = originalPreviewRes.data?.data?.rows || [];

      // Build processed preview columns/rows from response
      const processedRows = applyResponse.data?.preview_data || [];
      const processedColumns =
        processedRows.length > 0 ? Object.keys(processedRows[0]) : [];

      // Update preview modal data
      setPreviewData({
        kind: "standardize",
        filename: file.filename,
        original: { columns: originalColumns, rows: originalRows },
        processed: { columns: processedColumns, rows: processedRows },
        result: applyResponse.data,
      });
      setShowPreview(true);

      // Mark as completed and store result for download button
      setProcessingSteps((prev) => ({
        ...prev,
        standardize: {
          ...prev.standardize,
          status: "completed",
          result: `${applyResponse.data.message}. Columns changed: ${applyResponse.data.columns_changed?.length || 0}. New file: ${applyResponse.data.new_file}`,
          resultData: applyResponse.data, // contains new_file for download
        },
      }));
    } catch (error) {
      throw new Error(
        `Failed to standardize data: ${error.response?.data?.detail || error.message}`,
      );
    }
  };

  const handlePreview = async () => {
    console.log("👁️ PREVIEW BUTTON CLICKED");

    // Auto-select first file if none selected and files are available
    let fileToPreview = selectedFile;
    if (!fileToPreview && serverFiles.length > 0) {
      fileToPreview = serverFiles[0];
      setSelectedFile(fileToPreview);
    }

    if (!fileToPreview) {
      alert("No files available to preview. Please upload a file first.");
      return;
    }

    setPreviewLoading(true);
    try {
      console.log("📁 Previewing file:", fileToPreview.filename);

      // Use simple preview for basic file preview (no filtering)
      const response = await fetch(`${API_BASE}${fileToPreview.url}`);
      const blob = await response.blob();

      // Create FormData to send to preview endpoint
      const formData = new FormData();
      formData.append("file", blob, fileToPreview.filename);

      const previewResponse = await axios.post(
        `${API_BASE}/preview`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      console.log("📊 Preview response:", previewResponse.data);
      setPreviewData(previewResponse.data);
      setShowPreview(true);
    } catch (error) {
      console.error("❌ Preview error:", error);
      alert(
        "Failed to generate preview. Please ensure the file is a supported format (CSV, Excel, Image, or PDF).",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const ProcessingPanel = ({ card }) => {
    // Simple local state - safe and won't cause crashes
    const [selectedAction, setSelectedAction] = useState(
      card.options.actions[0],
    );
    const [selectedFilters, setSelectedFilters] = useState([
      card.options.filters[0],
    ]);
    const [settings, setSettings] = useState(card.options.settings);
    const stepStatus = processingSteps[card.id]?.status;

    return (
      <div className="mt-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              <Code className="inline w-4 h-4 mr-2" />
              Actions
            </label>
            <div className="space-y-2">
              {card.options.actions.map((action) => (
                <label
                  key={action}
                  className="flex items-center space-x-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name={`action-${card.id}`}
                    value={action}
                    checked={selectedAction === action}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-600">{action}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              <Filter className="inline w-4 h-4 mr-2" />
              Filters
            </label>
            <div className="space-y-2">
              {card.options.filters.map((filter) => (
                <label
                  key={filter}
                  className="flex items-center space-x-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    value={filter}
                    checked={selectedFilters.includes(filter)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedFilters([...selectedFilters, filter]);
                      } else {
                        setSelectedFilters(
                          selectedFilters.filter((f) => f !== filter),
                        );
                      }
                    }}
                    className="text-blue-600 focus:ring-blue-500 rounded"
                  />
                  <span className="text-sm text-slate-600">{filter}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              <Sliders className="inline w-4 h-4 mr-2" />
              Settings
            </label>
            <div className="space-y-3">
              {Object.entries(settings).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-xs text-slate-500 mb-1 capitalize">
                    {key.replace("_", " ")}
                  </label>
                  {typeof value === "boolean" ? (
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            [key]: e.target.checked,
                          }))
                        }
                        className="text-blue-600 focus:ring-blue-500 rounded"
                      />
                      <span className="text-sm text-slate-600">Enable</span>
                    </label>
                  ) : typeof value === "number" ? (
                    <input
                      type="number"
                      value={value}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-3 py-1 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-1 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() =>
                  handleProcessStep(
                    card.id,
                    selectedAction,
                    selectedFilters,
                    settings,
                  )
                }
                disabled={stepStatus === "processing"}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {stepStatus === "processing" ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>
                  {stepStatus === "processing" ? "Processing..." : "Execute"}
                </span>
              </button>
              <button
                onClick={handlePreview}
                disabled={previewLoading}
                className="px-4 py-2.5 bg-white text-slate-600 border border-slate-300 rounded-lg font-semibold hover:bg-slate-50 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {previewLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                <span>{previewLoading ? "Loading..." : "Preview"}</span>
              </button>
            </div>
            <div className="flex items-center space-x-2">
              {stepStatus === "completed" && (
                <div className="flex items-center space-x-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <div className="text-sm">
                    <span className="font-semibold">Completed</span>
                    {processingSteps[card.id]?.result && (
                      <div className="text-xs text-gray-600 mt-1">
                        {processingSteps[card.id].result}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {stepStatus === "error" && (
                <div className="flex items-center space-x-2 text-red-600">
                  <span className="text-sm font-semibold">Error</span>
                  {processingSteps[card.id]?.error && (
                    <div className="text-xs text-red-600">
                      {processingSteps[card.id].error}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => {
                  const stepData = processingSteps[card.id];
                  if (stepData?.resultData?.new_file) {
                    window.open(
                      `${API_BASE}/temp/${stepData.resultData.new_file}`,
                      "_blank",
                    );
                  } else {
                    alert("No processed file available to download");
                  }
                }}
                disabled={!processingSteps[card.id]?.resultData?.new_file}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inline execution preview for Feature Engineering */}
          {card.id === "engineering" &&
            processingSteps[card.id]?.status === "completed" &&
            processingSteps[card.id]?.preview && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-md font-semibold text-slate-800">
                    Execution Preview
                  </h4>
                  {processingSteps[card.id]?.resultData?.new_file && (
                    <a
                      href={`${API_BASE}/temp/${processingSteps[card.id].resultData.new_file}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Updated Dataset
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                      Original Dataset (first rows)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-0">
                        <thead className="bg-gray-50">
                          <tr>
                            {processingSteps[
                              card.id
                            ].preview.original.columns.map((col, i) => (
                              <th
                                key={i}
                                className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {processingSteps[card.id].preview.original.rows.map(
                            (row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                {processingSteps[
                                  card.id
                                ].preview.original.columns.map((col, j) => (
                                  <td
                                    key={j}
                                    className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                  >
                                    {row[col] ?? "—"}
                                  </td>
                                ))}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                      Processed Dataset (after execution)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-0">
                        <thead className="bg-gray-50">
                          <tr>
                            {processingSteps[
                              card.id
                            ].preview.processed.columns.map((col, i) => (
                              <th
                                key={i}
                                className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {processingSteps[card.id].preview.processed.rows.map(
                            (row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                {processingSteps[
                                  card.id
                                ].preview.processed.columns.map((col, j) => (
                                  <td
                                    key={j}
                                    className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                  >
                                    {row[col] ?? "—"}
                                  </td>
                                ))}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute w-1 h-1 bg-blue-200 rounded-full opacity-60"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              animation: `float ${p.duration}s infinite linear ${p.delay}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes float {0%{transform:translateY(100vh) translateX(-50px) scale(0);opacity:0;}10%{opacity:1;}90%{opacity:1;}100%{transform:translateY(-100vh) translateX(50px) scale(1);opacity:0;}}
        @keyframes slideInUp {from{opacity:0;transform:translateY(30px);}to{opacity:1;transform:translateY(0);}}
        @keyframes slideInLeft {from{opacity:0;transform:translateX(-30px);}to{opacity:1;transform:translateX(0);}}
        @keyframes pulse-glow {0%,100%{box-shadow:0 0 20px rgba(59,130,246,0.3);}50%{box-shadow:0 0 30px rgba(59,130,246,0.5);} }
        .animate-slide-up{animation:slideInUp .6s ease-out forwards}
        .animate-slide-left{animation:slideInLeft .5s ease-out forwards}
        .animate-pulse-glow{animation:pulse-glow 2s ease-in-out infinite}
      `}</style>

      <Navbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="pt-20">
        <div className="w-full max-w-none px-12 py-10">
          <div className="w-full space-y-16">
            <main className="w-full">
              <div
                className="mb-8 animate-slide-up"
                style={{ animationDelay: "0.2s" }}
              >
                <div
                  onClick={onPickFiles}
                  className="relative group cursor-pointer bg-white/70 backdrop-blur-sm border-2 border-dashed border-blue-200 rounded-2xl p-12 min-h-[200px] text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-500 hover:shadow-xl hover:shadow-blue-100"
                >
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.gif,.bmp,.webp"
                    className="hidden"
                    onChange={onFilesSelected}
                  />
                  <div className="relative">
                    <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      {isUploading ? (
                        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                      ) : (
                        <Upload className="w-8 h-8 text-blue-600" />
                      )}
                    </div>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">
                      {isUploading ? "Uploading..." : "Drag & drop files here"}
                    </h3>
                    <p className="text-slate-500 text-lg">
                      {isUploading
                        ? `${uploadProgress}% complete`
                        : "or click to browse"}
                    </p>
                    {isUploading && (
                      <div className="mt-4 w-64 mx-auto bg-blue-100 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div
                    className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400 via-indigo-500 to-blue-400 opacity-0 group-hover:opacity-20 transition-opacity duration-500 -z-10"
                    style={{ padding: "2px" }}
                  >
                    <div className="w-full h-full bg-white rounded-2xl" />
                  </div>
                </div>
              </div>

              <div
                className="bg-white/70 backdrop-blur-sm rounded-2xl p-8 lg:p-10 border border-slate-200 shadow-lg animate-slide-up"
                style={{ animationDelay: "0.8s" }}
              >
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <Database className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    On Server
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-10">
                  {serverFiles.map((f, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedFile(f)}
                      className={`w-full p-5 rounded-xl bg-white shadow border hover:shadow-md transition cursor-pointer ${
                        selectedFile?.filename === f.filename
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 truncate">
                            {f.filename}
                          </div>
                          <div className="text-xs text-gray-500">
                            {(f.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {selectedFile?.filename === f.filename && (
                            <CheckCircle className="w-5 h-5 text-blue-500" />
                          )}
                          <a
                            href={`${API_BASE}${f.url}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                  {serverFiles.length === 0 && (
                    <div className="text-sm text-gray-500">
                      No files uploaded yet.
                    </div>
                  )}
                </div>
                {selectedFile ? (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-700">
                      <strong>Selected:</strong> {selectedFile.filename} - Click
                      "Preview" button in any module to view this file
                    </div>
                  </div>
                ) : serverFiles.length > 0 ? (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="text-sm text-yellow-700">
                      <strong>Tip:</strong> Click on a file above to select it,
                      or use "Preview" button to automatically preview the first
                      file
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-10 mb-8">
                {actionCards.map((card) => {
                  const Icon = card.icon;
                  const colorClasses = {
                    blue: "from-blue-500 to-blue-600 hover:shadow-blue-200",
                    indigo:
                      "from-indigo-500 to-indigo-600 hover:shadow-indigo-200",
                    purple:
                      "from-purple-500 to-purple-600 hover:shadow-purple-200",
                  };
                  const isExpanded = expandedCard === card.id;
                  const stepStatus = processingSteps[card.id]?.status;
                  return (
                    <div
                      key={card.id}
                      className={`group w-full min-h-[280px] bg-white rounded-xl p-7 lg:p-8 border border-slate-200 shadow-sm hover:border-blue-300 transition-all duration-500 animate-slide-up ${isExpanded ? "md:col-span-2 xl:col-span-3 2xl:col-span-4 shadow-xl border-blue-400" : "hover:shadow-xl hover:-translate-y-2"}`}
                      style={{ animationDelay: `${card.delay}s` }}
                    >
                      <div className="relative">
                        <div className="flex items-start justify-between mb-4">
                          <div
                            className={`w-16 h-16 bg-gradient-to-r ${colorClasses[card.color]} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}
                          >
                            <Icon className="w-8 h-8 text-white" />
                          </div>
                          <div className="flex items-center space-x-2">
                            {stepStatus === "completed" && (
                              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-4 h-4 text-white" />
                              </div>
                            )}
                            {stepStatus === "processing" && (
                              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                <RefreshCw className="w-4 h-4 text-white animate-spin" />
                              </div>
                            )}
                            <button
                              onClick={() => handleActionClick(card.id)}
                              className="p-2 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-slate-600" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-slate-600" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div
                          className="cursor-pointer"
                          onClick={() => handleActionClick(card.id)}
                        >
                          <h3 className="text-xl font-semibold text-slate-800 mb-3 group-hover:text-blue-700 transition-colors">
                            {card.title}
                          </h3>
                          <p className="text-base text-gray-600 leading-relaxed mb-4">
                            {card.description}
                          </p>
                        </div>
                        {!isExpanded && (
                          <div className="flex items-center justify-between">
                            <div
                              className="flex items-center text-blue-600 font-semibold cursor-pointer hover:text-blue-700 transition-colors"
                              onClick={() => handleActionClick(card.id)}
                            >
                              <span>Configure & Run</span>
                              <Play className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-slate-500">
                                {card.options.actions.length} actions
                              </span>
                              <Sliders className="w-4 h-4 text-slate-400" />
                            </div>
                          </div>
                        )}
                        {isExpanded && <ProcessingPanel card={card} />}
                      </div>
                      <div
                        className={`absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-20 transition-opacity duration-500 -z-10 ${isExpanded ? "opacity-10" : ""}`}
                      />
                    </div>
                  );
                })}
              </div>
            </main>

            {/* Generate Dashboard Controls */}
            <section className="w-full pt-6">
              <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col md:flex-row md:items-center md:space-x-4 space-y-3 md:space-y-0">
                <div className="font-semibold text-gray-800">
                  Generate Auto Dashboard
                </div>
                <div className="flex-1">
                  <select
                    className="w-full md:w-auto border rounded-lg px-3 py-2 text-sm"
                    value={selectedFile?.filename || ""}
                    onChange={(e) => {
                      const f = serverFiles.find(
                        (s) => s.filename === e.target.value,
                      );
                      setSelectedFile(f || null);
                    }}
                  >
                    <option value="" disabled>
                      Select a file
                    </option>
                    {serverFiles.map((f) => (
                      <option key={f.filename} value={f.filename}>
                        {f.filename}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={generateAutoDashboard}
                  disabled={previewLoading || serverFiles.length === 0}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-white ${previewLoading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"} transition-colors`}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {previewLoading ? "Generating..." : "Generate Dashboard"}
                </button>
              </div>
            </section>

            {/* Sidebar removed: no overlay needed */}
            {latestDashboard && (
              <section className="w-full py-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Auto Dashboard
                  </h2>
                  <button
                    onClick={downloadDashboardPDF}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download as PDF
                  </button>
                </div>
                <div ref={dashboardRef} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(latestDashboard.kpis || []).map((k, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-xl shadow-sm border p-4"
                      >
                        <div className="text-xs text-gray-500 mb-1">
                          {k.key}
                        </div>
                        <div className="text-2xl font-semibold text-gray-900">
                          {Number(k.total).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          Avg: {Number(k.avg).toLocaleString()} • Min:{" "}
                          {Number(k.min).toLocaleString()} • Max:{" "}
                          {Number(k.max).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {(latestDashboard.charts || []).map((ch, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-xl shadow-sm border p-4"
                      >
                        <div className="text-sm font-semibold text-gray-800 mb-3">
                          {ch.title}
                        </div>
                        <div className="h-64">
                          {ch.type === "line" && (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={ch.data}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey={ch.xKey} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                {(ch.yKeys || []).map((yk, i) => (
                                  <Line
                                    key={yk}
                                    type="monotone"
                                    dataKey={yk}
                                    stroke={chartColors[i % chartColors.length]}
                                    strokeWidth={2}
                                    dot={false}
                                  />
                                ))}
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                          {ch.type === "bar" && (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={ch.data}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey={ch.xKey} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                {(ch.yKeys || []).map((yk, i) => (
                                  <Bar
                                    key={yk}
                                    dataKey={yk}
                                    fill={chartColors[i % chartColors.length]}
                                  />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                          {ch.type === "grouped_bar" && (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={ch.data}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey={ch.xKey} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                {(ch.yKeys || []).map((yk, i) => (
                                  <Bar
                                    key={yk}
                                    dataKey={yk}
                                    fill={chartColors[i % chartColors.length]}
                                  />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                          {ch.type === "pie" && (
                            <ResponsiveContainer width="100%" height="100%">
                              <RPieChart>
                                <Tooltip />
                                <Legend />
                                <Pie
                                  data={ch.data}
                                  dataKey={ch.valueKey}
                                  nameKey={ch.nameKey}
                                  outerRadius={90}
                                  innerRadius={40}
                                >
                                  {(ch.data || []).map((_, i) => (
                                    <Cell
                                      key={i}
                                      fill={chartColors[i % chartColors.length]}
                                    />
                                  ))}
                                </Pie>
                              </RPieChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl max-h-[90vh] w-full overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <Eye className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-900">
                  Preview: {previewData.filename}
                </h2>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-auto max-h-[calc(90vh-120px)]">
              {previewData.kind === "table" && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {previewData.pagination ? (
                        <>
                          Showing {previewData.pagination.rows_returned} of{" "}
                          {previewData.pagination.total_rows_filtered} filtered
                          rows
                          {previewData.pagination.total_rows_original !==
                            previewData.pagination.total_rows_filtered && (
                            <span className="text-blue-600 font-medium">
                              (filtered from{" "}
                              {previewData.pagination.total_rows_original}{" "}
                              total)
                            </span>
                          )}
                          • {previewData.columns.length} columns
                        </>
                      ) : (
                        <>
                          Showing first 10 rows • {previewData.columns.length}{" "}
                          columns
                        </>
                      )}
                    </div>
                    {previewData.filters_applied && (
                      <div className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {
                          Object.entries(previewData.filters_applied).filter(
                            ([_, count]) => count > 0 || count === true,
                          ).length
                        }{" "}
                        filters applied
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50">
                        <tr>
                          {previewData.columns.map((col, i) => (
                            <th
                              key={i}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {previewData.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            {previewData.columns.map((col, j) => (
                              <td
                                key={j}
                                className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 last:border-r-0 max-w-xs truncate"
                              >
                                {row[col] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {previewData.kind === "features" && (
                <div>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Feature Engineering Preview
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                          Original Dataset (first rows)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-0">
                            <thead className="bg-gray-50">
                              <tr>
                                {previewData.original.columns.map((col, i) => (
                                  <th
                                    key={i}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {previewData.original.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {previewData.original.columns.map(
                                    (col, j) => (
                                      <td
                                        key={j}
                                        className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                      >
                                        {row[col] ?? "—"}
                                      </td>
                                    ),
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                          Processed Dataset (after feature engineering)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-0">
                            <thead className="bg-gray-50">
                              <tr>
                                {previewData.processed.columns.map((col, i) => (
                                  <th
                                    key={i}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {previewData.processed.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {previewData.processed.columns.map(
                                    (col, j) => (
                                      <td
                                        key={j}
                                        className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                      >
                                        {row[col] ?? "—"}
                                      </td>
                                    ),
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                  {previewData.result?.new_file && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-green-800">
                            {previewData.result.message}
                          </div>
                          <div className="text-sm text-green-700">
                            New file: {previewData.result.new_file}
                          </div>
                        </div>
                        <a
                          href={`${API_BASE}/temp/${previewData.result.new_file}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Engineered Dataset
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {previewData.kind === "dax" && (
                <div>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Generated DAX Queries (preview)
                    </h3>
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                        Queries
                      </div>
                      <div className="max-h-96 overflow-y-auto divide-y">
                        {previewData.queries.map((q, idx) => (
                          <div key={idx} className="p-4">
                            <div className="font-semibold text-slate-800 mb-1">
                              {idx + 1}. {q.title}
                            </div>
                            <div className="text-sm text-slate-600 mb-2">
                              {q.description}
                            </div>
                            <pre className="text-xs bg-slate-50 p-3 rounded border overflow-x-auto whitespace-pre-wrap">
                              {q.dax}
                            </pre>
                          </div>
                        ))}
                        {previewData.queries.length === 0 && (
                          <div className="p-4 text-sm text-slate-500">
                            No queries to preview.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {previewData.result?.new_file && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-green-800">
                            {previewData.result.message}
                          </div>
                          <div className="text-sm text-green-700">
                            PDF file: {previewData.result.new_file}
                          </div>
                        </div>
                        <a
                          href={`${API_BASE}/temp/${previewData.result.new_file}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download DAX PDF
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {previewData.kind === "dax_measures" && (
                <div>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Generated DAX Measures (preview)
                    </h3>
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                        Measures
                      </div>
                      <div className="max-h-96 overflow-y-auto divide-y">
                        {previewData.measures.map((m, idx) => (
                          <div key={idx} className="p-4">
                            <div className="font-semibold text-slate-800 mb-1">
                              {idx + 1}. {m.title || m.name}
                            </div>
                            {m.description && (
                              <div className="text-sm text-slate-600 mb-2">
                                {m.description}
                              </div>
                            )}
                            <pre className="text-xs bg-slate-50 p-3 rounded border overflow-x-auto whitespace-pre-wrap">
                              {m.dax || m.formula}
                            </pre>
                          </div>
                        ))}
                        {previewData.measures.length === 0 && (
                          <div className="p-4 text-sm text-slate-500">
                            No measures to preview.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {previewData.result?.new_file && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-green-800">
                            {previewData.result.message}
                          </div>
                          <div className="text-sm text-green-700">
                            PDF file: {previewData.result.new_file}
                          </div>
                        </div>
                        <a
                          href={`${API_BASE}/temp/${previewData.result.new_file}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Measures PDF
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {previewData.kind === "normalize" && (
                <div>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Normalization Preview
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                          Original Dataset (first rows)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-0">
                            <thead className="bg-gray-50">
                              <tr>
                                {previewData.original.columns.map((col, i) => (
                                  <th
                                    key={i}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {previewData.original.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {previewData.original.columns.map(
                                    (col, j) => (
                                      <td
                                        key={j}
                                        className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                      >
                                        {row[col] ?? "—"}
                                      </td>
                                    ),
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                          Processed Dataset (after normalization)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-0">
                            <thead className="bg-gray-50">
                              <tr>
                                {previewData.processed.columns.map((col, i) => (
                                  <th
                                    key={i}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {previewData.processed.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {previewData.processed.columns.map(
                                    (col, j) => (
                                      <td
                                        key={j}
                                        className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                      >
                                        {row[col] ?? "—"}
                                      </td>
                                    ),
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                  {previewData.result?.new_file && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-green-800">
                            {previewData.result.message}
                          </div>
                          <div className="text-sm text-green-700">
                            New file: {previewData.result.new_file}
                          </div>
                        </div>
                        <a
                          href={`${API_BASE}/temp/${previewData.result.new_file}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Normalized Dataset
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {previewData.kind === "outliers" && (
                <div>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Outliers Handling Preview
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                          Original Dataset (first rows)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-0">
                            <thead className="bg-gray-50">
                              <tr>
                                {previewData.original.columns.map((col, i) => (
                                  <th
                                    key={i}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {previewData.original.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {previewData.original.columns.map(
                                    (col, j) => (
                                      <td
                                        key={j}
                                        className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                      >
                                        {row[col] ?? "—"}
                                      </td>
                                    ),
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                          Processed Dataset (after outlier handling)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-0">
                            <thead className="bg-gray-50">
                              <tr>
                                {previewData.processed.columns.map((col, i) => (
                                  <th
                                    key={i}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {previewData.processed.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {previewData.processed.columns.map(
                                    (col, j) => (
                                      <td
                                        key={j}
                                        className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                      >
                                        {row[col] ?? "—"}
                                      </td>
                                    ),
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                  {previewData.result?.new_file && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-green-800">
                            {previewData.result.message}
                          </div>
                          <div className="text-sm text-green-700">
                            New file: {previewData.result.new_file}
                          </div>
                        </div>
                        <a
                          href={`${API_BASE}/temp/${previewData.result.new_file}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Cleaned Dataset
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {previewData.kind === "standardize" && (
                <div>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Standardization Preview
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                          Original Dataset (first rows)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-0">
                            <thead className="bg-gray-50">
                              <tr>
                                {previewData.original.columns.map((col, i) => (
                                  <th
                                    key={i}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {previewData.original.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {previewData.original.columns.map(
                                    (col, j) => (
                                      <td
                                        key={j}
                                        className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                      >
                                        {row[col] ?? "—"}
                                      </td>
                                    ),
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
                          Processed Dataset (after standardization)
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-0">
                            <thead className="bg-gray-50">
                              <tr>
                                {previewData.processed.columns.map((col, i) => (
                                  <th
                                    key={i}
                                    className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r last:border-r-0"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {previewData.processed.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {previewData.processed.columns.map(
                                    (col, j) => (
                                      <td
                                        key={j}
                                        className="px-4 py-2 text-sm text-gray-700 border-r last:border-r-0 max-w-xs truncate"
                                      >
                                        {row[col] ?? "—"}
                                      </td>
                                    ),
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                  {previewData.result?.new_file && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-green-800">
                            {previewData.result.message}
                          </div>
                          <div className="text-sm text-green-700">
                            New file: {previewData.result.new_file}
                          </div>
                        </div>
                        <a
                          href={`${API_BASE}/temp/${previewData.result.new_file}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Standardized Dataset
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {previewData.kind === "pdf" && (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    PDF File
                  </h3>
                  <p className="text-gray-500">{previewData.note}</p>
                  <a
                    href={`${API_BASE}${selectedFile.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </a>
                </div>
              )}

              {previewData.kind === "auto_dashboard" && (
                <div>
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-800">
                      Auto Dashboard
                    </h3>
                    <p className="text-sm text-gray-600">
                      Automatically generated insights from{" "}
                      {previewData.filename}
                    </p>
                  </div>
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {(previewData.dashboard?.kpis || []).map((k) => (
                      <div
                        key={k.key}
                        className="bg-white rounded-xl shadow-sm border p-4"
                      >
                        <div className="text-xs text-gray-500 mb-1">
                          {k.key}
                        </div>
                        <div className="text-2xl font-semibold text-gray-900">
                          {Number(k.total).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          Avg: {Number(k.avg).toLocaleString()} • Min:{" "}
                          {Number(k.min).toLocaleString()} • Max:{" "}
                          {Number(k.max).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Simple charts without external deps (fallback) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {(previewData.dashboard?.charts || []).map((ch, idx) => (
                      <div
                        key={idx}
                        className="bg-white rounded-xl shadow-sm border p-4"
                      >
                        <div className="text-sm font-semibold text-gray-800 mb-3">
                          {ch.title}
                        </div>
                        {/* Fallback bar-like visualization */}
                        {ch.type === "bar" || ch.type === "grouped_bar" ? (
                          <div>
                            {(ch.data || []).map((row, i) => {
                              const keys =
                                ch.yKeys || (ch.valueKey ? [ch.valueKey] : []);
                              const xLabel = row[ch.xKey || ch.nameKey];
                              const total = keys.reduce(
                                (acc, k) => acc + (Number(row[k]) || 0),
                                0,
                              );
                              const width = Math.min(
                                100,
                                Math.max(
                                  2,
                                  total === 0 ? 2 : Math.log10(total + 1) * 25,
                                ),
                              );
                              return (
                                <div key={i} className="mb-2">
                                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                                    <span
                                      className="truncate max-w-[70%]"
                                      title={String(xLabel)}
                                    >
                                      {String(xLabel)}
                                    </span>
                                    <span>{total.toLocaleString()}</span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded">
                                    <div
                                      className="h-2 bg-blue-500 rounded"
                                      style={{ width: `${width}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : ch.type === "line" ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr>
                                  <th className="text-left py-1 pr-2">
                                    {ch.xKey}
                                  </th>
                                  {ch.yKeys.map((yk) => (
                                    <th
                                      key={yk}
                                      className="text-right py-1 pl-2"
                                    >
                                      {yk}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(ch.data || []).slice(-24).map((row, i) => (
                                  <tr key={i} className="border-t">
                                    <td className="py-1 pr-2">
                                      {row[ch.xKey]}
                                    </td>
                                    {ch.yKeys.map((yk) => (
                                      <td
                                        key={yk}
                                        className="text-right py-1 pl-2"
                                      >
                                        {Number(row[yk] || 0).toLocaleString()}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : ch.type === "pie" ? (
                          <div className="text-xs text-gray-700">
                            {(ch.data || []).map((row, i) => (
                              <div
                                key={i}
                                className="flex justify-between border-t py-1"
                              >
                                <span
                                  className="truncate max-w-[70%]"
                                  title={String(row[ch.nameKey])}
                                >
                                  {String(row[ch.nameKey])}
                                </span>
                                <span>
                                  {Number(
                                    row[ch.valueKey] || 0,
                                  ).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">
                            Unsupported chart type.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Sidebar-like dataset summary */}
                  <div className="mt-6 bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm font-semibold text-gray-800 mb-3">
                      Dataset Summary
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-left py-1 pr-4">Column</th>
                            <th className="text-left py-1 pr-4">Type</th>
                            <th className="text-right py-1">Missing %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(
                            previewData.dashboard?.schema?.columns || {},
                          ).map(([name, info]) => (
                            <tr key={name} className="border-t">
                              <td className="py-1 pr-4">{name}</td>
                              <td className="py-1 pr-4">
                                {info.is_numeric
                                  ? "Numeric"
                                  : info.is_datetime
                                    ? "Datetime"
                                    : "Categorical"}
                              </td>
                              <td className="py-1 text-right">
                                {Number(info.missing_percent || 0).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
