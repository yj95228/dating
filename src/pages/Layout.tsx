import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useData } from '@/hooks/useData'

export default function Layout() {
  const { matches, loading, error } = useData()
  const location = useLocation()

  const stats = {
    total: matches.length,
    success: matches.filter((m) => m.result === '성공').length,
    ongoing: matches.filter((m) => m.result === '진행중').length,
  }

  const isDetail = location.pathname.startsWith('/people/') && location.pathname !== '/people'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0d0b1e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7070a0', fontFamily: "'Noto Sans KR', sans-serif" }}>
      불러오는 중...
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#0d0b1e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 20 }}>
      <div style={{ color: '#f87171', fontFamily: "'Noto Sans KR', sans-serif" }}>⚠️ {error}</div>
      <div style={{ fontSize: 12, color: '#7070a0', fontFamily: "'Noto Sans KR', sans-serif", textAlign: 'center' }}>
        .env 파일에 Supabase 키가 설정되어 있는지 확인해주세요
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 20% 20%,#1e1040 0%,#0d0b1e 50%,#0a0818 100%)', fontFamily: "'Noto Sans KR','Apple SD Gothic Neo',sans-serif", color: '#f1f0ff', paddingBottom: 80 }}>

      {/* 헤더 */}
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', position: 'sticky', top: 0, background: 'rgba(13,11,30,0.92)', backdropFilter: 'blur(12px)', zIndex: 50 }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontFamily: "'Noto Serif KR', serif", background: 'linear-gradient(135deg,#c4b5fd,#f9a8d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              💘 소개팅 주선 노트
            </h1>
            {!isDetail && (
              <div style={{ fontSize: 11, color: '#5a5a80', marginTop: 3 }}>
                주선 {stats.total}건 · 성공 {stats.success}건 · 진행중 {stats.ongoing}건
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 - 상세 페이지에서는 숨김 */}
      {!isDetail && (
        <div style={{ position: 'sticky', top: 69, zIndex: 40, background: 'rgba(13,11,30,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', padding: '8px 16px', gap: 6 }}>
            {[
              { to: '/people', label: '👥 인물' },
              { to: '/matches', label: '💌 매칭' },
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                style={({ isActive }) => ({
                  flex: 1, padding: '8px 0', borderRadius: 9, border: 'none',
                  background: isActive ? 'linear-gradient(135deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#fff' : '#8080b0',
                  fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  fontFamily: "'Noto Sans KR', sans-serif",
                  textDecoration: 'none', textAlign: 'center' as const,
                  transition: 'all 0.2s', display: 'block',
                })}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* 페이지 콘텐츠 */}
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>
        <Outlet />
      </div>
    </div>
  )
}
