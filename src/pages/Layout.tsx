import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import { useAuth } from '@/hooks/useAuth'

export default function Layout() {
  const { matches, loading, error } = useData()
  const { signOut } = useAuth()
  const location = useLocation()
  const isDetail = location.pathname.startsWith('/people/') && location.pathname !== '/people'

  const stats = {
    total: matches.length,
    success: matches.filter((m) => m.result === '성공').length,
    ongoing: matches.filter((m) => m.result === '진행중').length,
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a5a80', fontSize: 14, fontFamily: "'Noto Sans KR', sans-serif" }}>
      불러오는 중...
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
      <div style={{ color: '#f87171', fontFamily: "'Noto Sans KR', sans-serif" }}>{error}</div>
      <div style={{ fontSize: 12, color: '#5a5a80', fontFamily: "'Noto Sans KR', sans-serif" }}>.env 파일에 Supabase 키가 설정되어 있는지 확인해주세요</div>
    </div>
  )

  const headerStyle: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 50,
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(13,11,30,0.92)',
    backdropFilter: 'blur(12px)',
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 80, fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif", color: '#f1f0ff' }}>
      <div style={headerStyle}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 21, fontFamily: "'Noto Serif KR', serif", fontWeight: 700, background: 'linear-gradient(135deg,#c4b5fd,#f9a8d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                💘 소개팅 주선 노트
              </h1>
              {!isDetail && (
                <div style={{ fontSize: 11, color: '#5a5a80', marginTop: 4 }}>
                  주선 {stats.total}건 · 성공 {stats.success}건 · 진행중 {stats.ongoing}건
                </div>
              )}
            </div>
            <button onClick={signOut} style={{ fontSize: 12, color: '#6060a0', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
              로그아웃
            </button>
          </div>
        </div>

        {!isDetail && (
          <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px 10px', display: 'flex', gap: 6 }}>
            {[{ to: '/people', label: '👥 인물' }, { to: '/matches', label: '💌 매칭' }].map(({ to, label }) => (
              <NavLink key={to} to={to}
                style={({ isActive }) => ({
                  flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 10,
                  fontSize: 14, fontWeight: 700, textDecoration: 'none',
                  background: isActive ? 'linear-gradient(135deg,#7c3aed,#ec4899)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#fff' : '#6060a0',
                  transition: 'all 0.2s',
                })}
              >
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 0' }}>
        <Outlet />
      </div>
    </div>
  )
}