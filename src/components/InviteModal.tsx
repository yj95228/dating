import { useEffect, useRef, useState, type FormEvent } from 'react'
import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { S } from '@/styles'

const errorMessages: Record<string, string> = {
  invalid_email: '올바른 이메일 주소를 입력해 주세요.',
  unauthorized: '로그인이 만료되었어요. 다시 로그인해 주세요.',
  forbidden: '관리자만 사용자를 초대할 수 있어요.',
  role_check_failed: '권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.',
  already_registered: '이미 가입된 사용자예요. 기존 계정으로 로그인해 주세요.',
  rate_limited: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
}
const defaultError = '초대 링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요.'

export default function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const linkRef = useRef<HTMLTextAreaElement>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const createInvite = async (event: FormEvent) => {
    event.preventDefault()
    if (busy.current) return
    const normalizedEmail = email.trim().toLowerCase()
    setInviteUrl('')
    setCopyMessage('')
    setError('')
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(errorMessages.invalid_email)
      return
    }
    busy.current = true
    setLoading(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-invite', {
        body: { email: normalizedEmail },
      })
      if (!mounted.current) return
      if (invokeError) {
        let message = defaultError
        const response = invokeError.context
        if (response instanceof Response) {
          if (response.status === 401) message = errorMessages.unauthorized
          if (response.status === 403) message = errorMessages.forbidden
          try {
            const failure = await response.json()
            message = errorMessages[failure?.code] ?? message
          } catch { /* Gateway/network errors may not have a JSON body. */ }
        }
        if (mounted.current) setError(message)
        return
      }
      if (typeof data?.inviteUrl !== 'string' || !data.inviteUrl) {
        setError(defaultError)
        return
      }
      setEmail(normalizedEmail)
      setInviteUrl(data.inviteUrl)
    } catch {
      if (mounted.current) setError(defaultError)
    } finally {
      busy.current = false
      if (mounted.current) setLoading(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      if (mounted.current) setCopyMessage('초대 링크를 복사했어요.')
    } catch {
      if (!mounted.current) return
      linkRef.current?.focus()
      linkRef.current?.select()
      setCopyMessage('자동 복사가 안 돼요. 아래 링크를 직접 선택해 복사해 주세요.')
    }
  }

  return (
    <Modal title="사용자 초대" onClose={onClose}>
      <form onSubmit={createInvite} noValidate>
        <p style={{ color: '#a9a3c9', fontSize: 13, lineHeight: 1.7, margin: '0 0 18px' }}>
          상대 이메일로 초대 링크를 만들고 카톡 등으로 전달해 주세요.
          초대받은 사람은 이름·사진을 제외한 인물 정보를 볼 수 있어요.
        </p>
        <label htmlFor="invite-email" style={{ display: 'block', color: '#c0b8e8', fontSize: 13, marginBottom: 8 }}>상대 이메일</label>
        <input id="invite-email" type="email" autoFocus autoComplete="off" maxLength={254}
          placeholder="이메일 입력" value={email} disabled={loading} style={S.input}
          onChange={(event) => { setEmail(event.target.value); setInviteUrl(''); setCopyMessage(''); setError('') }} />
        <button type="submit" disabled={loading} style={{ ...S.btnPrimary, width: '100%', marginTop: 12, opacity: loading ? 0.5 : 1 }}>
          {loading ? '만드는 중...' : inviteUrl ? '초대 링크 다시 만들기' : '초대 링크 만들기'}
        </button>
        {error && <p role="alert" style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
      </form>
      {inviteUrl && (
        <div style={{ marginTop: 20 }}>
          <label htmlFor="invite-link" style={{ display: 'block', color: '#c0b8e8', fontSize: 13, marginBottom: 8 }}>초대 링크</label>
          <textarea id="invite-link" ref={linkRef} readOnly value={inviteUrl} rows={3}
            onFocus={(event) => event.currentTarget.select()} style={{ ...S.input, resize: 'none', fontSize: 12 }} />
          <button type="button" onClick={copyLink} style={{ ...S.btnPrimary, width: '100%', marginTop: 8 }}>링크 복사</button>
          <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.7 }}>
            이 링크로 해당 계정에 접속할 수 있으니 {email}의 당사자에게만 전달해 주세요.
            링크가 만료되면 같은 이메일로 다시 만들어 주세요. 창을 닫으면 링크가 화면에서 지워져요.
          </p>
        </div>
      )}
      {copyMessage && <p role="status" style={{ color: '#c4b5fd', fontSize: 13 }}>{copyMessage}</p>}
    </Modal>
  )
}
