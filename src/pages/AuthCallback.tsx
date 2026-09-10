import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { S } from '@/styles'
import type { Session } from '@supabase/supabase-js'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [linkError, setLinkError] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
    const code = url.searchParams.get('code')
    const type = hashParams.get('type') ?? url.searchParams.get('type')
    const next = hashParams.get('next') ?? url.searchParams.get('next')
    const hasAuthParams = Boolean(code || hashParams.get('access_token') || hashParams.get('refresh_token') || type)
    const shouldSetPassword = type === 'invite' || type === 'recovery' || next === '/set-password'
    let handled = false
    let disposed = false
    let fallbackTimer: number | undefined

    const failLink = () => {
      if (handled || disposed) return
      handled = true
      setLinkError(true)
      window.history.replaceState(null, '', '/auth/callback?error=invalid_link')
    }

    // A stale session must not turn an expired invite into a password reset.
    if (['error', 'error_code', 'error_description'].some((key) => hashParams.has(key) || url.searchParams.has(key))) {
      failLink()
      return
    }

    const needsPasswordSetup = (session: Session) => {
      return shouldSetPassword || Boolean(session.user.invited_at && !session.user.user_metadata?.password_set)
    }

    const redirectWithSession = (session: Session) => {
      if (handled || disposed) return
      handled = true
      navigate(needsPasswordSetup(session) ? '/set-password' : '/', { replace: true })
    }

    const waitForAutoSession = () => {
      if (fallbackTimer) return

      fallbackTimer = window.setTimeout(async () => {
        if (handled || disposed) return
        try {
          const { data: { session }, error } = await supabase.auth.getSession()
          if (!error && session) {
            redirectWithSession(session)
            return
          }
          failLink()
        } catch {
          failLink()
        }
      }, 2500)
    }

    const finishRedirect = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          failLink()
          return
        }
      }

      const { data: { session }, error } = await supabase.auth.getSession()
      if (disposed || handled) return
      if (error) { failLink(); return }

      if (session) {
        redirectWithSession(session)
        return
      }

      if (!hasAuthParams) {
        if (shouldSetPassword) { failLink(); return }
        handled = true
        navigate('/login', { replace: true })
        return
      }

      waitForAutoSession()
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (handled || disposed) return
      if (event === 'PASSWORD_RECOVERY') {
        handled = true
        navigate('/set-password', { replace: true })
        return
      }

      if (session) {
        redirectWithSession(session)
      }
    })

    void finishRedirect().catch(failLink)

    return () => {
      disposed = true
      subscription.unsubscribe()
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
    }
  }, [navigate])

  if (linkError) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ ...S.card, maxWidth: 360, textAlign: 'center' }}>
        <h1 style={{ color: '#f1f0ff', fontSize: 20 }}>링크를 사용할 수 없어요</h1>
        <p role="alert" style={{ color: '#a9a3c9', fontSize: 14, lineHeight: 1.8 }}>
          링크가 만료되었거나 이미 사용되었을 수 있어요.
          초대받은 경우 관리자에게 새 초대 링크를 요청해 주세요.
          초대를 수락했지만 비밀번호를 설정하지 못한 경우에도 관리자에게 설정 링크 재발급을 요청할 수 있어요.
          이미 가입했다면 기존 계정으로 로그인해 주세요.
        </p>
        <Link to="/login" style={{ ...S.btnPrimary, display: 'inline-block', textDecoration: 'none' }}>로그인으로 이동</Link>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'rgba(255,255,255,0.5)' }}>
      <div>로그인 처리 중...</div>
    </div>
  )
}
