import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useData } from '@/hooks/useData'
import { useAuth } from '@/hooks/useAuth'

export default function Layout() {
  const { matches, loading, error } = useData()
  const { user, signOut } = useAuth()
  const location = useLocation()
  
  // 프로필 드롭다운 메뉴 상태 관리
  const [showProfileMenu, setShowProfileMenu] = useState(false)

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
            
            {/* 우측 프로필 영역 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
              {user && (
                <>
                  {/* 프로필 아바타 버튼 */}
                  <button 
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    style={{ 
                      width: 34, height: 34, borderRadius: '50%', 
                      background: 'linear-gradient(135deg,#7c3aed,#ec4899)', 
                      border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, 
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                  >
                    {user.email?.[0].toUpperCase() ?? '👤'}
                  </button>

                  {/* 드롭다운 메뉴 */}
                  {showProfileMenu && (
                    <>
                      {/* 백드롭 (메뉴 바깥 클릭 시 닫힘) */}
                      <div 
                        onClick={() => setShowProfileMenu(false)} 
                        style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
                      />
                      
                      {/* 실제 팝업 메뉴 컨테이너 */}
                      <div style={{ 
                        position: 'absolute', top: 44, right: 0, zIndex: 50,
                        background: '#1a1830', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 14, padding: '14px', minWidth: 200,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
                      }}>
                        <div style={{ fontSize: 11, color: '#8080c0', marginBottom: 4 }}>로그인된 계정</div>
                        <div style={{ fontSize: 13, color: '#e0d0ff', marginBottom: 16, wordBreak: 'break-all', fontWeight: 500 }}>
                          {user.email}
                        </div>
                        <button 
                          onClick={() => {
                            setShowProfileMenu(false)
                            signOut()
                          }} 
                          style={{ 
                            width: '100%', padding: '10px 0', borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', 
                            color: '#f1f0ff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                        >
                          로그아웃
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
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