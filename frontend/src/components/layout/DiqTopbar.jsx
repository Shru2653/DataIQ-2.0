import React from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import useAuthStore from '../../stores/useAuthStore'

export default function DiqTopbar({
  title = 'My Files',
  subtitle = '3 datasets · 8 cleaned outputs',
  showActions = true,
  onUploadClick,
  onDashboardClick,
}) {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div
      style={{
        padding: '12px 22px',
        background: 'var(--nav)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'white',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--nav-muted)',
          }}
        >
          {subtitle}
        </div>
      </div>

      {showActions && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <button
            onClick={handleLogout}
            style={{
              fontSize: '14px',
              padding: '8px 14px',
              borderRadius: '6px',
              border: 'none',
              background: '#ff4444',
              color: 'white',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease-out',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ff2222'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ff4444'
            }}
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  )
}
