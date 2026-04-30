import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from '@/hooks/useData'
import { useAuth } from '@/hooks/useAuth'
import AuthCallback from './pages/AuthCallback'
import SetPasswordPage from './pages/SetPasswordPage'
import Layout from '@/pages/Layout'
import LoginPage from '@/pages/LoginPage'
import PeoplePage from '@/pages/PeoplePage'
import PersonDetail from '@/pages/PersonDetail'
import MatchesPage from '@/pages/MatchesPage'

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a5a80', fontFamily: "'Noto Sans KR', sans-serif" }}>
      불러오는 중...
    </div>
  )

  if (!user) return <LoginPage />

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <DataProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/people" replace />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="people/:id" element={<PersonDetail />} />
              <Route path="matches" element={<MatchesPage />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/set-password" element={<SetPasswordPage />} />
            </Route>
          </Routes>
        </DataProvider>
      </AuthGate>
    </BrowserRouter>
  )
}