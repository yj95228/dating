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
const statusLabel = (state: ConsentStatus) => {
  if (state.deletionRequestedAt) return '🗑️ 전체 동의 철회 · 개인정보 삭제 요청'
  if (state.public) return '✅ 정보 보관 및 프로필 공개 동의'
  if (state.managementAgreed && state.decision === 'needs-review') return '⚠️ 내용 변경 · 다시 동의 필요'
  if (state.managementAgreed) return '🗂️ 정보 보관만 동의 · 외부 비공개'
  return state.decision === 'pending' ? '⏳ 동의 대기' : '🔒 전체 동의 미확인 · 비공개'
}

export default function GuestConsentAdmin({ personId, profileVersion }:
  { personId: number; profileVersion: string }) {
  const [state, setState] = useState<ConsentStatus | null>(null)
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
    setState(result as unknown as ConsentStatus)
  }
  useEffect(() => {
    let active = true
    setError('')
    void invoke({ action: 'admin-status', personId }).then(result => {
      if (active) setState(result as unknown as ConsentStatus)
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '동의 상태를 확인하지 못했어요.') })
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
  const rotate = () => run(async () => {
    if (!window.confirm('기존 동의 링크와 공개 동의를 무효화하고 새로운 링크를 만들까요?')) return
    const result = await invoke({ action: 'admin-rotate', personId })
    if (typeof result.url !== 'string') throw Error('새 동의 링크를 만들지 못했어요.')
    await navigator.clipboard.writeText(result.url)
    await refresh()
    setNotice('기존 링크를 폐기하고 새 동의 링크를 복사했어요.')
  })
  const stop = () => run(async () => {
    if (!window.confirm('이 프로필의 외부 공개를 중단할까요?')) return
    await invoke({ action: 'admin-hide', personId })
    await refresh()
    setNotice('비회원 공개를 중단했어요.')
  })

  return (
    <section style={{ ...S.card, padding: 16, marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ fontSize: 15 }}>🔐 개인정보 동의 관리</strong>
        <span style={{ fontSize: 12, color: state?.public ? '#6ee7b7' : '#fcd34d' }}>
          {state ? statusLabel(state) : '불러오는 중...'}
        </span>
      </div>
      <p style={{ fontSize: 12, color: '#a9a3c9', lineHeight: 1.8, marginBottom: 14 }}>
        이름·사진 등 정보 보관과 다른 사람에게 보여줄 프로필을 동의받아요.
        공개에 동의하지 않으면 외부 목록에는 표시되지 않아요.
      </p>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" disabled={busy} style={{ ...S.btnPrimary, flexGrow: 1 }}
          onClick={() => void copyLink()}>
          🔗 {state?.hasLink ? '동의 링크 복사' : '동의 링크 만들기'}
        </button>
        {state?.hasLink && (
          <button type="button" disabled={busy} className="btn-outline"
            onClick={() => void rotate()}>링크 재발급</button>
        )}
        {state?.hasLink && (
          <button type="button" disabled={busy} className="btn-outline"
            onClick={() => void stop()}>공개 중단</button>
        )}
      </div>
      {notice && <p role="status" style={{ fontSize: 12, color: '#6ee7b7', marginTop: 12 }}>{notice}</p>}
      {error && <p role="alert" style={{ fontSize: 12, color: '#f87171', marginTop: 12 }}>{error}</p>}
    </section>
  )
}
