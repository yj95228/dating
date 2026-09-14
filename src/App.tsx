import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from '@/hooks/useData'
import { useAuth } from '@/hooks/useAuth'
import AuthCallback from './pages/AuthCallback'
import AcceptInvitePage from './pages/AcceptInvitePage'
import SetPasswordPage from './pages/SetPasswordPage'
import Layout from '@/pages/Layout'
import LoginPage from '@/pages/LoginPage'
import PeoplePage from '@/pages/PeoplePage'
import PersonDetail from '@/pages/PersonDetail'
import MatchesPage from '@/pages/MatchesPage'

function AuthGate() {
  const { user, role, loading, signOut } = useAuth()
  const savedGender = user?.user_metadata?.gender
  const viewerGender = savedGender === 'male' || savedGender === 'female' ? savedGender : null

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a5a80', fontFamily: "'Noto Sans KR', sans-serif" }}>
      불러오는 중...
    </div>
  )

  if (!user) return <LoginPage />

  return (
    <DataProvider key={`${user.id}:${role}`} role={role} viewerGender={viewerGender}>
      <Routes>
        <Route path="/login" element={<Navigate to="/people" replace />} />
        <Route path="/" element={<Layout user={user} onSignOut={signOut} />}>
          <Route index element={<Navigate to="/people" replace />} />
          <Route path="people" element={<PeoplePage userId={user.id} />} />
          <Route path="people/:id" element={<PersonDetail />} />
          <Route path="matches" element={<MatchesPage />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* AuthGate 밖 - 인증 처리 페이지 */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/invite" element={<AcceptInvitePage />} />
        <Route path="/set-password" element={<SetPasswordPage />} />

        {/* AuthGate 안 - 로그인 필요 */}
        <Route path="/*" element={<AuthGate />} />
      </Routes>
    </BrowserRouter>
  )
}
