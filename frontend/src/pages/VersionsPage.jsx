import React from 'react'
import DatasetVersionList from '../components/dashboard/DatasetVersionList'
import { useAppStore } from '../stores/useAppStore'

export default function VersionsPage() {
  const { selectedFile, versions } = useAppStore((s) => ({
    selectedFile: s.selectedFile,
    versions: s.versions || [],
  }))

  return (
    <div className="w-full space-y-6">
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
            Please select a dataset from the Files section to view dataset versions and history
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
                background: '#7c3aed',
              }}
            />
            <div
              style={{
                fontSize: '14px',
                color: 'var(--text)',
              }}
            >
              Dataset Versions: <strong>{selectedFile.filename}</strong>
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
            <DatasetVersionList versions={versions || []} />
          </div>
        </>
      )}
    </div>
  )
}
