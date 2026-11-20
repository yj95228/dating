import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { S } from '@/styles'

const base64Bytes = (base64: string) => {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  return Uint8Array.from(binary, ch => ch.charCodeAt(0))
}
const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('guest-share', { body })
  if (error || data?.error) {
    const response = error?.context
    if (response instanceof Response) {
      let message = ''
      try {
        const payload = await response.clone().json()
        if (typeof payload?.error === 'string') message = payload.error
      } catch { /* Use fallback */ }
      if (message) throw Error(message)
    }
    throw Error(typeof data?.error === 'string' ? data.error : '알림 서버 요청에 실패했어요.')
  }
  return data as Record<string, unknown>
}
export default function SettingsPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await task() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했어요.') }
    finally { setBusy(false) }
  }
  const enablePush = () => run(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      throw Error('이 기기나 브라우저에서는 푸시 알림을 사용할 수 없어요.')
    }
    if (window.self !== window.top) {
      throw Error('Vercel 미리보기가 다른 페이지 안에서 열렸어요. Preview 주소를 새 브라우저 탭으로 직접 열고 다시 시도해 주세요.')
    }
    if (Notification.permission === 'denied') {
      throw Error('이 사이트의 알림 권한이 차단되어 있어요. 브라우저 주소창의 사이트 설정에서 알림을 허용한 뒤 다시 시도해 주세요.')
    }
    const permission = Notification.permission === 'granted'
      ? 'granted' : await Notification.requestPermission()
    if (permission !== 'granted') throw Error(
      '알림 권한이 허용되지 않았어요. 브라우저 사이트 설정을 확인해 주세요. iPhone은 홈 화면에 추가한 PWA에서 허용할 수 있어요.')
    const data = await invoke({ action: 'push-key' })
    if (typeof data.publicKey !== 'string') throw Error('푸시 서버 키가 필요해요.')
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: base64Bytes(data.publicKey),
    })
    await invoke({ action: 'subscribe', subscription: subscription.toJSON() })
    setNotice('이 기기의 새 관심 신청 푸시 알림을 켰어요.')
  })
  return (
    <main style={{ paddingBottom: 60 }}>
      <button type="button" className="btn-icon" onClick={() => navigate('/requests')}
        style={{ marginBottom: 14 }}>← 신청 관리로 돌아가기</button>
      <h2 style={{ fontSize: 20 }}>⚙️ 설정</h2>
      <section style={{ ...S.card, padding: 16 }}>
        <h3 style={{ fontSize: 16, marginTop: 0 }}>🔔 알림 설정</h3>
        <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.7 }}>
          이 기기에서 새 관심 신청 알림을 받고 싶을 때만 설정해 주세요.
          브라우저별로 한 번씩 설정해야 할 수 있어요.
        </p>
        <button type="button" disabled={busy} onClick={enablePush}
          style={{ ...S.btnPrimary, width: '100%' }}>
          {busy ? '설정 중...' : '이 기기에서 푸시 알림 받기'}
        </button>
        {notice && <p role="status" style={{ fontSize: 12, color: '#6ee7b7' }}>{notice}</p>}
        {error && <p role="alert" style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
      </section>
    </main>
  )
}
