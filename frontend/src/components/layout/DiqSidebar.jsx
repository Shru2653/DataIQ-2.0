import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import useAuthStore from '../../stores/useAuthStore'

export default function DiqSidebar({ isOpen, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  const navSections = [
    {
      title: 'Workspace',
      items: [
        { id: 'files', label: 'Files', path: '/' },
        { id: 'process', label: 'Clean & Process', path: '/process' },
      ],
    },
    {
      title: 'Analytics',
      items: [
        { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
        { id: 'quality', label: 'Data Quality', path: '/quality' },
        { id: 'drift', label: 'Drift Detection', path: '/drift' },
      ],
    },
    {
      title: 'Tools',
      items: [
        { id: 'chatbot', label: 'AI Chatbot', path: '/chatbot' },
        { id: 'versions', label: 'Versions', path: '/versions' },
      ],
    },
  ]

  const isActive = (path) => location.pathname === path

  const handleNavClick = (path) => {
    navigate(path)
    if (typeof onClose === 'function') onClose()
  }

  const handleLogout = () => {
    try {
      logout()
    } catch (err) {
      console.error('Logout error:', err)
    }
    navigate('/login', { replace: true })
  }

  const userInitials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <aside
      style={{
        width: '212px',
        flexShrink: 0,
        background: 'var(--nav)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 40,
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo Bar */}
      <div
        style={{
          padding: '14px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: '#4361ee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" />
            <rect x="10" y="2" width="6" height="6" rx="1.5" fill="rgba(255,255,255,0.5)" />
            <rect x="2" y="10" width="6" height="6" rx="1.5" fill="rgba(255,255,255,0.5)" />
            <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--nav-text)', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
            DataIQ
          </div>
          <div style={{ fontSize: '12px', color: 'var(--nav-muted)', fontFamily: 'monospace', marginTop: '3px' }}>
            v2.0
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          padding: '10px 8px',
          overflowY: 'auto',
        }}
      >
        {navSections.map((section, sectionIdx) => (
          <div
            key={section.title}
            style={{
              marginTop: sectionIdx === 0 ? 0 : 8,
            }}
          >
            <div
              style={{
                fontSize: '10.5px',
                fontWeight: 600,
                color: 'var(--nav-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                padding: '8px 6px 6px',
              }}
            >
              {section.title}
            </div>
            {section.items.map((item) => (
              <div
                key={item.id}
                onClick={() => handleNavClick(item.path)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 8px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  lineHeight: 1.25,
                  color: isActive(item.path) ? 'var(--accent)' : 'var(--nav-muted)',
                  cursor: 'pointer',
                  marginBottom: '2px',
                  background: isActive(item.path) ? 'var(--accent-light)' : 'transparent',
                  transition: 'all 0.15s ease-out',
                  borderLeft: isActive(item.path) ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive(item.path)) {
                    e.currentTarget.style.background = 'var(--nav-active)'
                    e.currentTarget.style.color = 'var(--nav-text)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive(item.path)) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--nav-muted)'
                  }
                }}
              >
                {item.label}
              </div>
            ))}
          </div>
        ))}
      </nav>

      {/* User Bar */}
      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
        }}
      >
        <div
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 600,
            color: 'white',
            flexShrink: 0,
          }}
        >
          {userInitials}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--nav-text)' }}>
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--nav-muted)', marginTop: '2px' }}>
            {user?.email || 'No email'}
          </div>
        </div>
      </div>
    </aside>
  )
}
