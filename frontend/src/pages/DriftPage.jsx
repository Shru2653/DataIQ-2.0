import React, { useEffect, useMemo, useState } from 'react'
import DriftDetectionPanel from '../components/dashboard/DriftDetectionPanel'
import { useAppStore } from '../stores/useAppStore'
import axiosClient from '../api/axiosClient'

export default function DriftPage() {
  const selectedFile = useAppStore((s) => s.selectedFile)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [cleanedFiles, setCleanedFiles] = useState([])

  const selectedFilename = selectedFile?.filename || selectedFile?.name || ''

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [uploadedRes, cleanedRes] = await Promise.all([
          axiosClient.get('/files'),
          axiosClient.get('/cleaned-files'),
        ])
        const uploaded = (uploadedRes.data?.files || [])
          .map((f) => (typeof f === 'string' ? f : f?.filename || f?.name))
          .filter(Boolean)
          .sort()

        const cleaned = (cleanedRes.data?.files || [])
          .map((f) => (typeof f === 'string' ? f : f?.filename || f?.name))
          .filter(Boolean)
          .sort()

        if (!alive) return
        setUploadedFiles(uploaded)
        setCleanedFiles(cleaned)
      } catch {
        // keep page usable
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const uploadedOptions = useMemo(
    () => uploadedFiles.map((name) => ({ filename: String(name) })),
    [uploadedFiles]
  )
  const cleanedOptions = useMemo(
    () => cleanedFiles.map((name) => ({ filename: String(name) })),
    [cleanedFiles]
  )

  return (
    <div className="w-full space-y-6">
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
        }}
      >
        <DriftDetectionPanel
          filename={selectedFilename || null}
          rawOptions={uploadedOptions}
          cleanedOptions={cleanedOptions}
        />
      </div>
    </div>
  )
}
