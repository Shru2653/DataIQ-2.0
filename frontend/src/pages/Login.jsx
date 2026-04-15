import React, { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { loginApi, meApi } from '../api/authApi'
import useAuthStore from '../stores/useAuthStore'
import axiosClient from '../api/axiosClient'

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const data = await loginApi({ email, password });
      const token = data?.access_token || data?.token;
      if (!token) throw new Error('No token returned');

      setToken(token);

      // Optionally save refresh token if remember me is checked
      if (rememberMe && data?.refresh_token) {
        try {
          localStorage.setItem('refresh_token', data.refresh_token);
        } catch (err) {
          console.error('Failed to save refresh token:', err);
        }
      }

      // Load user profile
      try {
        const me = await meApi();
        setUser(me);
      } catch (err) {
        console.error('Failed to load user profile:', err);
      }

      navigate(from, { replace: true });
    } catch (err) {
      const errorMsg = err?.data?.detail || err?.response?.data?.detail || err.message || 'Login failed';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const base = axiosClient.defaults.baseURL || 'http://127.0.0.1:8000';
    window.location.href = `${base}/api/auth/google/login`;
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}
    >
      {/* Left Panel - Features & Branding (light theme) */}
      <div
        style={{
          width: '45%',
          flexShrink: 0,
          background: 'var(--bg)',
          borderRight: '1px solid var(--border)',
          padding: '60px 48px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          color: 'var(--text)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle grid + soft accent blobs */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(67, 97, 238, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(67, 97, 238, 0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            pointerEvents: 'none',
            opacity: 0.85,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '-50%',
            right: '-20%',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(67, 97, 238, 0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-30%',
            left: '-10%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(67, 97, 238, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              marginBottom: '56px',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #4361ee 0%, #3a52d5 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(67, 97, 238, 0.22)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="8" height="8" rx="2" fill="white" />
                <rect x="13" y="3" width="8" height="8" rx="2" fill="rgba(255,255,255,0.4)" />
                <rect x="3" y="13" width="8" height="8" rx="2" fill="rgba(255,255,255,0.4)" />
                <rect x="13" y="13" width="8" height="8" rx="2" fill="white" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>DataIQ</div>
              <div style={{ fontSize: '11px', color: 'var(--text2)', fontFamily: 'monospace', marginTop: '2px' }}>Intelligent Data Platform</div>
            </div>
          </div>

          {/* Main Heading */}
          <div style={{ marginBottom: '48px' }}>
            <p
              style={{
                fontSize: '26px',
                fontWeight: 800,
                lineHeight: '1.25',
                marginBottom: '16px',
                color: 'var(--text)',
                letterSpacing: '-0.5px',
              }}
            >
              Transform your data quality journey
            </p>
            <p
              style={{
                fontSize: '15px',
                color: 'var(--text2)',
                lineHeight: '1.6',
              }}
            >
              Upload, clean, analyze, and understand your datasets with AI-powered intelligence. Get insights in seconds.
            </p>
          </div>

          {/* Features Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px',
            }}
          >
            {[
              { icon: '⚡', title: 'Automated Cleaning', desc: 'Handle missing values & duplicates' },
              { icon: '🤖', title: 'AI Chatbot', desc: 'Ask questions in plain English' },
              { icon: '📊', title: 'Smart Dashboard', desc: 'Auto-generated insights & KPIs' },
              { icon: '📦', title: 'Version Control', desc: 'Track every transformation' },
            ].map((feature, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 1px 2px rgba(15, 17, 23, 0.04)',
                  transition: 'all 0.3s ease',
                  cursor: 'default',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'var(--accent-light)'
                  e.currentTarget.style.borderColor = 'var(--border-active)'
                  e.currentTarget.style.transform = 'translateY(-4px)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'var(--card)'
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>{feature.icon}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: 'var(--text)' }}>
                  {feature.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                  {feature.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div
        style={{
          flex: 1,
          background: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '40px',
          position: 'relative',
        }}
      >
        {/* Decorative top element */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(67, 97, 238, 0.05) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ maxWidth: '400px', width: '100%', position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ marginBottom: '36px', textAlign: 'center' }}>
            <p
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: '#0f1117',
                marginBottom: '8px',
                letterSpacing: '-0.5px',
              }}
            >
              Welcome back
            </p>
            <p
              style={{
                fontSize: '14px',
                color: '#6b7280',
                lineHeight: '1.5',
              }}
            >
              Sign in to your DataIQ account and continue your data journey
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                border: '1px solid #fca5a5',
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: '13px',
                color: '#b02020',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '16px' }}>⚠️</span>
              {error}
            </div>
          )}

          {/* Email Input */}
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 700,
                color: '#1f2937',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError('')
              }}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '2px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '14px',
                fontFamily: 'inherit',
                background: '#ffffff',
                color: '#0f1117',
                boxSizing: 'border-box',
                transition: 'all 0.3s ease',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#4361ee'
                e.target.style.boxShadow = '0 0 0 3px rgba(67, 97, 238, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Password Input */}
          <div style={{ marginBottom: '12px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 700,
                color: '#1f2937',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit()
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  paddingRight: '42px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  background: '#ffffff',
                  color: '#0f1117',
                  boxSizing: 'border-box',
                  transition: 'all 0.3s ease',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#4361ee'
                  e.target.style.boxShadow = '0 0 0 3px rgba(67, 97, 238, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e5e7eb'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#4361ee'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = '#9ca3af'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Forgot Password & Remember Me */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#6b7280' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: '#4361ee' }}
              />
              Remember me
            </label>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
              }}
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#4361ee',
                textDecoration: 'none',
                transition: 'opacity 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.target.style.opacity = '0.8'
              }}
              onMouseOut={(e) => {
                e.target.style.opacity = '1'
              }}
            >
              Forgot password?
            </a>
          </div>

          {/* Login Button */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: loading ? '#9ca3af' : 'linear-gradient(135deg, #4361ee 0%, #3a52d5 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(67, 97, 238, 0.3)',
              transition: 'all 0.3s ease',
              letterSpacing: '0.3px',
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = '0 6px 20px rgba(67, 97, 238, 0.4)'
              }
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = '0 4px 12px rgba(67, 97, 238, 0.3)'
            }}
          >
            {loading ? (
              <>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
                Signing in...
              </>
            ) : (
              'Sign in to DataIQ'
            )}
          </button>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              margin: '24px 0',
              opacity: 0.6,
            }}
          >
            <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>or continue with</span>
            <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
          </div>

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              padding: '11px 16px',
              background: '#ffffff',
              color: '#1f2937',
              border: '2px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#f9fafb'
              e.currentTarget.style.borderColor = '#4361ee'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(67, 97, 238, 0.15)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ffffff'
              e.currentTarget.style.borderColor = '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google
          </button>

          {/* Sign up link */}
          <p
            style={{
              fontSize: '13px',
              color: '#6b7280',
              textAlign: 'center',
              marginTop: '24px',
            }}
          >
            Don't have an account?{' '}
            <Link
              to="/register"
              style={{
                color: '#4361ee',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'opacity 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.target.style.opacity = '0.8'
              }}
              onMouseOut={(e) => {
                e.target.style.opacity = '1'
              }}
            >
              Create account free
            </Link>
          </p>
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          input::placeholder {
            color: #d1d5db;
          }
        `}
      </style>
    </div>
  )
}