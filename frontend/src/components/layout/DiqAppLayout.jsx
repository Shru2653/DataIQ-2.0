import React, { useState, useEffect } from 'react'
import DiqSidebar from './DiqSidebar'
import DiqTopbar from './DiqTopbar'
import useAuthStore from '../../stores/useAuthStore'
import { meApi } from '../../api/authApi'

export default function DiqAppLayout({
  children,
  pageTitle = 'My Files',
  pageSubtitle = '3 datasets · 8 cleaned outputs',
  showTopbar = true,
  topbarProps = {},
}) {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  // Fetch user data on component mount if not already loaded
  useEffect(() => {
    if (!user) {
      const fetchUser = async () => {
        try {
          const userData = await meApi()
          setUser(userData)
        } catch (err) {
          console.error('Failed to load user data:', err)
        }
      }
      fetchUser()
    }
  }, [user, setUser])

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar */}
      <DiqSidebar />

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg)',
        }}
      >
        {/* Top Bar */}
        {showTopbar && (
          <DiqTopbar
            title={pageTitle}
            subtitle={pageSubtitle}
            {...topbarProps}
          />
        )}

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 24px 24px 24px',
            background: 'var(--bg)',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
