import React, { useEffect, useMemo, useState } from 'react'
import DataQualityPanel from '../components/dashboard/DataQualityPanel'
import { useAppStore } from '../stores/useAppStore'
import axiosClient from '../api/axiosClient'

export default function QualityPage() {
  const selectedFile = useAppStore((s) => s.selectedFile)
  const setSelectedFile = useAppStore((s) => s.setSelectedFile)
  const [files, setFiles] = useState([])
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
        const cleaned = (cleanedRes.data?.files || [])
          .map((f) => (typeof f === 'string' ? f : f?.filename || f?.name))
          .filter(Boolean)
        if (!alive) return
        setFiles(uploaded.sort())
        setCleanedFiles(cleaned.sort())
      } catch {
        // keep page usable even if list fetch fails
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const fileOptions = useMemo(() => {
    const u = files.map((name) => ({ group: 'Uploaded', name }))
    const c = cleanedFiles.map((name) => ({ group: 'Cleaned', name }))
    return { uploaded: u, cleaned: c }
  }, [files, cleanedFiles])

  const handleSelect = (name) => {
    if (!name) return
    setSelectedFile({ filename: name, name })
  }

  return (
    <div className="w-full space-y-6">
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
          Choose file:
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 420 }}>
          <select
            value={selectedFilename}
            onChange={(e) => handleSelect(e.target.value)}
            style={{
              width: '100%',
              appearance: 'none',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              fontSize: '14px',
              color: 'var(--text)',
              cursor: 'pointer',
              paddingRight: '28px',
            }}
          >
            <option value="">Select a file…</option>
            {fileOptions.uploaded.length > 0 && (
              <optgroup label="Uploaded">
                {fileOptions.uploaded.map((o) => (
                  <option key={`u:${o.name}`} value={o.name}>{o.name}</option>
                ))}
              </optgroup>
            )}
            {fileOptions.cleaned.length > 0 && (
              <optgroup label="Cleaned">
                {fileOptions.cleaned.map((o) => (
                  <option key={`c:${o.name}`} value={o.name}>{o.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text3)' }}>
            ▾
          </span>
        </div>
        {selectedFilename && (
          <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
            Analyzing: <strong style={{ color: 'var(--text)' }}>{selectedFilename}</strong>
          </div>
        )}
      </div>

      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
        }}
      >
        <DataQualityPanel filename={selectedFilename || null} />
      </div>
    </div>
  )
}
