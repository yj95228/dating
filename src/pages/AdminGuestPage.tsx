import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import { supabase } from '@/lib/supabase'
import { getPersonDisplayName } from '@/constants'
import { S } from '@/styles'

type RequestStatus = 'new' | 'checking' | 'connected' | 'closed'
type RequestTab = 'pending' | 'connected' | 'closed' | 'all'
interface Interest {
  id: string
  nickname: string
  applicant_kind: 'candidate' | 'introducer'
  applicant_person_id: number | null
  status: RequestStatus
  created_at: string
}
interface Choice { request_id: string; person_id: number }
type AccessRequest = {
  id: string; visitor_name: string; applicant_kind: 'candidate' | 'introducer'
  referrer_id: string | null; referrer_note: string | null
  status: 'pending' | 'approved' | 'rejected'; created_at: string
}
type Referrer = { id: string; name: string; url: string; revoked_at: string | null }
const portalInvoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('guest-portal', { body })
  if (error || data?.error) {
    let message = typeof data?.error === 'string' ? data.error : '서버 요청에 실패했어요.'
    const context = error?.context
    if (context instanceof Response) {
      try { const payload = await context.clone().json(); if (payload?.error) message = payload.error }
      catch { /* use fallback */ }
    }
    throw Error(message)
  }
  return data as Record<string, unknown>
}

const statuses = [
  { value: 'new', label: '신규' },
  { value: 'checking', label: '확인 중' },
  { value: 'connected', label: '소개 완료' },
  { value: 'closed', label: '종료' },
] as const

const statusLabels: Record<RequestStatus, string> = {
  new: '신규',
  checking: '확인 중',
  connected: '소개 완료',
  closed: '종료',
}
const statusColors: Record<RequestStatus, string> = {
  new: '#f9a8d4',
  checking: '#fcd34d',
  connected: '#6ee7b7',
  closed: '#a9a3c9',
}
const PAGE_SIZE = 20

const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('guest-share', { body })
  if (error) {
    const response = error.context
    if (response instanceof Response) {
      const status = response.status
      let message = ''
      try {
        const failure: unknown = await response.clone().json()
        if (failure && typeof failure === 'object' && 'error' in failure
          && typeof failure.error === 'string') message = failure.error
      } catch { /* Browser or gateway error may have no JSON body. */ }
      if (status === 404) throw new Error('서버 함수를 찾지 못했어요. Supabase guest-share 배포를 확인해 주세요. (404)')
      if (status === 401 || status === 403) throw new Error(message || '로그인 또는 관리자 권한을 확인해 주세요. (401/403)')
      throw new Error(message || `서버 요청 실패 (HTTP ${status}). Supabase 함수와 APP_URL 설정을 확인해 주세요.`)
    }
    throw new Error('서버에 연결하지 못했어요. Preview 주소가 Supabase APP_URL 허용 목록에 있는지, guest-share 함수가 배포되어 있는지 확인해 주세요. 브라우저에서 차단된 경우 네트워크/CORS 오류일 수 있어요.')
  }
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : '서버 요청이 실패했어요.')
  return data as Record<string, unknown>
}

export default function AdminGuestPage() {
  const navigate = useNavigate()
  const { people, canManage } = useData()
  const [requests, setRequests] = useState<Interest[]>([])
  const [choices, setChoices] = useState<Choice[]>([])
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [referrers, setReferrers] = useState<Referrer[]>([])
  const [referrerDraft, setReferrerDraft] = useState('')
  const [accessReloadKey, setAccessReloadKey] = useState(0)
  const [tab, setTab] = useState<RequestTab>('pending')
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<Record<RequestStatus, number>>({
    new: 0, checking: 0, connected: 0, closed: 0,
  })
  const [reloadKey, setReloadKey] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchDraft.trim()), 300)
    return () => window.clearTimeout(id)
  }, [searchDraft])

  useEffect(() => {
    if (!canManage) return
    let cancelled = false
    const refreshCounts = async () => {
      const names = ['new', 'checking', 'connected', 'closed'] as const
      const results = await Promise.all(names.map(status =>
        supabase.from('guest_interest_requests').select('id', { count: 'exact', head: true })
          .eq('status', status)))
      if (cancelled) return
      if (results.some(result => result.error)) return
      setCounts({
        new: results[0].count ?? 0,
        checking: results[1].count ?? 0,
        connected: results[2].count ?? 0,
        closed: results[3].count ?? 0,
      })
    }
    void refreshCounts()
    return () => { cancelled = true }
  }, [canManage, reloadKey])

  useEffect(() => {
    if (!canManage) return
    let cancelled = false
    setListLoading(true)
    const load = async () => {
      let query = supabase.from('guest_interest_requests')
        .select('id,nickname,applicant_kind,applicant_person_id,status,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      if (tab === 'pending') query = query.in('status', ['new', 'checking'])
      else if (tab !== 'all') query = query.eq('status', tab)
      if (search) query = query.ilike('nickname', `%${search}%`)
      const { data, error: queryError, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (queryError) throw queryError
      const loaded = (data ?? []) as Interest[]
      let loadedChoices: Choice[] = []
      if (loaded.length) {
        const result = await supabase.from('guest_interest_choices')
          .select('request_id,person_id').in('request_id', loaded.map(req => req.id))
        if (result.error) throw result.error
        loadedChoices = (result.data ?? []) as Choice[]
      }
      if (cancelled) return
      setTotal(count ?? 0)
      setRequests(prev => page === 0 ? loaded :
        [...prev, ...loaded.filter(req => !prev.some(previous => previous.id === req.id))])
      setChoices(prev => page === 0 ? loadedChoices : [...prev, ...loadedChoices])
      setError('')
    }
    void load().catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : '신청 목록을 불러오지 못했어요.')
    }).finally(() => { if (!cancelled) setListLoading(false) })
    return () => { cancelled = true }
  }, [canManage, tab, search, page, reloadKey])

  useEffect(() => {
    if (!canManage) return
    let active = true
    void portalInvoke({ action: 'admin-list' }).then(data => {
      if (!active) return
      setAccessRequests(Array.isArray(data.requests) ? data.requests as AccessRequest[] : [])
      setReferrers(Array.isArray(data.referrers) ? data.referrers as Referrer[] : [])
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : '접속 신청 목록을 확인하지 못했어요.')
    })
    return () => { active = false }
  }, [canManage, accessReloadKey])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : '처리하지 못했어요.') }
    finally { setBusy(false) }
  }
  const refreshAccess = () => setAccessReloadKey(value => value + 1)
  const addReferrer = () => run(async () => {
    if (!referrerDraft.trim()) throw Error('소개자 이름을 입력해 주세요.')
    const data = await portalInvoke({ action: 'admin-add-referrer', name: referrerDraft.trim() })
    setReferrerDraft('')
    refreshAccess()
    if (typeof data.url === 'string') {
      await navigator.clipboard.writeText(data.url)
      setNotice('소개자 링크를 만들고 복사했어요.')
    }
  })
  const reviewAccess = (id: string, status: 'approved' | 'rejected') => run(async () => {
    const data = await portalInvoke({ action: 'admin-review', id, status })
    if (data.done !== true) throw Error('처리하지 못했어요.')
    refreshAccess()
    setNotice(status === 'approved'
      ? '승인했어요. 신청자는 자신의 링크에서 바로 이용할 수 있어요.'
      : '이용 신청을 거절했어요.')
  })
  const copyPersonalUrl = (id: string) => run(async () => {
    const data = await portalInvoke({ action: 'admin-personal-url', id })
    if (typeof data.url !== 'string') throw Error('개인 링크를 가져오지 못했어요.')
    await navigator.clipboard.writeText(data.url)
    setNotice('개인 링크를 복사했어요. 해당 이용자에게만 전달해 주세요.')
  })
  const revokeAccess = (id: string) => run(async () => {
    await portalInvoke({ action: 'admin-revoke', id })
    setNotice('해당 개인 링크를 중지했어요.')
    refreshAccess()
  })
  const revokeReferrer = (id: string) => run(async () => {
    await portalInvoke({ action: 'admin-revoke-referrer', id })
    setNotice('소개 링크를 중지했어요.')
    refreshAccess()
  })
  const updateRequest = (id: string, changes: Partial<Interest>) => run(async () => {
    const { error: updateError } = await supabase.from('guest_interest_requests')
      .update(changes).eq('id', id)
    if (updateError) throw updateError
    setRequests(prev => prev.map(req => req.id === id ? { ...req, ...changes } : req))
    if (changes.status) {
      setPage(0)
      setReloadKey(value => value + 1)
    }
  })
  const changeTab = (next: RequestTab) => {
    setTab(next)
    setPage(0)
    setRequests([])
    setChoices([])
  }
  const refreshRequests = () => {
    setPage(0)
    setReloadKey(value => value + 1)
  }


  if (!canManage) return <p>관리자만 사용할 수 있어요.</p>
  const pending = counts.new + counts.checking
  const allCount = pending + counts.connected + counts.closed
  const tabs: { value: RequestTab; label: string; count: number }[] = [
    { value: 'pending', label: '처리할 신청', count: pending },
    { value: 'connected', label: '소개 완료', count: counts.connected },
    { value: 'closed', label: '종료', count: counts.closed },
    { value: 'all', label: '전체', count: allCount },
  ]

  return (
    <div style={{ paddingBottom: 70 }}>
      <button type="button" className="btn-outline"
        onClick={() => navigate('/public-preview')}
        style={{ width: '100%', padding: '13px 14px', marginBottom: 20,
          textAlign: 'left', fontWeight: 700 }}>👀 공개 프로필 보기 ›</button>
      <h2 style={{ fontSize: 20, marginTop: 0 }}>💌 관심 신청 관리</h2>
      {error && <p role="alert" style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
      {notice && <p role="status" style={{ color: '#c4b5fd', fontSize: 13 }}>{notice}</p>}
      <section style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12, gap: 10 }}>
          <div>
            <strong style={{ fontSize: 15 }}>처리할 신청 {pending}건</strong>
            {counts.new > 0 && <span style={{ color: '#f9a8d4', fontSize: 12, marginLeft: 8 }}>
              신규 {counts.new}건
            </span>}
          </div>
          <button type="button" className="btn-icon" onClick={refreshRequests}
            disabled={listLoading || busy} style={{ fontSize: 12 }}>
            ↻ 새로고침
          </button>
        </div>
        <div role="group" aria-label="신청 상태별 보기"
          style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
          {tabs.map(item => (
            <button type="button" key={item.value} aria-pressed={tab === item.value}
              onClick={() => changeTab(item.value)}
              style={{ whiteSpace: 'nowrap', flexShrink: 0, padding: '9px 12px', borderRadius: 10,
                fontWeight: 700, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                color: tab === item.value ? '#ddd6fe' : '#a9a3c9',
                background: tab === item.value ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.035)',
                border: tab === item.value ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.1)' }}>
              {item.label} {item.count}
            </button>
          ))}
        </div>
        <input aria-label="신청자 닉네임 검색" value={searchDraft}
          onChange={event => { setSearchDraft(event.target.value); setPage(0); setRequests([]) }}
          placeholder="신청자 닉네임 검색"
          style={{ ...S.input, fontSize: 13, marginBottom: 14 }} />
        {requests.length === 0 && !listLoading && (
          <p style={{ color: '#a9a3c9', fontSize: 13 }}>
            {search ? '검색 결과가 없어요.' : '이 상태의 신청이 없어요.'}
          </p>
        )}
        {requests.map(req => {
          const chosen = choices.filter(choice => choice.request_id === req.id)
          const connected = people.find(p => p.id === req.applicant_person_id)
          return (
            <details key={req.id} style={{ ...S.card, padding: '12px 14px', marginBottom: 9 }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{req.nickname}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0,
                    color: statusColors[req.status] }}>{statusLabels[req.status]}</span>
                </div>
                <div style={{ fontSize: 11, color: '#a9a3c9', marginTop: 6 }}>
                  {req.applicant_kind === 'introducer' ? '중간 주선자' : '소개받을 사람'}
                  {' · 관심 '}{chosen.length}명
                  {' · '}{new Date(req.created_at).toLocaleDateString('ko-KR')}
                  <span style={{ float: 'right', color: '#c4b5fd' }}>상세 ▼</span>
                </div>
              </summary>
              <div style={{ marginTop: 14, paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 13, marginBottom: 10 }}>관심 있는 후보</div>
                {chosen.map(choice => {
                  const person = people.find(p => p.id === choice.person_id)
                  return (
                    <button key={choice.person_id} type="button" className="btn-outline"
                      onClick={() => navigate(`/people/${choice.person_id}`)}
                      style={{ display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}>
                      {person ? getPersonDisplayName(person, people) : '삭제된 후보'}
                      {' · '}{person?.year ?? '?'}년생 → 상세보기
                    </button>
                  )
                })}
                <label htmlFor={`link-person-${req.id}`}
                  style={{ display: 'block', fontSize: 12, color: '#a9a3c9', marginTop: 12 }}>
                  신청자와 기존 인물 연결 (선택)
                </label>
                <select id={`link-person-${req.id}`} value={req.applicant_person_id ?? ''}
                  disabled={busy}
                  onChange={event => void updateRequest(req.id, {
                    applicant_person_id: event.target.value ? Number(event.target.value) : null,
                  })}
                  style={{ ...S.input, marginTop: 6 }}>
                  <option value="">연결 안 함 · 닉네임만 관리</option>
                  {people.map(person => (
                    <option key={person.id} value={person.id}>
                      {getPersonDisplayName(person, people)} · {person.year ?? '연도 미입력'}
                    </option>
                  ))}
                </select>
                {connected && (
                  <button type="button" className="btn-icon"
                    style={{ marginTop: 8, color: '#c4b5fd' }}
                    onClick={() => navigate(`/people/${connected.id}`)}>
                    연결된 인물: {getPersonDisplayName(connected, people)} → 상세보기
                  </button>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                  <span style={{ color: '#a9a3c9', fontSize: 12 }}>진행 상태</span>
                  <select disabled={busy} value={req.status}
                    onChange={event => void updateRequest(req.id,
                      { status: event.target.value as Interest['status'] })}
                    style={{ ...S.input, flex: 1 }}>
                    {statuses.map(item => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </details>
          )
        })}
        {listLoading && <p role="status" style={{ fontSize: 12, color: '#a9a3c9' }}>
          신청을 불러오는 중...
        </p>}
        {!listLoading && requests.length < total && (
          <button type="button" className="btn-outline"
            style={{ display: 'block', width: '100%', marginTop: 10 }}
            onClick={() => setPage(current => current + 1)}>
            더 보기 ({requests.length}/{total})
          </button>
        )}
        {!listLoading && requests.length > 0 && requests.length >= total && (
          <p style={{ textAlign: 'center', color: '#a9a3c9', fontSize: 11 }}>
            {requests.length}건 표시 중
          </p>
        )}
      </section>

      <h3 style={{ fontSize: 15, color: '#c4b5fd', marginTop: 20 }}>신규 방문자 관리</h3>
      <details style={{ ...S.card, padding: 16, marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700,
          color: '#ddd6fe' }}>🔐 신규 방문자 승인
          {accessRequests.filter(item => item.status === 'pending').length > 0 &&
            <span style={{ marginLeft: 8, fontSize: 12, color: '#fcd34d' }}>
              대기 {accessRequests.filter(item => item.status === 'pending').length}건
            </span>}
        </summary>
        <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.7 }}>
          기존 후보는 각자 개인정보 동의 링크로 바로 이용하고,
          새 방문자만 여기서 승인해요. 회원가입은 필요 없어요.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input aria-label="일반 소개팅 링크" readOnly
            value={window.location.origin + '/i-need-money'}
            style={{ ...S.input, minWidth: 0, flex: 1, fontSize: 12 }} />
          <button type="button" className="btn-outline"
            onClick={() => void navigator.clipboard.writeText(window.location.origin + '/i-need-money')}>
            링크 복사
          </button>
        </div>
        <button type="button" className="btn-icon" onClick={refreshAccess} disabled={busy}>
          ↻ 승인 목록 새로고침
        </button>
        {!accessRequests.some(item => item.status === 'pending') && (
          <p style={{ fontSize: 12, color: '#a9a3c9' }}>대기 중인 이용 신청이 없어요.</p>
        )}
        {accessRequests.filter(item => item.status === 'pending').map(item => (
          <div key={item.id} style={{ borderTop: '1px solid rgba(255,255,255,0.1)',
            padding: '13px 0' }}>
            <strong style={{ fontSize: 14 }}>{item.visitor_name}</strong>
            <p style={{ fontSize: 12, color: '#a9a3c9', lineHeight: 1.7 }}>
              {item.applicant_kind === 'introducer' ? '중간 주선자' : '소개받을 사람'}
              {' · '}
              {referrers.find(ref => ref.id === item.referrer_id)?.name
                || item.referrer_note || '소개 경로 미기재'}
              {' · '}{new Date(item.created_at).toLocaleDateString('ko-KR')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={busy} style={{ ...S.btnPrimary, flex: 1 }}
                onClick={() => void reviewAccess(item.id, 'approved')}>승인</button>
              <button type="button" disabled={busy} className="btn-outline"
                onClick={() => void reviewAccess(item.id, 'rejected')}>거절</button>
            </div>
          </div>
        ))}
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#c4b5fd' }}>
            처리된 방문자 {accessRequests.filter(item => item.status !== 'pending').length}명 보기
          </summary>
          {accessRequests.filter(item => item.status !== 'pending').map(item => (
            <div key={item.id} style={{ borderTop: '1px solid rgba(255,255,255,0.1)',
              padding: '10px 0' }}>
              <strong>{item.visitor_name}</strong>
              <span style={{ fontSize: 12, color: '#a9a3c9', marginLeft: 8 }}>
                {item.status === 'approved' ? '승인' : '거절'}
                {' · '}{referrers.find(ref => ref.id === item.referrer_id)?.name || item.referrer_note}
              </span>
              {item.status === 'approved' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" disabled={busy} className="btn-outline"
                    onClick={() => void copyPersonalUrl(item.id)}>개인 링크 복사</button>
                  <button type="button" disabled={busy} className="btn-outline"
                    onClick={() => void revokeAccess(item.id)}>접근 중지</button>
                </div>
              )}
            </div>
          ))}
        </details>
      </details>
      <details style={{ ...S.card, padding: 16, marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700,
          color: '#ddd6fe' }}>🔗 초대 링크 관리</summary>
        <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.7 }}>
          한 소개자가 여러 사람에게 같은 링크를 보낼 수 있어요. 링크에 만료일이나 횟수 제한은 없고,
          링크로 들어온 방문자는 개별 승인해요.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input aria-label="소개자 이름" value={referrerDraft} maxLength={60}
            onChange={event => setReferrerDraft(event.target.value)}
            placeholder="소개자 이름" style={{ ...S.input, minWidth: 0, flex: 1 }} />
          <button type="button" disabled={busy || !referrerDraft.trim()}
            style={S.btnPrimary} onClick={() => void addReferrer()}>추가</button>
        </div>
        {referrers.map(ref => (
          <div key={ref.id} style={{ borderTop: '1px solid rgba(255,255,255,0.1)',
            marginTop: 12, paddingTop: 12 }}>
            <strong style={{ fontSize: 13 }}>{ref.name}</strong>
            <span style={{ fontSize: 11, color: '#a9a3c9', marginLeft: 8 }}>
              {ref.revoked_at ? '중지됨' : '사용 중'}
            </span>
            {!ref.revoked_at && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn-outline"
                  onClick={() => void navigator.clipboard.writeText(ref.url)}>초대 링크 복사</button>
                <button type="button" className="btn-outline" disabled={busy}
                  onClick={() => void revokeReferrer(ref.id)}>중지</button>
              </div>
            )}
          </div>
        ))}
      </details>
    </div>
  )
}
