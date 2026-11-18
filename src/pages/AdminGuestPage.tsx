import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import { supabase } from '@/lib/supabase'
import { getPersonDisplayName } from '@/constants'
import { S } from '@/styles'

interface ShareLink {
  id: string
  recipient_label: string
  expires_at: string | null
  revoked_at: string | null
}
interface Interest {
  id: string
  link_id: string
  nickname: string
  applicant_kind: 'candidate' | 'introducer'
  applicant_person_id: number | null
  status: 'new' | 'checking' | 'connected' | 'closed'
  created_at: string
}
interface Choice { request_id: string; person_id: number }

const statuses = [
  { value: 'new', label: '신규' },
  { value: 'checking', label: '확인 중' },
  { value: 'connected', label: '소개 완료' },
  { value: 'closed', label: '종료' },
] as const

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
  const [links, setLinks] = useState<ShareLink[]>([])
  const [requests, setRequests] = useState<Interest[]>([])
  const [choices, setChoices] = useState<Choice[]>([])
  const [latestUrl, setLatestUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    const [linkResult, requestResult, choiceResult] = await Promise.all([
      supabase.from('guest_share_links').select('id,recipient_label,expires_at,revoked_at').order('created_at', { ascending: false }),
      supabase.from('guest_interest_requests').select('id,link_id,nickname,applicant_kind,applicant_person_id,status,created_at')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('guest_interest_choices').select('request_id,person_id'),
    ])
    const dbError = linkResult.error || requestResult.error || choiceResult.error
    if (dbError) throw dbError
    setLinks((linkResult.data ?? []) as ShareLink[])
    setRequests((requestResult.data ?? []) as Interest[])
    setChoices((choiceResult.data ?? []) as Choice[])
  }
  useEffect(() => {
    let live = true
    Promise.all([refresh(), invoke({ action: 'get-common-link' })])
      .then(([, link]) => {
        if (live && typeof link.url === 'string') setLatestUrl(link.url)
      })
      .catch(() => { if (live) setError('공유 정보를 불러오지 못했어요. Supabase 서버 설정을 확인해 주세요.') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : '처리하지 못했어요.') }
    finally { setBusy(false) }
  }
  const createLink = (rotate = false) => run(async () => {
    const result = await invoke({ action: rotate ? 'rotate-common-link' : 'create-common-link' })
    if (typeof result.url !== 'string') throw Error('공용 링크를 받지 못했어요.')
    setLatestUrl(result.url)
    setNotice(rotate ? '기존 링크를 중지하고 새로운 공용 링크를 발급했어요.' : '공용 링크가 준비됐어요. 복사해서 계속 사용하세요.')
    await refresh()
  })
  const updateRequest = (id: string, changes: Partial<Interest>) => run(async () => {
    const { error } = await supabase.from('guest_interest_requests').update(changes).eq('id', id)
    if (error) throw error
    await refresh()
  })
  const copyLink = () => run(async () => {
    await navigator.clipboard.writeText(latestUrl)
    setNotice('공유 링크를 복사했어요.')
  })
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
  return (
    <div style={{ paddingBottom: 70 }}>
      <h2 style={{ fontSize: 20, marginTop: 0 }}>💌 관심 신청 관리</h2>
      <p style={{ color: '#a9a3c9', fontSize: 13, lineHeight: 1.7 }}>
        가입 없는 방문자가 관심 표시한 후보를 확인하고, 기존 등록 인물과 연결하거나 직접 소개해 주세요.
      </p>
      {error && <p role="alert" style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
      {notice && <p role="status" style={{ color: '#c4b5fd', fontSize: 13 }}>{notice}</p>}
      {loading ? <p>불러오는 중...</p> : (
        <>
          <section style={{ ...S.card, padding: 16, marginBottom: 22 }}>
            <h3 style={{ fontSize: 16, marginTop: 0 }}>새 요청 알림</h3>
            <button type="button" disabled={busy} onClick={enablePush} style={S.btnPrimary}>
              🔔 이 기기에서 푸시 알림 받기
            </button>
            <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.7 }}>
              기기에서 알림을 허용하면 새 요청 시 알림이 와요. iPhone은 홈 화면에 추가한 PWA에서 설정해야 해요.
            </p>
          </section>
          <section style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 17 }}>관심 신청 ({requests.length})</h3>
            {requests.length === 0 && <p style={{ color: '#a9a3c9', fontSize: 13 }}>아직 신청이 없어요.</p>}
            {requests.map(req => {
              const chosen = choices.filter(choice => choice.request_id === req.id)
              const linked = links.find(link => link.id === req.link_id)
              const connected = people.find(p => p.id === req.applicant_person_id)
              return (
                <div key={req.id} style={{ ...S.card, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <strong>{req.nickname}</strong>
                    <span style={{ fontSize: 11, color: '#a9a3c9' }}>{new Date(req.created_at).toLocaleString('ko-KR')}</span>
                  </div>
                  <p style={{ color: '#a9a3c9', fontSize: 12, margin: '8px 0' }}>
                    {req.applicant_kind === 'introducer' ? '중간 주선자' : '소개받을 사람'}
                    {linked?.recipient_label ? ` · 전달 링크: ${linked.recipient_label}` : ''}
                  </p>
                  <div style={{ fontSize: 13, marginBottom: 10 }}>관심 있는 후보</div>
                  {chosen.map(choice => {
                    const p = people.find(person => person.id === choice.person_id)
                    return (
                      <button key={choice.person_id} type="button" className="btn-outline"
                        onClick={() => navigate(`/people/${choice.person_id}`)}
                        style={{ display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}>
                        {p ? getPersonDisplayName(p, people) : '삭제된 후보'} · {p?.year ?? '?'}년생 → 상세보기
                      </button>
                    )
                  })}
                  <label htmlFor={`link-person-${req.id}`} style={{ display: 'block', fontSize: 12, color: '#a9a3c9', marginTop: 12 }}>
                    신청자와 기존 등록 인물 연결 (선택)
                  </label>
                  <select id={`link-person-${req.id}`} value={req.applicant_person_id ?? ''}
                    disabled={busy}
                    onChange={e => void updateRequest(req.id, {
                      applicant_person_id: e.target.value ? Number(e.target.value) : null,
                    })}
                    style={{ ...S.input, marginTop: 6 }}>
                    <option value="">연결 안 함 · 닉네임만 관리</option>
                    {people.map(p => (
                      <option key={p.id} value={p.id}>{getPersonDisplayName(p, people)} · {p.year ?? '연도 미입력'}</option>
                    ))}
                  </select>
                  {connected && (
                    <button type="button" className="btn-icon" style={{ marginTop: 8, color: '#c4b5fd' }}
                      onClick={() => navigate(`/people/${connected.id}`)}>
                      연결된 인물: {getPersonDisplayName(connected, people)} → 상세보기
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                    <span style={{ color: '#a9a3c9', fontSize: 12 }}>진행 상태</span>
                    <select disabled={busy} value={req.status}
                      onChange={e => void updateRequest(req.id, { status: e.target.value as Interest['status'] })}
                      style={{ ...S.input, flex: 1 }}>
                      {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
              )
            })}
          </section>
          <section style={{ ...S.card, padding: 16, marginBottom: 22 }}>
            <h3 style={{ fontSize: 16, marginTop: 0 }}>🔗 공용 링크</h3>
            <p style={{ color: '#a9a3c9', fontSize: 12, lineHeight: 1.7 }}>
              한 번 만들어 여러 사람에게 카톡으로 보내세요. 자동 만료일이 없고,
              방문자들은 관심 신청할 때 각자 닉네임을 입력해요.
            </p>
            {!latestUrl ? (
              <button type="button" disabled={busy} style={{ ...S.btnPrimary, width: '100%' }}
                onClick={() => createLink(false)}>공용 링크 만들기</button>
            ) : (
              <div>
                <textarea readOnly rows={3} value={latestUrl} onFocus={e => e.currentTarget.select()}
                  style={{ ...S.input, resize: 'none', fontSize: 11 }} />
                <button type="button" disabled={busy} onClick={copyLink}
                  style={{ ...S.btnPrimary, width: '100%', marginTop: 10 }}>📋 공용 링크 복사</button>
                <button type="button" disabled={busy} onClick={() => {
                  if (window.confirm('기존 공용 링크를 사용할 수 없게 하고 새 링크를 만들까요? 이전 링크를 받은 사람은 더 이상 접속할 수 없어요.')) {
                    createLink(true)
                  }
                }} className="btn-outline"
                  style={{ width: '100%', marginTop: 12 }}>링크 재발급 (기존 링크 중지)</button>
                <p style={{ color: '#a9a3c9', fontSize: 11, lineHeight: 1.6 }}>
                  링크가 외부에 퍼졌을 때만 재발급하면 돼요. 이미 접수된 신청 이력은 유지돼요.
                </p>
              </div>
            )}
          </section>

        </>
      )}
    </div>
  )
}
