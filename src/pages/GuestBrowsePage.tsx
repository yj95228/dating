import { Fragment, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { S } from '@/styles'

type GuestPerson = {
  id: number
  gender: 'male' | 'female'
  is_direct: boolean
  sort_order: number
  year: string | null
  height: number | null
  location: string | null
  job: string | null
  public_ideal_type: string
  public_traits: string
}

const errorMessage = (data: unknown, fallback: string) =>
  data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
    ? data.error : fallback

const ACCESS_STORAGE = 'dating-guest-access-v1'
const VISITOR_STORAGE = 'dating-guest-visitor-v1'
const getVisitorId = () => {
  try {
    const stored = localStorage.getItem(VISITOR_STORAGE)
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored
  } catch { /* Browser storage may be unavailable. */ }
  const next = crypto.randomUUID()
  try { localStorage.setItem(VISITOR_STORAGE, next) } catch { /* Private browsing. */ }
  return next
}
const isUnauthorized = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('context' in error)) return false
  const response = (error as { context?: unknown }).context
  return response instanceof Response && response.status === 401
}
const failureText = async (error: unknown, fallback: string) => {
  if (!error || typeof error !== 'object' || !('context' in error)) return fallback
  const response = (error as { context?: unknown }).context
  if (!(response instanceof Response)) return fallback
  try {
    const data: unknown = await response.clone().json()
    return errorMessage(data, fallback)
  } catch { return fallback }
}

export default function GuestBrowsePage() {
  // The public-looking path is only a nickname for the shared-code entry gate.
  const { token = 'public' } = useParams()
  const [people, setPeople] = useState<GuestPerson[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [step, setStep] = useState<'browse' | 'apply' | 'done'>('browse')
  const [nickname, setNickname] = useState('')
  const [applicantKind, setApplicantKind] = useState<'candidate' | 'introducer'>('candidate')
  const [error, setError] = useState('')
  const [accessToken, setAccessToken] = useState(() => {
    try { return localStorage.getItem(ACCESS_STORAGE) ?? '' } catch { return '' }
  })
  const [needsCode, setNeedsCode] = useState(false)
  const [accessCode, setAccessCode] = useState('')
  const [feeChecked, setFeeChecked] = useState(false)
  const [visitorId] = useState(getVisitorId)
  const [authBusy, setAuthBusy] = useState(false)

  useEffect(() => {
    if (!accessToken) {
      setPeople([])
      setNeedsCode(true)
      setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data, error: invokeError } = await supabase.functions.invoke('guest-share', {
        body: { action: 'browse', token, accessToken },
      })
      if (cancelled) return
      if (isUnauthorized(invokeError)) {
        try { localStorage.removeItem(ACCESS_STORAGE) } catch { /* Storage may be unavailable. */ }
        setPeople([])
        setNeedsCode(true)
        setAccessToken('')
        setError('')
      } else if (invokeError || !Array.isArray(data?.people)) {
        setError(await failureText(invokeError, errorMessage(data,
          '프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')))
      } else {
        setPeople(data.people as GuestPerson[])
        setNeedsCode(false)
        setError('')
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [token, accessToken])

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (authBusy || !accessCode || !feeChecked) return
    setAuthBusy(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('guest-share', {
        body: { action: 'unlock', code: accessCode },
      })
      if (invokeError || typeof data?.accessToken !== 'string') {
        throw new Error(await failureText(invokeError, errorMessage(data, '접속 코드를 확인해 주세요.')))
      }
      try { localStorage.setItem(ACCESS_STORAGE, data.accessToken) } catch { /* Private browsing */ }
      setAccessCode('')
      setNeedsCode(false)
      setAccessToken(data.accessToken)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '접속 코드를 확인해 주세요.')
    } finally { setAuthBusy(false) }
  }

  const toggle = (id: number) => {
    setError('')
    setSelected(current =>
      current.includes(id) ? current.filter(value => value !== id)
        : [...current, id])
  }

  const submit = async () => {
    if (!nickname.trim() || sending || !selected.length) return
    setSending(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('guest-share', {
        body: { action: 'submit', token, accessToken, nickname: nickname.trim(),
          applicantKind, personIds: selected, visitorId },
      })
      if (isUnauthorized(invokeError)) {
        try { localStorage.removeItem(ACCESS_STORAGE) } catch { /* ignore */ }
        setAccessToken('')
        setNeedsCode(true)
        setError('접속 시간이 만료됐어요. 코드를 다시 입력해 주세요.')
      } else if (invokeError || !data?.submitted) {
        setError(await failureText(invokeError, errorMessage(data,
          '신청을 저장하지 못했어요. 다시 시도해 주세요.')))
      } else {
        setStep('done')
      }
    } catch {
      setError('연결이 원활하지 않아요. 다시 시도해 주세요.')
    } finally { setSending(false) }
  }

  // Direct acquaintances first, then second-degree acquaintances.
  // Grouping happens after gender filtering, so the visual separator always stays correct.
  const filteredPeople = people
    .filter(person => genderFilter === 'all' || person.gender === genderFilter)
    .sort((a, b) => Number(b.is_direct) - Number(a.is_direct)
      || (a.sort_order ?? 2147483647) - (b.sort_order ?? 2147483647)
      || a.id - b.id)

  const filterStyle = (selected: boolean, color: string, background: string) => ({
    border: `1px solid ${selected ? color : 'rgba(255,255,255,0.12)'}`,
    background: selected ? background : 'transparent',
    color: selected ? color : 'rgba(255,255,255,0.64)',
    fontSize: 12, fontWeight: 600 as const, fontFamily: 'inherit',
    padding: '8px 13px', borderRadius: 16, cursor: 'pointer',
  })

  return (
    <main style={{ minHeight: '100vh', maxWidth: 560, margin: '0 auto', padding: '32px 18px 80px',
      color: '#f1f0ff', fontFamily: "'Noto Sans KR', sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>💘 소개팅 프로필 보기</h1>
      <p style={{ color: '#a9a3c9', fontSize: 13, lineHeight: 1.8 }}>
        <span style={{ display: 'block' }}>프로필을 살펴보고 관심 있는 사람을 골라 주세요.</span>
        <span style={{ display: 'block' }}>소개 가능 여부는 주선자가 확인한 뒤 안내해 드려요.</span>
      </p>
      {needsCode ? (
        <form onSubmit={unlock} style={{ ...S.card, padding: '24px 20px', marginTop: 26 }}>
          <label htmlFor="guest-access-code" style={{ display: 'block', fontSize: 13,
            marginBottom: 8 }}>전달받은 접속 코드</label>
          <input id="guest-access-code" type="password" autoComplete="off"
            value={accessCode} onChange={event => setAccessCode(event.target.value)}
            maxLength={64} placeholder="접속 코드 입력" style={S.input} />
          {error && <p role="alert" style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            marginTop: 18, marginBottom: 16, fontSize: 14, color: '#c4b5fd' }}>
            <input type="checkbox" checked={feeChecked}
              onChange={event => setFeeChecked(event.target.checked)}
              style={{ accentColor: '#a78bfa', width: 18, height: 18, flexShrink: 0 }} />
            <span>소개팅 성사되면 주선비 입금 부탁드려요 🙇</span>
          </label>
          <button type="submit" disabled={!accessCode || !feeChecked || authBusy}
            style={{ ...S.btnPrimary, width: '100%', marginTop: 16 }}>
            {authBusy ? '확인 중...' : '소개팅 프로필 보기'}
          </button>
        </form>
      ) : step === 'done' ? (
        <div style={{ ...S.card, textAlign: 'center', padding: '38px 20px' }}>
          <div style={{ fontSize: 40 }}>💌</div>
          <h2 style={{ fontSize: 20 }}>관심 신청을 보냈어요!</h2>
          <p style={{ color: '#a9a3c9', fontSize: 14 }}>관리자가 확인한 뒤 직접 소개를 연결할 거예요.</p>
          <p style={{ color: '#a9a3c9', fontSize: 12 }}>이 화면에서는 별도 연락처를 수집하지 않아요.</p>
        </div>
      ) : loading ? (
        <p style={{ color: '#a9a3c9' }}>프로필을 불러오는 중...</p>
      ) : step === 'apply' ? (
        <div style={{ ...S.card, padding: 20 }}>
          <button type="button" onClick={() => setStep('browse')} className="btn-icon">← 다시 선택하기</button>
          <h2 style={{ fontSize: 19 }}>💌 관심 신청하기</h2>
          <p style={{ color: '#a9a3c9', fontSize: 13 }}>선택한 사람 {selected.length}명 · 신청 시 닉네임을 한 번만 입력해요.</p>
          <label htmlFor="guest-kind" style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>어떤 입장이세요?</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            {([{ value: 'candidate', label: '소개받고 싶어요' }, { value: 'introducer', label: '중간 주선자예요' }] as const).map(option => (
              <button type="button" key={option.value}
                onClick={() => setApplicantKind(option.value)}
                style={{ ...S.btnPrimary, flex: 1, padding: '11px 5px',
                  opacity: applicantKind === option.value ? 1 : 0.4 }}>
                {option.label}
              </button>
            ))}
          </div>
          <label htmlFor="guest-nickname" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
            관리자가 알아볼 수 있는 닉네임
          </label>
          <input id="guest-nickname" value={nickname} maxLength={30}
            placeholder="예: 민수, 지영 친구, JY" onChange={e => setNickname(e.target.value)}
            style={S.input} />
          <p style={{ fontSize: 12, lineHeight: 1.7, color: '#a9a3c9' }}>
            닉네임과 관심을 표시한 사람은 소개 요청을 확인하기 위해 주선자에게 전달돼요.
            연락처는 받지 않으며 관리자가 별도로 연결합니다.
          </p>
          {error && <p role="alert" style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
          <button type="button" style={{ ...S.btnPrimary, width: '100%', marginTop: 12 }}
            disabled={!nickname.trim() || sending} onClick={submit}>
            {sending ? '신청 중...' : '관심 신청 보내기'}
          </button>
        </div>
      ) : (
        <>
          {error && <p role="alert" style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
          {!error && people.length === 0 && (
            <p style={{ color: '#a9a3c9', fontSize: 13 }}>현재 공개된 프로필이 없어요.</p>
          )}
          {people.length > 0 && (
            <div style={{ margin: '16px 0 14px' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {([
                  { value: 'all', label: '전체', color: '#d8b4fe', bg: 'rgba(168,85,247,0.2)' },
                  { value: 'male', label: '남자', color: '#c7d2fe', bg: 'rgba(129,140,248,0.2)' },
                  { value: 'female', label: '여자', color: '#fbcfe8', bg: 'rgba(244,114,182,0.2)' },
                ] as const).map(option => (
                  <button type="button" key={option.value}
                    aria-pressed={genderFilter === option.value}
                    style={filterStyle(genderFilter === option.value, option.color, option.bg)}
                    onClick={() => setGenderFilter(option.value)}>{option.label}</button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#a9a3c9', margin: '12px 0 0' }}>
                {filteredPeople.length}명 표시 · 관심 선택 {selected.length}명
              </p>
            </div>
          )}
          {people.length > 0 && filteredPeople.length === 0 && (
            <p style={{ color: '#a9a3c9', fontSize: 13 }}>선택한 조건에 맞는 프로필이 없어요.</p>
          )}
          {filteredPeople.map((p, index) => {
            const active = selected.includes(p.id)
            const sectionStart = index === 0 || filteredPeople[index - 1].is_direct !== p.is_direct
            return (
              <Fragment key={p.id}>
                {sectionStart && (
                  <section aria-label={p.is_direct ? '주선자가 직접 아는 사이' : '건너건너 아는 사이'}
                    style={{ margin: p.is_direct ? '12px 0 14px' : '28px 0 16px' }}>
                    {index > 0 && <div style={{ height: 1, background: 'rgba(196,181,253,0.3)',
                      marginBottom: 18 }} />}
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 7px',
                      color: '#e9d5ff' }}>
                      {p.is_direct ? '🤝 주선자가 직접 아는 사이' : '🔗 건너건너 아는 사이'}
                    </h2>
                    {!p.is_direct && (
                      <div style={{ borderLeft: '3px solid rgba(196,181,253,0.6)',
                        padding: '6px 0 6px 12px', fontSize: 12, lineHeight: 1.85,
                        color: '#c9c4df' }}>
                        <span style={{ display: 'block' }}>
                          건너건너 아는 분들은 현재 솔로 여부가 바로 업데이트되지 않을 수 있어요.
                        </span>
                        <span style={{ display: 'block' }}>
                          신청 후 주선자가 다시 확인하고 소개 가능 여부를 안내해 드려요.
                        </span>
                        <span style={{ display: 'block', marginTop: 5 }}>
                          <span style={{ display: 'block' }}>
                            소개 연결에 필요한 확인과 조율을 작은 후원으로 응원해 주셔도 좋아요 ☕
                          </span>
                          <span style={{ display: 'block' }}>
                            후원은 선택 사항이며 소개 성사와는 무관해요.
                          </span>
                        </span>
                      </div>
                    )}
                  </section>
                )}
                <button type="button" onClick={() => toggle(p.id)}
                  aria-pressed={active}
                  aria-label={`${p.gender === 'male' ? '남자' : '여자'} · ${p.year ? `${p.year}년생` : '프로필'} · ${active ? '관심 선택됨' : '관심 선택하기'}`}
                  style={{ display: 'block', width: '100%', marginBottom: 10, padding: '15px 12px',
                    textAlign: 'left', fontFamily: 'inherit',
                    background: 'rgba(255,255,255,0.045)', color: '#f1f0ff',
                    border: `1px solid ${active ? '#c4b5fd' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 14 }}>
                  <span style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) 26px',
                    columnGap: 10, alignItems: 'center' }}>
                    <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center',
                      justifyContent: 'center', justifySelf: 'center',
                      width: 42, height: 42, borderRadius: '50%',
                      fontSize: 19, fontWeight: 700, lineHeight: 1,
                      color: p.gender === 'male' ? '#a5b4fc' : '#f9a8d4',
                      background: p.gender === 'male' ? 'rgba(99,102,241,0.2)' : 'rgba(236,72,153,0.2)' }}>
                      {p.gender === 'male' ? '남' : '여'}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 15 }}>
                        {p.year ? `${p.year}년생` : '프로필'}
                      </strong>
                      <span style={{ color: '#a9a3c9', fontSize: 12, display: 'block',
                        marginTop: 3, overflowWrap: 'anywhere' }}>
                        {[p.height && `${p.height}cm`, p.location, p.job].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ justifySelf: 'end',
                      fontSize: 24, color: active ? '#f472b6' : '#a9a3c9' }}>
                      {active ? '♥' : '♡'}
                    </span>
                  </span>
                  {(p.public_ideal_type?.trim() || p.public_traits?.trim()) && (
                    <span style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)',
                      columnGap: 10, rowGap: 10, marginTop: 14, paddingTop: 12,
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      fontSize: 12, lineHeight: 1.7 }}>
                      {p.public_ideal_type?.trim() && (
                        <>
                          <strong style={{ color: '#f0cce8', fontSize: 11, alignSelf: 'start',
                            textAlign: 'center', paddingTop: 1 }}>💕 이상형</strong>
                          <span style={{ color: '#f0cce8', whiteSpace: 'pre-wrap',
                            minWidth: 0, overflowWrap: 'anywhere' }}>
                            {p.public_ideal_type.trim()}
                          </span>
                        </>
                      )}
                      {p.public_traits?.trim() && (
                        <>
                          <strong style={{ color: '#cdc5e8', fontSize: 11, alignSelf: 'start',
                            textAlign: 'center', paddingTop: 1 }}>✨ 특징</strong>
                          <span style={{ color: '#cdc5e8', whiteSpace: 'pre-wrap',
                            minWidth: 0, overflowWrap: 'anywhere' }}>
                            {p.public_traits.trim()}
                          </span>
                        </>
                      )}
                    </span>
                  )}
                </button>
              </Fragment>
            )
          })}
          {people.length > 0 && (
            <div style={{ position: 'sticky', bottom: 16, paddingTop: 16,
              background: 'linear-gradient(transparent,#0d0b1e 40%)' }}>
              <button type="button" style={{ ...S.btnPrimary, width: '100%', padding: 15 }}
                disabled={selected.length === 0} onClick={() => { setError(''); setStep('apply') }}>
                선택한 {selected.length}명 관심 신청하기
              </button>
              <p style={{ color: '#a9a3c9', fontSize: 11, textAlign: 'center' }}>관심 있는 사람을 원하는 만큼 선택해 주세요.</p>
            </div>
          )}
        </>
      )}
    </main>
  )
}
