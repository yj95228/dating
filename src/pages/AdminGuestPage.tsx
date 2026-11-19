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
const base64Bytes = (base64: string) => {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
  return Uint8Array.from(binary, ch => ch.charCodeAt(0))
}

export default function AdminGuestPage() {
  const navigate = useNavigate()
  const { people, canManage } = useData()
  const [requests, setRequests] = useState<Interest[]>([])
  const [choices, setChoices] = useState<Choice[]>([])
  const [latestUrl, setLatestUrl] = useState('')
  const [codeConfigured, setCodeConfigured] = useState(false)
  const [codeDraft, setCodeDraft] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [codeSaved, setCodeSaved] = useState(false)
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
    void invoke({ action: 'get-access-status' }).then(result => {
      if (active) setCodeConfigured(result.configured === true)
    }).catch(() => {
      if (active) setError('접속 코드 설정을 확인하지 못했어요.')
    })
    return () => { active = false }
  }, [canManage])

  useEffect(() => {
    if (!canManage) return
    let alive = true
    void invoke({ action: 'get-common-link', format: 'public' }).then(result => {
      if (alive && typeof result.url === 'string') setLatestUrl(result.url)
    }).catch(() => {
      if (alive) setError('소개팅 링크를 조회하지 못했어요.')
    })
    return () => { alive = false }
  }, [canManage])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : '처리하지 못했어요.') }
    finally { setBusy(false) }
  }
  const createLink = () => run(async () => {
    const result = await invoke({ action: 'create-common-link', format: 'public' })
    if (typeof result.url !== 'string') throw Error('소개팅 링크를 받지 못했어요.')
    setLatestUrl(result.url)
    setNotice('소개팅 링크가 준비됐어요.')
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
  const generateAccessCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    setCodeDraft(Array.from(bytes, b => alphabet[b % alphabet.length]).join(''))
    setShowCode(true)
    setCodeSaved(false)
  }
  const saveAccessCode = () => run(async () => {
    const code = codeDraft.trim()
    if (code.length < 8 || code.length > 64) throw Error('접속 코드는 8~64글자로 정해 주세요.')
    const response = await invoke({ action: 'set-access-code', code })
    if (response.configured !== true) throw Error('접속 코드를 저장하지 못했어요.')
    setCodeConfigured(true)
    setCodeSaved(true)
    setNotice('접속 코드를 저장했어요. 이 코드를 전달받은 사람만 후보를 볼 수 있어요.')
  })
  const copyAccessCode = () => run(async () => {
    await navigator.clipboard.writeText(codeDraft.trim())
    setNotice('접속 코드를 복사했어요.')
  })
  const copyLink = () => run(async () => {
    if (!codeConfigured) throw Error('먼저 접속 코드를 설정해 주세요.')
    await navigator.clipboard.writeText(latestUrl)
    setNotice('소개팅 링크를 복사했어요.')
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

      <section style={{ ...S.card, padding: 16, marginBottom: 16 }}>
        <details open={!codeConfigured}>
          <summary style={{ cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
            🔐 접속 코드 {codeConfigured ? '설정됨' : '설정 필요'}
          </summary>
          <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.7 }}>
            모두에게 같은 코드를 알려주면 돼요. 너무 쉬운 문구는 피하고,
            코드를 바꾸면 기존에 접속한 사람도 다시 입력해야 해요.
          </p>
          <label htmlFor="common-access-code" style={{ display: 'block',
            fontSize: 12, marginBottom: 7 }}>공통 접속 코드 (8~64글자)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="common-access-code" type={showCode ? 'text' : 'password'}
              autoComplete="off" value={codeDraft} minLength={8} maxLength={64}
              onChange={event => { setCodeDraft(event.target.value); setCodeSaved(false) }}
              placeholder="접속 코드 입력 또는 자동 생성"
              style={{ ...S.input, minWidth: 0, flex: 1 }} />
            <button className="btn-outline" type="button"
              onClick={() => setShowCode(value => !value)}>
              {showCode ? '숨기기' : '보기'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn-outline" onClick={generateAccessCode}>
              자동 생성
            </button>
            <button type="button" className="btn-outline" disabled={!codeDraft.trim()}
              onClick={() => void copyAccessCode()}>코드 복사</button>
            <button type="button" style={{ ...S.btnPrimary, flexGrow: 1 }}
              disabled={busy || codeDraft.trim().length < 8}
              onClick={() => void saveAccessCode()}>
              {codeConfigured ? '접속 코드 변경' : '접속 코드 저장'}
            </button>
          </div>
          {codeSaved && <p role="status" style={{ color: '#a7f3d0', fontSize: 12 }}>
            저장 완료! 이 코드를 공유해 주세요. 페이지를 나가면 다시 표시되지 않아요.
          </p>}
        </details>
      </section>
      <section style={{ ...S.card, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, marginTop: 0 }}>🔗 소개팅 링크</h3>
        {!codeConfigured && (
          <p style={{ color: '#fcd34d', fontSize: 12 }}>먼저 위에서 접속 코드를 설정해 주세요.</p>
        )}
        {!latestUrl ? (
          <button type="button" disabled={busy || !codeConfigured} style={{ ...S.btnPrimary, width: '100%' }}
            onClick={() => void createLink()}>소개팅 링크 만들기</button>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input aria-label="소개팅 링크 주소" readOnly value={latestUrl}
                onFocus={event => event.currentTarget.select()}
                style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 12 }} />
              <button type="button" disabled={busy || !codeConfigured} onClick={copyLink}
                style={{ ...S.btnPrimary, flexShrink: 0, padding: '11px 14px' }}>
                📋 복사
              </button>
            </div>
          </>
        )}
      </section>
      <section style={{ ...S.card, padding: 16 }}>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700,
            color: '#ddd6fe' }}>🔔 알림 설정</summary>
          <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.7 }}>
            이 기기에서 새 신청 알림을 받고 싶을 때만 설정하면 돼요.
          </p>
          <button type="button" disabled={busy} onClick={enablePush}
            style={{ ...S.btnPrimary, width: '100%' }}>
            이 기기에서 푸시 알림 받기
          </button>
        </details>
      </section>
    </div>
  )
}
