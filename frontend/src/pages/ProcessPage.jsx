import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ProcessingPanel from '../components/processing/ProcessingPanel'
import PreviewModal from '../components/processing/PreviewModal'
import { useAppStore } from '../stores/useAppStore'
import {
  CheckSquare2, Filter, Layers, Search, Target, TrendingUp, Type, BarChart2, Zap, ChevronDown,
} from 'lucide-react'
import axiosClient from '../api/axiosClient'
import useMissingValues from '../hooks/useMissingValues'
import useDuplicates from '../hooks/useDuplicates'
import useOutliers from '../hooks/useOutliers'
import useNormalize from '../hooks/useNormalize'
import useFeatureEngineering from '../hooks/useFeatureEngineering'
import useDax from '../hooks/useDAX'
import { useFiles } from '../hooks/useFiles'

export default function ProcessPage() {
  const selectedFile = useAppStore((s) => s.selectedFile)
  const selectedId = selectedFile?.filename

  // Preview state
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)

  // Fetch available files using existing hook
  const { filesQuery } = useFiles()
  const filesList = useMemo(
    () => Array.isArray(filesQuery?.data?.files) ? filesQuery.data.files : [],
    [filesQuery.data],
  )

  // Get hooks
  const missing = useMissingValues()
  const duplicates = useDuplicates()
  const outliers = useOutliers()
  const normalize = useNormalize()
  const features = useFeatureEngineering()
  const dax = useDax()

  const updateProcessingStep = (stepId, updates) => {
    useAppStore.setState((state) => ({
      processingSteps: {
        ...state.processingSteps,
        [stepId]: { ...state.processingSteps?.[stepId], ...updates },
      },
    }))
  }

  const downloadFromTemp = async (filename) => {
    if (!filename) return
    try {
      const response = await axiosClient.get(`/api/files/download/${filename}`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const openPreview = (data) => {
    setPreviewData(data)
    setShowPreview(true)
  }

  const closePreview = () => {
    setShowPreview(false)
  }

  const setSelectedFile = (file) => {
    useAppStore.setState({ selectedFile: file })
  }

  // EXACT STEPS FROM HOME.JSX - NO MODIFICATIONS
  const steps = useMemo(
    () => [
      {
        key: 'inspect',
        title: 'Load and Inspect Data',
        description: 'Upload and examine your dataset structure, columns, and initial insights',
        icon: Search,
        color: 'blue',
        delay: 0.1,
        category: 'cleaning',
        options: {
          actions: ['Preview Data', 'Column Info', 'Data Summary', 'Memory Usage'],
          filters: ['Show All Columns', 'Numeric Only', 'Text Only', 'Date Columns'],
          settings: { preview_rows: 100, include_dtypes: true },
        },
        onRun: async () => {
          if (!selectedId) return
          updateProcessingStep('inspect', { status: 'running' })
          try {
            const res = await axiosClient.post('/api/datatypes/preview', {
              filename: selectedId,
            })
            updateProcessingStep('inspect', { status: 'done', output: res.data })
            openPreview({
              before: res.data?.preview_data,
              after: res.data?.preview_data,
            })
          } catch (e) {
            updateProcessingStep('inspect', { status: 'error', error: e?.message })
          }
        },
        onPreview: async () => {
          if (!selectedId) return
          const res = await axiosClient.post('/api/datatypes/preview', {
            filename: selectedId,
          })
          openPreview({
            before: res.data?.preview_data,
            after: res.data?.preview_data,
          })
        },
        onDownload: async () =>
          downloadFromTemp(
            useAppStore.getState().processingSteps?.inspect?.output?.new_file,
          ),
      },
      {
        key: 'missing',
        title: 'Handle Missing Values',
        description: 'Detect, analyze, and resolve missing data points with intelligent strategies.',
        icon: Target,
        color: 'indigo',
        delay: 0.2,
        category: 'cleaning',
        options: {
          actions: [
            'Drop Rows',
            'Fill Forward',
            'Fill Backward',
            'Mean/Median Fill',
            'Custom Value',
          ],
          filters: ['All Columns', 'Numeric Only', 'Text Only', 'High Missing %', 'Low Missing %'],
          settings: { threshold: 0.5, method: 'mean', custom_value: '' },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return
          updateProcessingStep('missing', { status: 'running' })
          try {
            const actionMap = {
              'Drop Rows': 'drop',
              'Fill Forward': 'forward',
              'Fill Backward': 'backward',
              'Mean/Median Fill': 'mean',
              'Custom Value': 'custom',
            }
            const filterMap = (arr) =>
              arr?.includes('Numeric Only')
                ? 'numeric'
                : arr?.includes('Text Only')
                  ? 'text'
                  : 'all'
            const res = await missing.execute({
              filename: selectedId,
              action: actionMap[action] || 'mean',
              filter: filterMap(filters),
              threshold: settings?.threshold ?? 0.5,
              custom_value: settings?.custom_value ?? null,
            })
            updateProcessingStep('missing', { status: 'done', output: res })
            const newFile = res?.new_file || res?.data?.new_file
            if (newFile) {
              setSelectedFile({ filename: newFile, name: newFile })
            }
            const prev = await axiosClient.post('/api/datatypes/preview', {
              filename: res?.new_file || res?.data?.new_file || selectedId,
            })
            openPreview({
              before: [],
              after: Array.isArray(prev.data?.preview_data)
                ? prev.data.preview_data
                : [],
            })
          } catch (e) {
            updateProcessingStep('missing', { status: 'error', error: e?.message })
          }
        },
        onPreview: async () => {
          if (!selectedId) return
          const res = await axiosClient.post('/api/datatypes/preview', {
            filename: selectedId,
          })
          openPreview({
            before: [],
            after: Array.isArray(res.data?.preview_data) ? res.data.preview_data : [],
          })
        },
        onDownload: async () =>
          downloadFromTemp(
            useAppStore.getState().processingSteps?.missing?.output?.new_file,
          ),
      },
      {
        key: 'duplicates',
        title: 'Remove Duplicates',
        description: 'Identify and eliminate duplicate records to ensure data quality.',
        icon: Filter,
        color: 'purple',
        delay: 0.3,
        category: 'cleaning',
        options: {
          actions: [
            'Find Duplicates',
            'Remove All',
            'Keep First',
            'Keep Last',
            'Mark Duplicates',
          ],
          filters: ['Exclude ID (Default)', 'Key Columns Only', 'All Columns'],
          settings: { subset: [], keep: 'first', mark_only: false },
        },
        onRun: async ({ action, settings }) => {
          if (!selectedId) return
          updateProcessingStep('duplicates', { status: 'running' })
          try {
            const actionMap = {
              'Find Duplicates': 'find_duplicates',
              'Remove All': 'remove_all',
              'Keep First': 'keep_first',
              'Keep Last': 'keep_last',
              'Mark Duplicates': 'mark_duplicates',
            }
            const res = await duplicates.execute({
              filename: selectedId,
              action: actionMap[action] || 'remove_all',
              subset: Array.isArray(settings?.subset) ? settings.subset : [],
            })
            updateProcessingStep('duplicates', { status: 'done', output: res })
            const newFile = res?.new_file || res?.data?.new_file
            if (newFile) {
              setSelectedFile({ filename: newFile, name: newFile })
            }
            const prev = await axiosClient.post('/api/datatypes/preview', {
              filename: res?.new_file || res?.data?.new_file || selectedId,
            })
            openPreview({
              before: [],
              after: Array.isArray(prev.data?.preview_data)
                ? prev.data.preview_data
                : [],
            })
          } catch (e) {
            updateProcessingStep('duplicates', { status: 'error', error: e?.message })
          }
        },
        onPreview: async ({ settings }) => {
          if (!selectedId) return
          const res = await axiosClient.post('/api/duplicates/preview', {
            filename: selectedId,
            subset: Array.isArray(settings?.subset) ? settings.subset : null,
            preview_limit: 100,
          })
          const raw = Array.isArray(res.data?.preview) ? res.data.preview : []
          openPreview({
            before: [],
            after: raw.map((r) => ({ row_index: r?.row_index, ...(r?.data || {}) })),
          })
        },
        onDownload: async () =>
          downloadFromTemp(
            useAppStore.getState().processingSteps?.duplicates?.output?.new_file,
          ),
      },
      {
        key: 'types',
        title: 'Correct Data Types',
        description: 'Optimize column data types for better performance and accuracy',
        icon: Type,
        color: 'blue',
        delay: 0.4,
        category: 'cleaning',
        options: {
          actions: [
            'Auto Detect',
            'Convert to Numeric',
            'Convert to Date',
            'Convert to Category',
            'Custom Type',
          ],
          filters: [
            'All Columns',
            'Object Type',
            'Numeric Type',
            'DateTime Type',
            'Mixed Types',
          ],
          settings: { auto_convert: true, date_format: 'infer', errors: 'coerce' },
        },
        onRun: async ({ action, settings }) => {
          if (!selectedId) return
          updateProcessingStep('types', { status: 'running' })
          try {
            const actionMap = {
              'Auto Detect': 'auto_detect',
              'Convert to Numeric': 'convert_to_numeric',
              'Convert to Date': 'convert_to_datetime',
              'Convert to Category': 'convert_to_category',
              'Custom Type': 'custom_mapping',
            }
            const res = await axiosClient.post('/api/datatypes/convert', {
              filename: selectedId,
              action: actionMap[action] || 'auto_detect',
              settings,
            })
            updateProcessingStep('types', { status: 'done', output: res.data })
            const newFile = res?.data?.new_file
            if (newFile) {
              setSelectedFile({ filename: newFile, name: newFile })
            }
            openPreview({ before: [], after: res.data?.preview_data })
          } catch (e) {
            updateProcessingStep('types', { status: 'error', error: e?.message })
          }
        },
        onPreview: async () => {
          if (!selectedId) return
          const res = await axiosClient.post('/api/datatypes/preview', {
            filename: selectedId,
          })
          openPreview({ before: [], after: res.data?.preview_data })
        },
        onDownload: async () =>
          downloadFromTemp(useAppStore.getState().processingSteps?.types?.output?.new_file),
      },
      {
        key: 'normalize',
        title: 'Normalize / Scale Data',
        description: 'Apply scaling techniques to prepare data for machine learning.',
        icon: BarChart2,
        color: 'indigo',
        delay: 0.5,
        category: 'preparation',
        options: {
          actions: [
            'Standard Scale',
            'Min-Max Scale',
            'Robust Scale',
            'Unit Vector',
            'Quantile Transform',
          ],
          filters: ['Numeric Columns', 'High Range', 'Skewed Distribution', 'Selected Features'],
          settings: { method: 'standard', feature_range: [0, 1], with_mean: true },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return
          updateProcessingStep('normalize', { status: 'running' })
          try {
            const methodMap = {
              'Standard Scale': 'standard',
              'Min-Max Scale': 'minmax',
              'Robust Scale': 'robust',
              'Unit Vector': 'unit_vector',
              'Quantile Transform': 'quantile',
            }
            const res = await normalize.execute({
              filename: selectedId,
              settings: {
                method: methodMap[action] || settings?.method || 'standard',
                feature_range: settings?.feature_range ?? [0, 1],
                with_mean: settings?.with_mean ?? true,
                preview_limit: 100,
              },
              filters: filters?.length ? filters : ['Numeric Columns'],
            })
            updateProcessingStep('normalize', { status: 'done', output: res })
            const newFile = res?.new_file || res?.data?.new_file
            if (newFile) {
              setSelectedFile({ filename: newFile, name: newFile })
            }
            openPreview({ before: [], after: res?.preview_data })
          } catch (e) {
            updateProcessingStep('normalize', { status: 'error', error: e?.message })
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return
          const methodMap = {
            'Standard Scale': 'standard',
            'Min-Max Scale': 'minmax',
            'Robust Scale': 'robust',
            'Unit Vector': 'unit_vector',
            'Quantile Transform': 'quantile',
          }
          const res = await axiosClient.post('/api/normalize/preview', {
            filename: selectedId,
            settings: {
              method: methodMap[action] || settings?.method || 'standard',
              feature_range: settings?.feature_range ?? [0, 1],
              with_mean: settings?.with_mean ?? true,
              preview_limit: 100,
            },
            filters: filters?.length ? filters : ['Numeric Columns'],
          })
          openPreview({ before: [], after: res.data?.preview_data })
        },
        onDownload: async () =>
          downloadFromTemp(
            useAppStore.getState().processingSteps?.normalize?.output?.new_file,
          ),
      },
      {
        key: 'outliers',
        title: 'Handle Outliers',
        description: 'Detect and manage statistical outliers that could affect your analysis.',
        icon: TrendingUp,
        color: 'purple',
        delay: 0.6,
        category: 'preparation',
        options: {
          actions: [
            'IQR Method',
            'Z-Score',
            'Modified Z-Score',
            'Isolation Forest',
            'Remove Outliers',
          ],
          filters: [
            'Numeric Columns',
            'High Variance',
            'Distribution Based',
            'Custom Threshold',
          ],
          settings: { method: 'iqr', threshold: 3, action: 'flag' },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return
          updateProcessingStep('outliers', { status: 'running' })
          try {
            const methodMap = {
              'IQR Method': 'iqr',
              'Z-Score': 'zscore',
              'Modified Z-Score': 'modified_zscore',
              'Isolation Forest': 'isolation_forest',
            }
            const act = action === 'Remove Outliers' ? 'remove' : settings?.action || 'flag'
            const res = await outliers.execute({
              filename: selectedId,
              method: methodMap[action] || settings?.method || 'iqr',
              settings: { threshold: settings?.threshold ?? 3, action: act, preview_limit: 100 },
              filters: filters?.length ? filters : ['Numeric Columns'],
            })
            updateProcessingStep('outliers', { status: 'done', output: res })
            const newFile = res?.new_file || res?.data?.new_file
            if (newFile) {
              setSelectedFile({ filename: newFile, name: newFile })
            }
            openPreview({ before: [], after: res?.preview_data })
          } catch (e) {
            updateProcessingStep('outliers', { status: 'error', error: e?.message })
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return
          const methodMap = {
            'IQR Method': 'iqr',
            'Z-Score': 'zscore',
            'Modified Z-Score': 'modified_zscore',
            'Isolation Forest': 'isolation_forest',
          }
          const act = action === 'Remove Outliers' ? 'remove' : settings?.action || 'flag'
          const res = await axiosClient.post('/api/outliers/preview', {
            filename: selectedId,
            method: methodMap[action] || settings?.method || 'iqr',
            settings: { threshold: settings?.threshold ?? 3, action: act, preview_limit: 100 },
            filters: filters?.length ? filters : ['Numeric Columns'],
          })
          openPreview({ before: [], after: res.data?.preview_data })
        },
        onDownload: async () =>
          downloadFromTemp(
            useAppStore.getState().processingSteps?.outliers?.output?.new_file,
          ),
      },
      {
        key: 'features',
        title: 'Feature Engineering',
        description:
          'Create new features and transform existing ones for better insights.',
        icon: Layers,
        color: 'blue',
        delay: 1,
        category: 'preparation',
        options: {
          actions: [
            'Polynomial Features',
            'Interaction Terms',
            'Binning',
            'Date Features',
            'Text Features',
          ],
          filters: [
            'Numeric Features',
            'Date Columns',
            'Text Columns',
            'Selected Columns',
          ],
          settings: { degree: 2, include_bias: false, interaction_only: false },
        },
        onRun: async ({ action, filters, settings }) => {
          if (!selectedId) return
          updateProcessingStep('features', { status: 'running' })
          try {
            const actionMap = {
              'Polynomial Features': 'polynomial',
              'Interaction Terms': 'interaction',
              'Binning': 'binning',
              'Date Features': 'date',
              'Text Features': 'text',
            }
            const feSettings = {
              action: actionMap[action] || settings?.action || 'polynomial',
              degree: settings?.degree ?? 2,
              include_bias: !!settings?.include_bias,
              interaction_only: !!settings?.interaction_only,
              binning_strategy: settings?.binning_strategy || 'equal_width',
              bins: settings?.bins ?? 5,
              date_parts: settings?.date_parts || ['year', 'month', 'day', 'weekday'],
              text_options: settings?.text_options || {
                use_tfidf: false,
                max_features: 100,
              },
              selected_columns: settings?.selected_columns || null,
              preview_limit: 100,
            }
            const res = await features.execute({
              filename: selectedId,
              filters: filters?.length ? filters : ['Numeric Features'],
              settings: feSettings,
            })
            updateProcessingStep('features', { status: 'done', output: res })
            const newFile = res?.new_file || res?.data?.new_file
            if (newFile) {
              setSelectedFile({ filename: newFile, name: newFile })
            }
            openPreview({ before: [], after: res?.preview_data })
          } catch (e) {
            updateProcessingStep('features', { status: 'error', error: e?.message })
          }
        },
        onPreview: async ({ action, filters, settings }) => {
          if (!selectedId) return
          const actionMap = {
            'Polynomial Features': 'polynomial',
            'Interaction Terms': 'interaction',
            'Binning': 'binning',
            'Date Features': 'date',
            'Text Features': 'text',
          }
          const feSettings = {
            action: actionMap[action] || settings?.action || 'polynomial',
            degree: settings?.degree ?? 2,
            include_bias: !!settings?.include_bias,
            interaction_only: !!settings?.interaction_only,
            binning_strategy: settings?.binning_strategy || 'equal_width',
            bins: settings?.bins ?? 5,
            date_parts: settings?.date_parts || ['year', 'month', 'day', 'weekday'],
            text_options: settings?.text_options || {
              use_tfidf: false,
              max_features: 100,
            },
            selected_columns: settings?.selected_columns || null,
            preview_limit: 100,
          }
          const res = await axiosClient.post('/api/features/preview', {
            filename: selectedId,
            filters: filters?.length ? filters : ['Numeric Features'],
            settings: feSettings,
          })
          openPreview({ before: [], after: res.data?.preview_data })
        },
        onDownload: async () =>
          downloadFromTemp(
            useAppStore.getState().processingSteps?.features?.output?.new_file,
          ),
      },
      {
        key: 'dax',
        title: 'DAX Computations',
        description: 'Apply DAX-like computations.',
        icon: Zap,
        color: 'indigo',
        delay: 0.6,
        category: 'analysis',
        options: {
          actions: ['Generate DAX Queries'],
          filters: ['All Columns'],
          settings: { min_queries: 10, max_queries: 30, preview_limit: 10 },
        },
        onRun: async ({ settings }) => {
          if (!selectedId) return
          updateProcessingStep('dax', { status: 'running' })
          try {
            const res = await dax.execute({
              filename: selectedId,
              settings: {
                min_queries: settings?.min_queries ?? 10,
                max_queries: settings?.max_queries ?? 30,
                preview_limit: 100,
              },
            })
            updateProcessingStep('dax', { status: 'done', output: res })
            openPreview({ before: [], after: res?.queries })
          } catch (e) {
            updateProcessingStep('dax', { status: 'error', error: e?.message })
          }
        },
        onPreview: async ({ settings }) => {
          if (!selectedId) return
          const res = await axiosClient.post('/api/dax/generate', {
            filename: selectedId,
            settings: {
              min_queries: settings?.min_queries ?? 10,
              max_queries: settings?.max_queries ?? 30,
              preview_limit: 100,
            },
          })
          openPreview({ before: [], after: res.data?.queries })
        },
        onDownload: async () =>
          downloadFromTemp(useAppStore.getState().processingSteps?.dax?.output?.new_file),
      },
    ],
    [selectedId, missing.execute, duplicates.execute, normalize.execute, outliers.execute, features.execute, dax.execute],
  )

  return (
    <div className="w-full space-y-6">
      {/* File Selector */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text)',
            minWidth: '100px',
          }}
        >
          Choose File:
        </div>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <select
            value={selectedId || ''}
            onChange={(e) => {
              const filename = e.target.value
              if (filename) {
                setSelectedFile({ filename, name: filename })
              }
            }}
            style={{
              width: '100%',
              appearance: 'none',
              background: 'white',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px 8px 12px',
              fontSize: '14px',
              color: 'var(--text)',
              cursor: 'pointer',
              paddingRight: '28px',
            }}
          >
            <option value="">Select a file...</option>
            {filesQuery.isLoading && <option disabled>Loading files...</option>}
            {filesList.length > 0 ? (
              filesList.map((file) => (
                <option key={file.filename} value={file.filename}>
                  {file.filename}
                </option>
              ))
            ) : !filesQuery.isLoading && (
              <option disabled>No files found</option>
            )}
          </select>
          <ChevronDown
            size={14}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--text2)',
            }}
          />
        </div>
      </div>

      {!selectedFile?.filename ? (
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '40px 24px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: '8px',
            }}
          >
            No Dataset Selected
          </div>
          <div
            style={{
              fontSize: '14px',
              color: 'var(--text2)',
            }}
          >
            Please select a dataset from the dropdown above to begin processing
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#4361ee',
              }}
            />
            <div
              style={{
                fontSize: '14px',
                color: 'var(--text)',
              }}
            >
              Processing: <strong>{selectedFile.filename}</strong>
            </div>
          </div>

          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '20px',
            }}
          >
            <ProcessingPanel steps={steps} hasSelectedFile={Boolean(selectedFile)} />
          </div>
        </>
      )}

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-50"
            onClick={closePreview}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mx-auto mt-16 w-[90vw] max-w-5xl"
              onClick={(e) => e.stopPropagation()}>
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
    </div>
  )
}
