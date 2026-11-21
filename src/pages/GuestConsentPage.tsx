import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { S } from '@/styles'

type Profile = {
  gender: string
  year: string | null
  height: number | null
  location: string | null
  job: string | null
  is_direct: boolean
  public_ideal_type: string
  public_traits: string
}
type ProfileDraft = {
  year: string
  height: string
  location: string
  job: string
  public_ideal_type: string
  public_traits: string
}
const draftFromProfile = (profile: Profile): ProfileDraft => ({
  year: profile.year ?? '',
  height: profile.height == null ? '' : String(profile.height),
  location: profile.location ?? '',
  job: profile.job ?? '',
  public_ideal_type: profile.public_ideal_type,
  public_traits: profile.public_traits,
})
const validatedDraft = (draft: ProfileDraft) => {
  const year = draft.year.trim()
  const heightText = draft.height.trim()
  const location = draft.location.trim()
  const job = draft.job.trim()
  const ideal = draft.public_ideal_type.trim()
  const traits = draft.public_traits.trim()
  if (year && (!/^(19|20)\d{2}$/.test(year) || Number(year) > new Date().getFullYear()))
    throw Error('출생연도는 1900~올해 사이의 4자리 숫자로 입력해 주세요.')
  const height = heightText ? Number(heightText) : null
  if (height !== null && (!Number.isFinite(height) || height < 80 || height > 250
      || Math.round(height * 10) !== height * 10))
    throw Error('키는 80~250cm 사이에서 소수점 첫째 자리까지만 입력해 주세요.')
  if (location.length > 100 || job.length > 140 || ideal.length > 600 || traits.length > 1600)
    throw Error('입력 내용이 너무 길어요. 내용을 조금 줄여 주세요.')
  return { year: year || null, height,
    location: location || null, job: job || null,
    public_ideal_type: ideal, public_traits: traits }
}
type Decision = 'pending' | 'approved' | 'needs-review' | 'declined' | 'withdrawn'
type ConsentView = {
  profile: Profile
  active: boolean
  decision: Decision
  consentedAt: string | null
  policyVersion: string
  previewSignature: string
  managementSignature: string
  managementSummary: { nameStored: boolean; photoCount: number; fields: string[] }
  managementAgreed: boolean
  deletionRequested: boolean
  accessUrl: string | null
}
const messageFrom = async (error: unknown, fallback: string) => {
  if (!error || typeof error !== 'object' || !('context' in error)) return fallback
  const response = (error as { context?: unknown }).context
  if (!(response instanceof Response)) return fallback
  try {
    const result: unknown = await response.clone().json()
    if (result && typeof result === 'object' && 'error' in result
      && typeof result.error === 'string') return result.error
  } catch { /* parse error */ }
  return fallback
}
const fieldStyle = {
  display: 'block', width: '100%', background: 'rgba(255,255,255,0.055)',
  color: '#f1f0ff', border: '1px solid rgba(196,181,253,0.4)',
  borderRadius: 9, padding: '11px 12px', fontFamily: 'inherit',
  fontSize: 14, lineHeight: 1.6, boxSizing: 'border-box' as const,
}
const detail = (label: string, value: string | number | null | undefined) =>
  value == null || value === '' ? null : (
    <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)',
      gap: 8, padding: '6px 0', fontSize: 13, lineHeight: 1.65 }}>
      <strong style={{ color: '#a9a3c9' }}>{label}</strong>
      <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</span>
    </div>
  )

export default function GuestConsentPage() {
  const { token = '' } = useParams()
  // Read-only visual sample on this PR's Vercel preview host, never on production.
  const demoDecision = new URLSearchParams(window.location.search).get('demo')
  const demoMode = token === 'preview'
    && (demoDecision === 'approved' || demoDecision === 'declined' || demoDecision === 'pending')
    && /^dating-git-[a-z0-9-]+-yj95228s-projects[.]vercel[.]app$/.test(window.location.hostname)
  const [loaded, setLoaded] = useState<ConsentView | null>(() => demoMode ? {
    profile: { gender: 'female', year: '1996', height: 165, location: '서울',
      job: '사무직', is_direct: false, public_ideal_type: '운동을 좋아하는 사람',
      public_traits: '취미: 산책, 영화' },
    active: true, decision: demoDecision as 'approved' | 'declined' | 'pending',
    consentedAt: null, policyVersion: 'preview', previewSignature: '',
    managementSignature: '', managementSummary: { nameStored: false, photoCount: 0, fields: [] },
    managementAgreed: true, deletionRequested: false, accessUrl: '#preview',
  } : null)
  const [loading, setLoading] = useState(!demoMode)
  const [busy, setBusy] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [error, setError] = useState('')
  const [confirmedOwner, setConfirmedOwner] = useState(false)
  const [useAgreed, setUseAgreed] = useState(false)
  const [shareAgreed, setShareAgreed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ProfileDraft | null>(() => demoMode
    ? draftFromProfile({ gender: 'female', year: '1996', height: 165,
      location: '서울', job: '사무직', is_direct: false,
      public_ideal_type: '운동을 좋아하는 사람', public_traits: '취미: 산책, 영화' })
    : null)
  const [draftError, setDraftError] = useState('')
  const [draftTouched, setDraftTouched] = useState(false)

  const changeDraft = (key: keyof ProfileDraft, value: string) => {
    setDraftTouched(true)
    setDraft(current => current ? { ...current, [key]: value } : current)
  }
  const editField = (key: keyof ProfileDraft, label: string,
    multiline = false, maxLength = 1600) => (
    <label key={key} style={{ display: 'block', fontSize: 13, fontWeight: 600,
      lineHeight: 1.7, marginBottom: 12 }}>
      {label}
      {multiline ? (
        <textarea value={draft?.[key] ?? ''} onChange={event => changeDraft(key, event.target.value)}
          maxLength={maxLength} rows={key === 'public_traits' ? 4 : 3}
          style={{ ...fieldStyle, marginTop: 5, resize: 'vertical' }}/>
      ) : (
        <input type={key === 'height' ? 'number' : 'text'}
          inputMode={key === 'year' || key === 'height' ? 'numeric' : 'text'}
          min={key === 'height' ? 80 : undefined}
          max={key === 'height' ? 250 : undefined}
          step={key === 'height' ? 0.1 : undefined}
          value={draft?.[key] ?? ''} onChange={event => changeDraft(key,event.target.value)}
          maxLength={maxLength} style={{ ...fieldStyle, marginTop: 5 }}/>
      )}
    </label>
  )

  useEffect(() => {
    if (demoMode) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data, error: invokeError } = await supabase.functions.invoke('guest-consent', {
        body: { action: 'view', token },
      })
      if (cancelled) return
      if (invokeError || !data?.profile) {
        setError(await messageFrom(invokeError, '동의 링크를 확인하지 못했어요. 주선자에게 새 링크를 요청해 주세요.'))
      } else {
        setLoaded(data as ConsentView)
        setDraft(draftFromProfile((data as ConsentView).profile))
        setDraftTouched(false)
        setEditing(false)
        setDraftError('')
        setError('')
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [token, demoMode])

  const decide = async (decision: 'approved' | 'declined' | 'withdrawn' | 'withdraw-all') => {
    if (demoMode) {
      setError('미리보기에서는 동의 내용을 변경하지 않아요.')
      return
    }
    if (busy || !loaded) return
    if ((decision === 'approved' || decision === 'declined') &&
        (!confirmedOwner || !useAgreed || shareAgreed !== (decision === 'approved'))) return
    if ((decision === 'approved' || decision === 'declined') && editing) {
      setError('프로필 수정 내용을 먼저 확인해 주세요.')
      return
    }
    let editedProfile: ReturnType<typeof validatedDraft> | undefined
    if ((decision === 'approved' || decision === 'declined') && draft && draftTouched) {
      try {
        const checked = validatedDraft(draft)
        const existing = loaded.profile
        if (checked.year !== existing.year || checked.height !== existing.height
            || checked.location !== existing.location || checked.job !== existing.job
            || checked.public_ideal_type !== existing.public_ideal_type
            || checked.public_traits !== existing.public_traits) editedProfile = checked
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '수정한 정보를 확인해 주세요.')
        return
      }
    }
    if (decision === 'withdraw-all' &&
        !window.confirm('정보 보관 동의까지 철회하고 저장된 정보의 삭제를 요청할까요? 주선자가 확인하고 처리해요.')) return
    setBusy(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('guest-consent', {
        body: { action: 'decide', token, decision,
          confirmedOwner, useAgreed, shareAgreed,
          policyVersion: loaded.policyVersion,
          previewSignature: loaded.previewSignature,
          managementSignature: loaded.managementSignature,
          ...(editedProfile ? { editedProfile } : {}) },
      })
      if (invokeError || !data?.saved) {
        setError(await messageFrom(invokeError, '처리하지 못했어요. 다시 시도해 주세요.'))
      } else {
        setLoaded(previous => previous && { ...previous,
          decision: data.decision as Decision,
          managementAgreed: data.managementAgreed === true,
          deletionRequested: data.deletionRequested === true,
          consentedAt: data.decision === 'approved' ? new Date().toISOString() : null,
          accessUrl: typeof data.accessUrl === 'string' ? data.accessUrl : null,
          profile: data.profile && typeof data.profile === 'object'
            ? data.profile as Profile : previous.profile,
          previewSignature: typeof data.previewSignature === 'string'
            ? data.previewSignature : previous.previewSignature,
          managementSignature: typeof data.managementSignature === 'string'
            ? data.managementSignature : previous.managementSignature,
        })
        if (data.profile && typeof data.profile === 'object')
          setDraft(draftFromProfile(data.profile as Profile))
        setDraftTouched(false)
        setEditing(false)
        setDraftError('')
        setConfirmedOwner(false)
        setUseAgreed(false)
        setShareAgreed(false)
        setShowDetails(false)
        setLinkCopied(false)
      }
    } catch {
      setError('연결이 원활하지 않아요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  const copyProfileLink = async () => {
    if (demoMode) {
      setError('미리보기 화면이라 실제 개인 링크는 발급되지 않아요.')
      return
    }
    if (!loaded?.accessUrl) return
    try {
      await navigator.clipboard.writeText(loaded.accessUrl)
      setLinkCopied(true)
      setError('')
    } catch {
      setError('링크를 복사하지 못했어요. 브라우저에서 복사를 허용해 주세요.')
    }
  }

  const profile = loaded?.profile
  const displayProfile = !editing && draftTouched && draft && profile
    ? { ...profile,
      year: draft.year.trim() || null,
      height: draft.height.trim() && Number.isFinite(Number(draft.height))
        ? Number(draft.height) : null,
      location: draft.location.trim() || null,
      job: draft.job.trim() || null,
      public_ideal_type: draft.public_ideal_type.trim(),
      public_traits: draft.public_traits.trim(),
    } : profile
  const hasEdits = Boolean(profile && displayProfile && (
    profile.year !== displayProfile.year || profile.height !== displayProfile.height
    || profile.location !== displayProfile.location || profile.job !== displayProfile.job
    || profile.public_ideal_type !== displayProfile.public_ideal_type
    || profile.public_traits !== displayProfile.public_traits
  ))
  const approved = loaded?.decision === 'approved' && loaded.managementAgreed
  const isReview = loaded?.decision === 'needs-review'
  const internalOnly = loaded?.managementAgreed && !approved
  const completed = Boolean(loaded?.managementAgreed && !loaded.deletionRequested &&
    (loaded.decision === 'approved' || loaded.decision === 'declined'))

  return (
    <main style={{ minHeight: '100vh', maxWidth: 560, margin: '0 auto',
      padding: '32px 18px 80px', color: '#f1f0ff',
      fontFamily: "'Noto Sans KR', sans-serif" }}>
      {demoMode && (
        <p role="status" style={{ fontSize: 12, color: '#fcd34d', lineHeight: 1.75,
          margin: '0 0 16px', textAlign: 'center' }}>
          디자인 미리보기예요. 실제 동의나 열람 권한이 저장된 것은 아니에요.
        </p>
      )}
      {completed && !showDetails ? (
        <section style={{ ...S.card, textAlign: 'center', padding: '32px 20px', marginTop: 16 }}>
          <div aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center',
            justifyContent: 'center', width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(110,231,183,0.12)', color: '#a7f3d0',
            fontSize: 28, fontWeight: 700, marginBottom: 12 }}>✓</div>
          <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>동의가 완료됐어요!</h1>
          <p style={{ color: '#c9c4df', fontSize: 13, lineHeight: 1.8,
            margin: '0 0 18px' }}>
            선택한 동의 내용이 안전하게 저장됐어요.
          </p>
          <p style={{ fontSize: 13, color: approved ? '#a7f3d0' : '#ddd6fe',
            lineHeight: 1.8, margin: '0 0 24px' }}>
            {approved
              ? '내 정보 보관과 프로필 공개에 동의했어요. 다른 사람에게는 이름·사진이 보이지 않아요.'
              : '내 정보는 주선자에게만 맡겼어요. 다른 사람에게 내 프로필은 공개되지 않아요.'}
          </p>
          {loaded?.accessUrl ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#f1f0ff',
                lineHeight: 1.75, margin: '0 0 16px' }}>
                이제 다른 소개팅 프로필도 살펴보세요.
              </p>
              <a href={loaded.accessUrl}
                onClick={demoMode ? event => {
                  event.preventDefault()
                  setError('미리보기에서는 실제 프로필 화면으로 이동하지 않아요.')
                } : undefined}
                style={{ ...S.btnPrimary, display: 'block',
                textAlign: 'center', textDecoration: 'none', padding: '14px 16px',
                fontSize: 14 }}>
                💘 소개팅 프로필 보기
              </a>
              <button type="button" onClick={() => void copyProfileLink()}
                style={{ width: '100%', padding: '12px 16px', fontSize: 13,
                  border: '1px solid rgba(196,181,253,0.6)', borderRadius: 10,
                  background: 'rgba(167,139,250,0.14)', color: '#ede9fe',
                  fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  marginTop: 10 }}>
                {linkCopied ? '✓ 소개팅 프로필 링크 복사 완료' : '🔗 소개팅 프로필 링크 복사'}
              </button>
              <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.8,
                margin: '12px 0 20px' }}>
                다른 브라우저에서도 이용할 수 있어요. 이 링크는 다른 사람에게 전달하지 마세요.
              </p>
            </>
          ) : (
            <p style={{ color: '#fcd34d', fontSize: 13, lineHeight: 1.8,
              margin: '0 0 20px' }}>
              프로필 열람 링크를 준비하지 못했어요. 주선자에게 문의해 주세요.
            </p>
          )}
          {error && <p role="alert" style={{ color: '#f87171', fontSize: 13,
            lineHeight: 1.8, margin: '8px 0 16px' }}>{error}</p>}
          <button type="button" className="btn-outline"
            onClick={() => { setShowDetails(true); setLinkCopied(false); setError('') }}
            style={{ width: '100%', padding: '11px 14px', fontSize: 13 }}>
            동의 내용 확인·변경·철회
          </button>
        </section>
      ) : (
        <>
      {completed && showDetails && (
        <button type="button" className="btn-icon"
          onClick={() => { setShowDetails(false); setError('') }}
          style={{ marginBottom: 16, fontSize: 13 }}>
          ← 완료 화면으로 돌아가기
        </button>
      )}
      <h1 style={{ fontSize: 23, marginBottom: 8 }}>💌 소개팅 프로필 공개 선택</h1>
      <p style={{ fontSize: 13, color: '#c9c4df', lineHeight: 1.8, marginBottom: 18 }}>
        내 정보를 주선자에게만 맡기거나, 선택적으로 다른 사람에게 프로필을 공개할 수 있어요.
        프로필 내용을 확인·수정한 뒤 동의 여부를 결정해 주세요.
      </p>
      {loading ? <p role="status" style={{ color: '#a9a3c9', fontSize: 13,
        lineHeight: 1.85, margin: '22px 0 26px' }}>동의 정보를 불러오는 중...</p> : !loaded ? (
        <p role="alert" style={{ color: '#f87171', lineHeight: 1.85, margin: '18px 0' }}>{error}</p>
      ) : (
        <>
          <section style={{ ...S.card, padding: 18, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>👀 다른 사람에게 공개될 프로필</h2>
            <p style={{ fontSize: 12, color: '#a9a3c9', lineHeight: 1.7, marginBottom: 14 }}>
              틀린 부분은 직접 고칠 수 있어요. 고친 내용은 동의할 때 함께 저장돼요.
              이름·사진과 매칭 정보는 이 화면에 표시되지 않아요.
            </p>
            {profile && (
              <>
                {detail('성별', profile.gender === 'male' ? '남성' : '여성')}
                {detail('관계 구분', profile.is_direct ? '주선자가 직접 아는 사이' : '건너건너 아는 사이')}
                {editing ? (
                  <>
                    {editField('year', '출생연도 (예: 1996)', false, 4)}
                    {editField('height', '키 (cm)', false, 6)}
                    {editField('location', '거주 지역', false, 100)}
                    {editField('job', '직장/직업', false, 140)}
                    {editField('public_ideal_type', '이상형', true, 600)}
                    {editField('public_traits', '특징', true, 1600)}
                    <p style={{ fontSize: 11, color: '#a9a3c9', lineHeight: 1.7, marginBottom: 10 }}>
                      성별·관계 구분·이름·사진은 주선자에게 수정 요청해 주세요.
                    </p>
                    {draftError && <p role="alert" style={{ color: '#f87171', fontSize: 12 }}>{draftError}</p>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn-outline" disabled={busy}
                        onClick={() => {
                          if (!draft) return
                          try { validatedDraft(draft); setEditing(false); setDraftError('') }
                          catch (caught) { setDraftError(caught instanceof Error ? caught.message : '입력값을 확인해 주세요.') }
                        }} style={{ flex: 1, padding: '10px' }}>수정 내용 확인</button>
                      <button type="button" className="btn-outline" disabled={busy}
                        onClick={() => { setDraft(draftFromProfile(profile)); setDraftTouched(false); setEditing(false); setDraftError('') }}
                        style={{ padding: '10px' }}>수정 취소</button>
                    </div>
                  </>
                ) : (
                  <>
                    {detail('출생연도', displayProfile?.year && displayProfile.year + '년생')}
                    {detail('키', displayProfile?.height && displayProfile.height + 'cm')}
                    {detail('거주 지역', displayProfile?.location)}
                    {detail('직장/직업', displayProfile?.job)}
                    {detail('이상형', displayProfile?.public_ideal_type)}
                    {detail('특징', displayProfile?.public_traits)}
                    {hasEdits && <p role="status" style={{ color: '#a7f3d0', fontSize: 12, marginTop: 10 }}>
                      ✓ 수정한 내용은 아래에서 동의할 때 함께 저장돼요.
                    </p>}
                    <button type="button" className="btn-outline" disabled={busy}
                      onClick={() => { setDraftError(''); setEditing(true) }}
                      style={{ width: '100%', marginTop: 12, padding: '10px 12px' }}>
                      ✏️ 프로필 내용 수정하기
                    </button>
                  </>
                )}
              </>
            )}
          </section>
          <section style={{ ...S.card, padding: 16, marginBottom: 12 }}>
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1.7 }}>
                🔒 개인정보 수집·이용 안내 (필수) · 자세히 보기
              </summary>
              <div style={{ fontSize: 12, color: '#d3d0ea', lineHeight: 1.9, marginTop: 12 }}>
                <p><strong>정보 관리 주체:</strong> 소개팅 주선 노트 운영자(동의 링크를 관리하는 사람)</p>
                <p><strong>이용 목적:</strong> 소개팅 상대 검토·연결 및 진행 상황 관리</p>
                <p><strong>보관 정보:</strong> 이름, 사진, 성별, 출생연도, 키, 거주지, 직장/직업, 이상형, 특징, 소개 진행 상황과 매칭 이력 등. 사진은 별도 이미지 저장 서비스에 보관될 수 있어요.</p>
                <p><strong>보관 기간:</strong> 소개팅 주선이 필요한 동안이에요. 동의를 철회하거나 주선이 끝나면 불필요한 정보는 주선자가 삭제를 처리해요.</p>
                <p><strong>거부하면:</strong> 소개팅 정보 보관·관리에 참여하지 않아요. 이미 저장된 정보는 삭제를 요청할 수 있어요.</p>
              </div>
            </details>
            <p style={{ fontSize: 12, color: '#c9c4df', lineHeight: 1.8, margin: '8px 0 0' }}>
              소개팅 주선·관리를 위해 이름·사진·프로필·매칭 이력을 보관해요.
              주선 목적이 끝나거나 철회하면 불필요한 정보는 정리해요.
              거부할 수 있지만 주선에 참여할 수 없어요.
            </p>
          </section>
          <section style={{ ...S.card, padding: 16, marginBottom: 16 }}>
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1.7 }}>
                🌐 프로필 공개 안내 (선택) · 자세히 보기
              </summary>
              <div style={{ fontSize: 12, color: '#d3d0ea', lineHeight: 1.9, marginTop: 12 }}>
                <p><strong>공개 목적:</strong> 소개팅 상대 확인과 관심 신청</p>
                <p><strong>보여줄 정보:</strong> 위에 표시된 성별, 출생연도, 키, 거주지, 직장/직업, 관계 구분, 이상형, 특징 중 입력된 항목이에요.</p>
                <p><strong>누가 볼 수 있나요:</strong> 운영자에게 이용 승인을 받은 방문자와 기존에 등록되어 개인정보 동의를 마친 사람이에요. 개인 열람 링크가 전달되면 다른 사람도 볼 수 있어요.</p>
                <p><strong>공개 기간:</strong> 소개팅 주선이 필요한 동안이에요. 철회하거나 주선이 끝나면 공개를 중단하고, 내용이 바뀌면 다시 동의받아요.</p>
                <p><strong>거부하면:</strong> 소개팅 연결을 위한 내부 보관만 동의할 수 있고, 다른 사람에게는 공개하지 않아요. 공개 동의는 언제든 철회할 수 있어요.</p>
              </div>
            </details>
            <p style={{ fontSize: 12, color: '#c9c4df', lineHeight: 1.8, margin: '8px 0 0' }}>
              이름·사진을 제외한 프로필을 승인된 방문자·동의한 참여자에게
              소개팅 검토 목적으로 제공해요. 주선 종료나 철회 시 공개를 멈춰요.
              선택 동의를 거부해도 주선자에게만 정보를 맡길 수 있어요.
            </p>
          </section>
          {approved && !isReview && !hasEdits ? (
            <section style={{ ...S.card, padding: 18 }}>
              <h2 style={{ fontSize: 17 }}>✅ 프로필 공개에 동의했어요</h2>
              <p style={{ color: '#a9a3c9', fontSize: 13, lineHeight: 1.8 }}>
                공개를 중단해도 주선자에게 맡긴 정보는 그대로 보관돼요.
              </p>
              <button type="button" className="btn-outline" disabled={busy}
                onClick={() => void decide('withdrawn')}
                style={{ width: '100%', marginTop: 12 }}>프로필 공개 중단하기</button>
              <button type="button" className="btn-outline" disabled={busy}
                onClick={() => void decide('withdraw-all')}
                style={{ width: '100%', marginTop: 10 }}>정보 보관도 철회 · 삭제 요청</button>
            </section>
          ) : (
            <section style={{ ...S.card, padding: 18 }}>
              {loaded.deletionRequested && (
                <p style={{ color: '#fcd34d', fontSize: 13, lineHeight: 1.75 }}>
                  정보 보관 동의를 거절하거나 철회해 삭제를 요청했어요.
                  실제 삭제는 주선자가 확인 후 처리해요.
                </p>
              )}
              {internalOnly && (
                <p style={{ color: '#a7f3d0', fontSize: 13, lineHeight: 1.75 }}>
                  ✅ 주선자에게만 정보를 맡긴 상태예요. 다른 사람에게는 공개되지 않아요.
                </p>
              )}
              {isReview && <p role="status" style={{ color: '#fcd34d', fontSize: 13,
                lineHeight: 1.75, margin: '5px 0 11px' }}>
                내용이 변경됐어요. 확인하고 다시 선택해 주세요.
              </p>}
              <label style={{ display: 'flex', gap: 10, marginBottom: 14, fontSize: 13, lineHeight: 1.7 }}>
                <input type="checkbox" checked={confirmedOwner}
                  onChange={e => setConfirmedOwner(e.target.checked)} />
                <span>위 프로필이 제 정보임을 확인했어요.</span>
              </label>
              <label style={{ display: 'flex', gap: 10, marginBottom: 14, fontSize: 13, lineHeight: 1.7 }}>
                <input type="checkbox" checked={useAgreed}
                  onChange={e => { setUseAgreed(e.target.checked); if (!e.target.checked) setShareAgreed(false) }} />
                <span>개인정보 보관·이용에 동의해요 <strong>(필수)</strong></span>
              </label>
              <label style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 13, lineHeight: 1.7 }}>
                <input type="checkbox" checked={shareAgreed} disabled={!useAgreed}
                  onChange={e => setShareAgreed(e.target.checked)} />
                <span>프로필 공개에 동의해요 <strong>(선택)</strong></span>
              </label>
              {error && <p role="alert" style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
              <button type="button" style={{ ...S.btnPrimary, width: '100%' }}
                disabled={busy || editing || !confirmedOwner || !useAgreed}
                onClick={() => void decide(shareAgreed ? 'approved' : 'declined')}>
                {busy ? '저장 중...' : hasEdits ? '수정 내용 저장하고 동의하기' : shareAgreed
                  ? '정보 보관 및 프로필 공개에 동의하기'
                  : '정보 보관에만 동의하기'}
              </button>
              <button type="button" className="btn-outline" disabled={busy}
                onClick={() => void decide('withdraw-all')}
                style={{ width: '100%', marginTop: 10 }}>
                정보 보관에 동의하지 않기 · 삭제 요청
              </button>
            </section>
          )}
          {error && approved && <p role="alert" style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
          <p style={{ fontSize: 11, lineHeight: 1.75, color: '#a9a3c9', marginTop: 18 }}>
            이 링크는 다른 사람에게 전달하지 말아 주세요.
            내용 수정이나 동의 철회에 문제가 있으면 주선자에게 알려주세요.
          </p>
        </>
      )}
        </>
      )}
    </main>
  )
}
