import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { S } from '@/styles'

export default function AcceptInvitePage() {
  const navigate = useNavigate()
  const [tokenHash, setTokenHash] = useState(() =>
    new URLSearchParams(new URL(window.location.href).hash.slice(1)).get('token_hash') ?? '')
  const [linkType] = useState<'invite' | 'recovery'>(() =>
    new URLSearchParams(new URL(window.location.href).hash.slice(1)).get('type') === 'recovery' ? 'recovery' : 'invite')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const acceptInvite = async () => {
    if (busy.current || !tokenHash) return
    busy.current = true
    setLoading(true)
    setError('')
    try {
      // Keep this out of effects: opening a preview must not consume the invite.
      const { data, error: authError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: linkType,
      })
      if (!mounted.current) return
      if (authError || !data.session) {
        setError('초대를 확인하지 못했어요. 링크가 만료되었거나 이미 사용되었을 수 있어요. 비밀번호 설정을 마쳤다면 아래 로그인으로 이동을 눌러 주세요. 설정을 마치지 못했다면 관리자에게 새 링크를 요청해 주세요.')
        return
      }
      setTokenHash('')
      window.history.replaceState(null, '', '/auth/invite')
      navigate('/set-password', { replace: true })
    } catch {
      if (mounted.current) setError('연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.')
    } finally {
      busy.current = false
      if (mounted.current) setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ ...S.card, width: '100%', maxWidth: 360 }}>
        <h1 style={{ color: '#f1f0ff', fontSize: 22 }}>소개팅 주선 노트 초대</h1>
        {tokenHash ? (
          <>
            <p style={{ color: '#a9a3c9', fontSize: 14, lineHeight: 1.8 }}>
              {linkType === 'recovery' ? '설정 이어가기를 누르면' : '초대 수락을 누르면'} 비밀번호와 성별을 설정할 수 있어요.
              초대받은 본인만 진행해 주세요.
            </p>
            <button type="button" onClick={acceptInvite} disabled={loading}
              style={{ ...S.btnPrimary, width: '100%', padding: 14, opacity: loading ? 0.5 : 1 }}>
              {loading ? '초대 확인 중...' : linkType === 'recovery' ? '설정 이어가기' : '초대 수락'}
            </button>
          </>
        ) : (
          <p style={{ color: '#a9a3c9', fontSize: 14, lineHeight: 1.8 }}>
            초대 정보가 없는 주소예요. 전달받은 초대 링크 전체를 다시 열어 주세요.
          </p>
        )}
        {error && <p role="alert" style={{ color: '#f87171', fontSize: 13, lineHeight: 1.7 }}>{error}</p>}
        <Link to="/login" style={{ display: 'inline-block', marginTop: 16, color: '#c4b5fd', fontSize: 13 }}>로그인으로 이동</Link>
      </div>
    </div>
  )
}
