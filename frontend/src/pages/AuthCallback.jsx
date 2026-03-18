import React, { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../stores/useAuthStore'
import { meApi } from '../api/authApi'

export default function AuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const setUser = useAuthStore((s) => s.setUser)

  useEffect(() => {
    const run = async () => {
      const err = params.get('error')
      if (err) {
        navigate(`/login?error=${encodeURIComponent(err)}`, { replace: true })
        return
      }
      const access = params.get('access_token')
      const refresh = params.get('refresh_token')
      if (access) {
        setToken(access)
        try { localStorage.setItem('refresh_token', refresh || '') } catch {}
        try {
          const me = await meApi()
          setUser(me)
        } catch {
          // If fetching profile fails, still proceed to app; Navbar will hydrate later
        }
        navigate('/', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    }
    run()
  }, [params, navigate, setToken, setUser])

  return (
    <div style={{ maxWidth: 420, margin: '64px auto', padding: 24, color:'#fff' }}>
      Completing sign-in...
    </div>
  )
}
