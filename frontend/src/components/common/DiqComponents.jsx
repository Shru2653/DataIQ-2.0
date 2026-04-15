// ═══════════════════════════════════════════════════════════════════════════
// DataIQ UI Component Library
// Reusable components matching the design system
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react'
import '../../styles/design-tokens.css'

// ─────────────────────────────────────────────────────────────────────────────
// Card Component
// ─────────────────────────────────────────────────────────────────────────────

export function DiqCard({
  children,
  className = '',
  title,
  subtitle,
  style = {},
}) {
  return (
    <div
      className="diq-card"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        ...style,
      }}
    >
      {title && <div className="diq-card-h">{title}</div>}
      {subtitle && <div className="diq-card-sub">{subtitle}</div>}
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge Component
// ─────────────────────────────────────────────────────────────────────────────

export function DiqBadge({
  children,
  variant = 'blue', // blue, green, amber, red, purple, gray
  style = {},
}) {
  const variants = {
    blue: { background: 'var(--accent-light)', color: 'var(--accent)' },
    green: { background: '#e8f8f1', color: '#1a7a4a' },
    amber: { background: '#fff4e0', color: '#8a5500' },
    red: { background: '#fdecea', color: '#b02020' },
    purple: { background: 'color-mix(in_srgb, var(--icon-violet), #ffffff 92%)', color: 'var(--icon-violet)' },
    gray: { background: 'color-mix(in_srgb, var(--border), #ffffff 55%)', color: 'var(--text2)' },
  }

  return (
    <span
      className="diq-badge"
      style={{
        fontSize: '10.5px',
        padding: '2px 9px',
        borderRadius: '20px',
        whiteSpace: 'nowrap',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Button Component
// ─────────────────────────────────────────────────────────────────────────────

export function DiqButton({
  children,
  onClick,
  variant = 'default', // default, primary
  disabled = false,
  style = {},
  className = '',
}) {
  const variants = {
    default: {
      background: 'var(--card)',
      border: '1px solid var(--border)',
      color: 'var(--text)',
    },
    primary: {
      background: 'var(--accent)',
      border: '1px solid var(--accent)',
      color: 'white',
    },
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: '11.5px',
        padding: '6px 14px',
        borderRadius: '20px',
        fontFamily: 'inherit',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease-out',
        opacity: disabled ? 0.6 : 1,
        ...variants[variant],
        ...style,
      }}
      className={className}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Component
// ─────────────────────────────────────────────────────────────────────────────

export function DiqTabs({ tabs, activeTab, onTabChange }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            fontSize: '12px',
            fontWeight: 600,
            padding: '6px 16px',
            borderRadius: '20px',
            border: activeTab === tab.id ? '1px solid var(--accent)' : '1px solid var(--border)',
            background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
            color: activeTab === tab.id ? 'white' : 'var(--text2)',
            cursor: 'pointer',
            transition: 'all 0.15s ease-out',
          }}
          onMouseEnter={(e) => {
            if (activeTab !== tab.id) {
              e.target.style.background = 'var(--accent-light)'
              e.target.style.color = 'var(--accent)'
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== tab.id) {
              e.target.style.background = 'transparent'
              e.target.style.color = 'var(--text2)'
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card Component
// ─────────────────────────────────────────────────────────────────────────────

export function DiqKpi({
  label,
  value,
  subtitle,
  valueColor = 'var(--text)',
  style = {},
}) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '16px',
        ...style,
      }}
    >
      <div
        style={{
          fontSize: '10.5px',
          fontWeight: 600,
          color: 'var(--text2)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '22px',
          fontWeight: 700,
          color: valueColor,
          fontFamily: 'monospace',
          marginBottom: '4px',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '10.5px',
          color: 'var(--text3)',
        }}
      >
        {subtitle}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload Zone Component
// ─────────────────────────────────────────────────────────────────────────────

export function DiqUploadZone({
  onSelect,
  accept = '.csv,.xlsx,.xls',
  style = {},
}) {
  return (
    <div
      onClick={() => document.getElementById('hidden-file-input')?.click()}
      style={{
        border: '2px dashed var(--border-med)',
        borderRadius: 'var(--radius)',
        padding: '32px 20px',
        textAlign: 'center',
        background: 'var(--card)',
        cursor: 'pointer',
        transition: 'all 0.15s ease-out',
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.background = 'var(--accent-light)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-med)'
        e.currentTarget.style.background = 'var(--card)'
      }}
    >
      <input
        id="hidden-file-input"
        type="file"
        accept={accept}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onSelect(e.target.files[0])
          }
        }}
        style={{ display: 'none' }}
      />
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'var(--accent-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 2v20M2 12h20" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div
        style={{
          fontSize: '13.5px',
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: '3px',
        }}
      >
        Click to upload or drag and drop
      </div>
      <div
        style={{
          fontSize: '11.5px',
          color: 'var(--text3)',
        }}
      >
        CSV, XLSX, or XLS (max 100MB)
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue Row Component
// ─────────────────────────────────────────────────────────────────────────────

export function DiqIssueRow({
  dotColor,
  name,
  count,
  badge,
  style = {},
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        marginBottom: '7px',
        background: 'var(--card)',
        ...style,
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          flexShrink: 0,
          background: dotColor,
        }}
      />
      <div
        style={{
          fontSize: '12.5px',
          flex: 1,
          color: 'var(--text)',
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: '12px',
          fontFamily: 'monospace',
          color: 'var(--text2)',
        }}
      >
        {count}
      </div>
      {badge && <DiqBadge variant={badge.variant}>{badge.label}</DiqBadge>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tip Component
// ─────────────────────────────────────────────────────────────────────────────

export function DiqTip({ children, style = {} }) {
  return (
    <div
      style={{
        background: 'var(--yellow-bg)',
        border: '1px solid var(--yellow-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '10px 14px',
        fontSize: '11.5px',
        color: '#7a6200',
        marginTop: '4px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function DiqGridKpi({ children, style = {} }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '16px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function DiqGrid2({ children, style = {} }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function DiqActGrid({ children, style = {} }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
