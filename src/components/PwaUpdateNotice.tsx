import { useEffect, useState } from 'react'
import { activatePwaUpdate } from '@/lib/pwaUpdates'

/** Announce updated PWA code without interrupting an open candidate form. */
export default function PwaUpdateNotice() {
  const [available, setAvailable] = useState(() =>
    document.documentElement.dataset.appUpdateAvailable === 'true'
  )
  useEffect(() => {
    const show = () => setAvailable(true)
    window.addEventListener('dating-app-update', show)
    if (document.documentElement.dataset.appUpdateAvailable === 'true') show()
    return () => window.removeEventListener('dating-app-update', show)
  }, [])

  if (!available) return null
  return (
    <div role="status" style={{
      position: 'fixed', bottom: 20, left: 16, right: 16, zIndex: 9000,
      maxWidth: 520, margin: '0 auto', padding: '14px 16px', borderRadius: 14,
      background: '#25203a', border: '1px solid rgba(196,181,253,0.65)',
      boxShadow: '0 10px 35px rgba(0,0,0,0.45)', color: '#f1f0ff',
      fontFamily: "'Noto Sans KR',sans-serif",
    }}>
      <p style={{ fontSize: 13, lineHeight: 1.65, margin: '0 0 12px' }}>
        새 버전이 준비됐어요. 작성 중인 내용이 있다면 먼저 저장해 주세요.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void activatePwaUpdate()}
          style={{
            flex: 1, border: 0, borderRadius: 9, padding: '10px 14px',
            background: '#a78bfa', color: '#16102b', fontSize: 13,
            fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}>
          새 버전으로 새로고침
        </button>
        <button type="button" onClick={() => setAvailable(false)}
          style={{
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'transparent', borderRadius: 9,
            color: '#f1f0ff', padding: '10px 14px', fontSize: 13,
            fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}>
          나중에
        </button>
      </div>
    </div>
  )
}
