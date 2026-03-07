import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from '@/hooks/useData'
import Layout from '@/pages/Layout'
import PeoplePage from '@/pages/PeoplePage'
import PersonDetail from '@/pages/PersonDetail'
import MatchesPage from '@/pages/MatchesPage'

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/people" replace />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="people/:id" element={<PersonDetail />} />
            <Route path="matches" element={<MatchesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  )
}
