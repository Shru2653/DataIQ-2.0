import React, { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  fadeIn,
  fadeInUp,
  staggerContainer,
} from '../utils/animations'

import FileUploader from '../components/files/FileUploader'
import FileList from '../components/files/FileList'
import DatasetVersionList from '../components/dashboard/DatasetVersionList'
import { useAppStore } from '../stores/useAppStore'
import { useFiles } from '../hooks/useFiles'
import axiosClient from '../api/axiosClient'

const fadeInUp_var = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 }
}

export default function Home() {
  const serverFiles = useAppStore((s) => s.serverFiles)
  const setServerFiles = useAppStore((s) => s.setServerFiles)
  const selectedFile = useAppStore((s) => s.selectedFile)
  const setSelectedFile = useAppStore((s) => s.setSelectedFile)

  const { filesQuery, upload } = useFiles()
  const [uploadProgress, setUploadProgress] = useState(0)
  const [fileTab, setFileTab] = useState('uploaded')
  const [selectedOriginal, setSelectedOriginal] = useState('')
  const [cleanedCounts, setCleanedCounts] = useState({})

  // Load server files list
  useEffect(() => {
    const loadServerFiles = async () => {
      try {
        const res = await axiosClient.get('/files')
        const raw = res.data?.files || []
        const names = (Array.isArray(raw) ? raw : [])
          .map((f) => (typeof f === 'string' ? f : f?.filename || f?.name))
          .filter(Boolean)
        setServerFiles(
          names
            .filter((name) => !String(name).includes('/'))
            .map((name) => ({ filename: String(name), name: String(name) }))
        )
      } catch (err) {
        console.error('Failed to fetch files:', err)
      }
    }
    loadServerFiles()
  }, [setServerFiles])

  // Fetch cleaned file counts
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const counts = {}
        for (const file of serverFiles) {
          const fname = file?.filename || file?.name
          if (!fname) continue
          try {
            const res = await axiosClient.get('/cleaned-files', { params: { original: fname } })
            counts[fname] = (res.data?.files || []).length
          } catch (e) {
            counts[fname] = 0
          }
        }
        setCleanedCounts(counts)
      } catch (err) {
        console.error('Error fetching cleaned counts:', err)
      }
    }
    if (serverFiles.length > 0) fetchCounts()
  }, [serverFiles])

  const serverFilesList = useMemo(() => serverFiles, [serverFiles])
  const selectedId = useMemo(
    () => selectedFile?.filename || selectedFile?.name,
    [selectedFile]
  )

  const handleUpload = async (file) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      setUploadProgress(0)
      await upload.mutateAsync(formData, {
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setUploadProgress(Math.max(percent, 10))
        },
      })
      setUploadProgress(0)
      // Refresh files list
      const res = await axiosClient.get('/files')
      const raw = res.data?.files || []
      const names = (Array.isArray(raw) ? raw : [])
        .map((f) => (typeof f === 'string' ? f : f?.filename || f?.name))
        .filter(Boolean)
      setServerFiles(
        names
          .filter((name) => !String(name).includes('/'))
          .map((name) => ({ filename: String(name), name: String(name) }))
      )
    } catch (err) {
      console.error('Upload error:', err)
      setUploadProgress(0)
    }
  }

  const downloadFromTemp = async (filename) => {
    try {
      const response = await axiosClient.get(`/api/files/files/${filename}`, {
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
      console.error('Download error:', err)
    }
  }

  return (
    <div className="w-full space-y-8">
      {/* Upload Section */}
      <motion.section
        initial={fadeInUp_var.initial}
        animate={fadeInUp_var.animate}
        transition={fadeInUp_var.transition}
        className="w-full"
      >
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '20px',
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '3px',
              }}
            >
              Upload Section
            </div>
            <div
              style={{
                fontSize: '14px',
                color: 'var(--text2)',
              }}
            >
              Upload datasets to begin analysis and processing.
            </div>
          </div>

          <FileUploader
            onSelect={handleUpload}
            uploading={upload.isPending}
            progress={uploadProgress}
            accept=".csv,.xlsx,.xls,.json,.parquet"
          />
        </div>
      </motion.section>

      {/* Server Files Section */}
      <motion.section
        initial={fadeInUp_var.initial}
        animate={fadeInUp_var.animate}
        transition={fadeInUp_var.transition}
        className="w-full"
      >
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '20px',
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '3px',
              }}
            >
              Server Files
            </div>
            <div
              style={{
                fontSize: '14px',
                color: 'var(--text2)',
              }}
            >
              Select uploaded or cleaned files from the server.
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setFileTab('uploaded')}
              className="diq-tab"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                padding: '6px 16px',
                borderRadius: '20px',
                border: fileTab === 'uploaded' ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: fileTab === 'uploaded' ? 'var(--accent)' : 'transparent',
                color: fileTab === 'uploaded' ? 'white' : 'var(--text2)',
                cursor: 'pointer',
                transition: 'all 0.15s ease-out',
              }}
            >
              Uploaded Files
            </button>
            <button
              onClick={() => setFileTab('cleaned')}
              className="diq-tab"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                padding: '6px 16px',
                borderRadius: '20px',
                border: fileTab === 'cleaned' ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: fileTab === 'cleaned' ? 'var(--accent)' : 'transparent',
                color: fileTab === 'cleaned' ? 'white' : 'var(--text2)',
                cursor: 'pointer',
                transition: 'all 0.15s ease-out',
              }}
            >
              Cleaned Files
            </button>
          </div>

          {/* File Lists */}
          {fileTab === 'uploaded' && (
            <div>
              {filesQuery.isLoading ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--text3)',
                    fontSize: '13px',
              }}>
                  Loading files…
                </div>
              ) : (
                <FileList
                  files={serverFilesList}
                  selectedId={selectedId}
                  onSelect={(f) => setSelectedFile(f)}
                  onDelete={undefined}
                  cleanedCounts={cleanedCounts}
                  onViewCleaned={(file) => {
                    setSelectedFile(file)
                    const name = file?.filename || file?.name
                    if (name) setSelectedOriginal(name)
                    setFileTab('cleaned')
                  }}
                />
              )}
            </div>
          )}

          {fileTab === 'cleaned' && (
            <div>
              <DatasetVersionList
                onSelectFile={(file) => {
                  setSelectedFile({
                    filename: file.filename,
                    name: file.filename,
                    dataset_name: file.dataset_name,
                    version: file.version,
                    operation: file.operation,
                  })
                  console.log('Selected version:', file)
                }}
                onDownloadFile={(filename) => downloadFromTemp(filename)}
              />
            </div>
          )}
        </div>
      </motion.section>
    </div>
  )
}
