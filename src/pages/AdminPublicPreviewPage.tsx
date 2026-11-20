import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { S } from '@/styles'

type PublicPerson = {
  id: number
  gender: 'male' | 'female'
  year: string | null
  height: number | null
  location: string | null
  job: string | null
  is_direct: boolean
  sort_order: number | null
  public_ideal_type: string
  public_traits: string
}
type Gender = 'all' | 'male' | 'female'

async function messageFrom(error: unknown): Promise<string> {
  const fallback = '공개 프로필을 불러오지 못했어요. 다시 시도해 주세요.'
  if (!error || typeof error !== 'object' || !('context' in error)) return fallback
  const response = (error as { context?: unknown }).context
  if (!(response instanceof Response)) return fallback
  try {
    const data: unknown = await response.clone().json()
    if (data && typeof data === 'object' && 'error' in data &&
        typeof data.error === 'string') {
      if (response.status === 400 && data.error.includes('알 수 없는 요청')) {
        return '공개 프로필 미리보기 기능이 아직 Supabase 서버에 배포되지 않았어요. Preview는 운영 Supabase 서버를 사용하므로 서버 기능 배포 후 이용할 수 있어요.'
      }
      return data.error
    }
  } catch { /* Ignore non-JSON error. */ }
  return response.status === 403 ? '관리자 권한을 확인해 주세요.' : fallback
}

export default function AdminPublicPreviewPage() {
  const navigate = useNavigate()
  const [people, setPeople] = useState<PublicPerson[]>([])
  const [gender, setGender] = useState<Gender>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('guest-share', {
          body: { action: 'admin-preview' },
        })
        if (cancelled) return
        if (invokeError || !Array.isArray(data?.people)) {
          setPeople([])
          setError(invokeError ? await messageFrom(invokeError) : '공개 프로필 목록을 확인하지 못했어요.')
        } else {
          setPeople(data.people as PublicPerson[])
        }
      } catch {
        if (!cancelled) {
          setPeople([])
          setError('서버 연결을 확인하지 못했어요. 다시 시도해 주세요.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [refresh])

  const visible = people
    .filter(p => gender === 'all' || p.gender === gender)
    .sort((a, b) => Number(b.is_direct) - Number(a.is_direct)
      || (a.sort_order ?? 2147483647) - (b.sort_order ?? 2147483647) || a.id - b.id)

  return (
    <main style={{ color: '#f1f0ff', paddingBottom: 24 }}>
      <button type="button" className="btn-icon" onClick={() => navigate('/requests')}
        style={{ marginBottom: 12 }}>← 신청 관리로 돌아가기</button>
      <h2 style={{ fontSize: 21, margin: '0 0 10px' }}>👀 공개 프로필 미리보기</h2>
      <p style={{ color: '#a9a3c9', fontSize: 13, lineHeight: 1.85, margin: '0 0 12px' }}>
        소개팅 공유 링크에서 보이는 공개 동의 프로필이에요.
        관리자에게는 별도 이용 신청이나 개인 링크가 필요하지 않아요.
      </p>
      <p style={{ fontSize: 12, lineHeight: 1.8, color: '#c4b5fd', marginBottom: 16 }}>
        관리자용 전체 공개 목록이며, 신청은 할 수 없어요.
        실제 후보에게 보이는 목록은 본인·이전 매칭 상대 제외 여부에 따라 다를 수 있어요.
      </p>
      <button type="button" className="btn-outline" disabled={loading}
        onClick={() => setRefresh(value => value + 1)}
        style={{ marginBottom: 18, fontSize: 12 }}>
        {loading ? '확인 중...' : '↻ 목록 새로고침'}
      </button>
      {error && <p role="alert" style={{ color: '#f87171', fontSize: 13, lineHeight: 1.8 }}>{error}</p>}
      {loading ? (
        <p role="status" style={{ color: '#a9a3c9', fontSize: 13 }}>공개 프로필을 불러오는 중...</p>
      ) : error ? null : people.length === 0 ? (
        <p style={{ ...S.card, fontSize: 13, color: '#a9a3c9', lineHeight: 1.8 }}>
          현재 공개 동의가 유효한 프로필이 없어요.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {([
              { key: 'all', title: '전체' }, { key: 'male', title: '남자' }, { key: 'female', title: '여자' },
            ] as const).map(option => (
              <button type="button" key={option.key} aria-pressed={gender === option.key}
                onClick={() => setGender(option.key)}
                style={{ padding: '8px 13px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                  border: gender === option.key ? '1px solid #c4b5fd' : '1px solid rgba(255,255,255,0.12)',
                  background: gender === option.key ? 'rgba(168,85,247,0.2)' : 'transparent',
                  color: gender === option.key ? '#e9d5ff' : '#a9a3c9' }}>
                {option.title}
              </button>
            ))}
          </div>
          <p style={{ color: '#a9a3c9', fontSize: 12, marginBottom: 12 }}>
            공개 {people.length}명 · 현재 표시 {visible.length}명
          </p>
          {visible.length === 0 && <p style={{ color: '#a9a3c9', fontSize: 13 }}>선택한 조건에 맞는 프로필이 없어요.</p>}
          {visible.map((p, index) => (
            <Fragment key={p.id}>
              {(index === 0 || visible[index - 1].is_direct !== p.is_direct) && (
                <section style={{ margin: index === 0 ? '16px 0 14px' : '28px 0 14px' }}>
                  {index > 0 && <div style={{ height: 1, background: 'rgba(196,181,253,0.3)', marginBottom: 18 }} />}
                  <h3 style={{ fontSize: 16, color: '#e9d5ff', margin: 0 }}>
                    {p.is_direct ? '🤝 주선자가 직접 아는 사이' : '🔗 건너건너 아는 사이'}
                  </h3>
                </section>
              )}
              <div style={{ padding: '15px 12px', marginBottom: 10, borderRadius: 14,
                background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', alignItems: 'center', columnGap: 10 }}>
                  <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 42, height: 42, borderRadius: '50%', fontSize: 19, fontWeight: 700,
                    color: p.gender === 'male' ? '#a5b4fc' : '#f9a8d4',
                    background: p.gender === 'male' ? 'rgba(99,102,241,0.2)' : 'rgba(236,72,153,0.2)' }}>
                    {p.gender === 'male' ? '남' : '여'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 15 }}>{p.year ? p.year + '년생' : '프로필'}</strong>
                    <span style={{ color: '#a9a3c9', fontSize: 12, display: 'block', marginTop: 3, overflowWrap: 'anywhere' }}>
                      {[p.height && p.height + 'cm', p.location, p.job].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </div>
                {(p.public_ideal_type?.trim() || p.public_traits?.trim()) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)',
                    columnGap: 10, rowGap: 10, marginTop: 14, paddingTop: 12,
                    borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, lineHeight: 1.7 }}>
                    {p.public_ideal_type?.trim() && (
                      <>
                        <strong style={{ color: '#f0cce8', fontSize: 11, textAlign: 'center' }}>💕 이상형</strong>
                        <span style={{ color: '#f0cce8', whiteSpace: 'pre-wrap', minWidth: 0, overflowWrap: 'anywhere' }}>{p.public_ideal_type.trim()}</span>
                      </>
                    )}
                    {p.public_traits?.trim() && (
                      <>
                        <strong style={{ color: '#cdc5e8', fontSize: 11, textAlign: 'center' }}>✨ 특징</strong>
                        <span style={{ color: '#cdc5e8', whiteSpace: 'pre-wrap', minWidth: 0, overflowWrap: 'anywhere' }}>{p.public_traits.trim()}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Fragment>
          ))}
        </>
      )}
    </main>
  )
}
