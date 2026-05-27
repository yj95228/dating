import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const url = new URL(window.location.href)
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
    const code = url.searchParams.get('code')
    const type = hashParams.get('type') ?? url.searchParams.get('type')
    const next = hashParams.get('next') ?? url.searchParams.get('next')
    const hasAuthParams = Boolean(code || hashParams.get('access_token') || hashParams.get('refresh_token') || type)
    const shouldSetPassword = type === 'invite' || type === 'recovery' || next === '/set-password'
    let handled = false
    let fallbackTimer: number | undefined

    const needsPasswordSetup = (session: Session) => {
      return shouldSetPassword || Boolean(session.user.invited_at && !session.user.user_metadata?.password_set)
    }

    const redirectWithSession = (session: Session) => {
      if (handled) return
      handled = true
      navigate(needsPasswordSetup(session) ? '/set-password' : '/', { replace: true })
    }

    const waitForAutoSession = () => {
      if (fallbackTimer) return

      fallbackTimer = window.setTimeout(async () => {
        if (handled) return

        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          redirectWithSession(session)
          return
        }

        handled = true
        navigate('/login', { replace: true })
      }, 2500)
    }

    const finishRedirect = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('Failed to exchange auth code:', error.message)
          handled = true
          navigate('/login', { replace: true })
          return
        }
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        redirectWithSession(session)
        return
      }

      if (!hasAuthParams) {
        handled = true
        navigate('/login', { replace: true })
        return
      }

      waitForAutoSession()
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        handled = true
        navigate('/set-password', { replace: true })
        return
      }

      if (session) {
        redirectWithSession(session)
      }
    })

    finishRedirect()

    return () => {
      subscription.unsubscribe()
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
    }
  }, [navigate])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'rgba(255,255,255,0.5)' }}>
      <div>로그인 처리 중...</div>
    </div>
  )
}
