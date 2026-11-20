import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { S } from '@/styles'

type ConsentStatus = {
  hasLink: boolean
  public: boolean
  decision: 'pending' | 'approved' | 'declined' | 'withdrawn' | 'needs-review'
  decidedAt: string | null
  managementAgreed: boolean
  deletionRequestedAt: string | null
}
const errorFrom = async (error: unknown, fallback: string): Promise<string> => {
  if (!error || typeof error !== 'object' || !('context' in error)) return fallback
  const response = (error as { context?: unknown }).context
  if (!(response instanceof Response)) return fallback
  try {
    const result: unknown = await response.clone().json()
    if (result && typeof result === 'object' && 'error' in result
      && typeof result.error === 'string') return result.error
  } catch { /* ignore */ }
  return fallback
}
const managementLabel = (state: ConsentStatus) => {
  if (state.deletionRequestedAt) return '삭제 요청'
  if (state.managementAgreed) return '동의 완료'
  return state.decision === 'pending' ? '동의 대기' : '동의 없음'
}
const disclosureLabel = (state: ConsentStatus) => {
  if (state.public) return '공개 중'
  if (state.hasLink && state.managementAgreed && state.decision === 'needs-review') return '재동의 필요'
  return '비공개'
}

export default function GuestConsentAdmin({ personId, profileVersion }:
  { personId: number; profileVersion: string }) {
  // Bind each status response to its requested person and profile.
  // A previous person's status must never be painted during navigation.
  const [loaded, setLoaded] = useState<{
    personId: number
    profileVersion: string
    value: ConsentStatus
  } | null>(null)
  const state = loaded?.personId === personId && loaded.profileVersion === profileVersion
    ? loaded.value : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const invoke = async (body: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke('guest-consent', { body })
    if (invokeError || data?.error) throw Error(await errorFrom(invokeError,
      typeof data?.error === 'string' ? data.error : '요청이 실패했어요.'))
    return data as Record<string, unknown>
  }
  const refresh = async () => {
    const result = await invoke({ action: 'admin-status', personId })
    setLoaded({ personId, profileVersion, value: result as unknown as ConsentStatus })
  }
  useEffect(() => {
    let active = true
    setError('')
    setNotice('')
    setLoaded(null)
    void invoke({ action: 'admin-status', personId }).then(result => {
      if (active) setLoaded({ personId, profileVersion, value: result as unknown as ConsentStatus })
    }).catch(e => {
      if (active) {
        setLoaded(null)
        setError(e instanceof Error ? e.message : '동의 상태를 확인하지 못했어요.')
      }
    })
    return () => { active = false }
    // Refresh when any disclosed profile field changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, profileVersion])
  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await task() } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 처리하지 못했어요.')
    } finally { setBusy(false) }
  }
  const copyLink = () => run(async () => {
    const result = await invoke({ action: 'admin-link', personId })
    if (typeof result.url !== 'string') throw Error('링크를 생성하지 못했어요.')
    await navigator.clipboard.writeText(result.url)
    await refresh()
    setNotice('개인 동의 링크를 복사했어요. 본인에게 직접 보내거나 중간 주선자를 통해 전달해 주세요.')
  })
  const stop = () => run(async () => {
    if (!window.confirm('이 프로필의 외부 공개를 중단할까요?')) return
    await invoke({ action: 'admin-hide', personId })
    await refresh()
    setNotice('비회원 공개를 중단했어요.')
  })

  return (
    <section style={{ ...S.card, padding: 16, marginBottom: 22 }}>
      <strong style={{ display: 'block', fontSize: 15, marginBottom: 12 }}>
        🔐 개인정보 동의 관리
      </strong>
      {state ? (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 13, color: '#c9c4df' }}>정보 보관·이용</span>
            <strong style={{ fontSize: 13,
              color: state.deletionRequestedAt ? '#fca5a5'
                : state.managementAgreed ? '#6ee7b7' : '#a9a3c9' }}>
              {managementLabel(state)}
            </strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 13, color: '#c9c4df' }}>외부 프로필 공개</span>
            <strong style={{ fontSize: 13,
              color: state.public ? '#6ee7b7'
                : state.managementAgreed && state.decision === 'needs-review' ? '#fcd34d'
                : '#a9a3c9' }}>
              {disclosureLabel(state)}
            </strong>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: '#a9a3c9', marginBottom: 14 }}>불러오는 중...</p>
      )}
      {state?.deletionRequestedAt && (
        <p role="alert" style={{ color: '#fca5a5', fontSize: 12, lineHeight: 1.8 }}>
          당사자가 이름·사진 등 저장 정보의 삭제를 요청했어요.
          관리자에서 해당 인물과 매칭 이력, 업로드 사진의 보관 상태를 확인하고
          필요한 삭제 작업을 처리해 주세요. 이 알림만으로 자동 삭제되지 않아요.
        </p>
      )}
      {state?.decidedAt && (
        <p style={{ fontSize: 11, color: '#a9a3c9', marginBottom: 10 }}>
          최근 응답: {new Date(state.decidedAt).toLocaleString('ko-KR')}
        </p>
      )}
      <div style={{ display: 'grid',
        gridTemplateColumns: state?.public ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
        gap: 8, alignItems: 'stretch' }}>
        <button type="button" disabled={busy} style={{ ...S.btnPrimary, minWidth: 0 }}
          onClick={() => void copyLink()}>
          🔗 {state?.hasLink ? '동의 링크 복사' : '동의 링크 만들기'}
        </button>
        {state?.public && (
          <button type="button" disabled={busy} className="btn-outline"
            style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}
            onClick={() => void stop()}>공개 중단</button>
        )}
      </div>
      {notice && <p role="status" style={{ fontSize: 12, color: '#6ee7b7', marginTop: 12 }}>{notice}</p>}
      {error && <p role="alert" style={{ fontSize: 12, color: '#f87171', marginTop: 12 }}>{error}</p>}
    </section>
  )
}
