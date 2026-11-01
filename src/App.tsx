import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import CheckInPage from './pages/ouvrier/CheckInPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminChantiersPage from './pages/admin/AdminChantiersPage'
import AdminOuvriersPage from './pages/admin/AdminOuvriersPage'
import AdminHeuresPage from './pages/admin/AdminHeuresPage'
import FicheHeuresPage from './pages/admin/FicheHeuresPage'
import VisitesAccueilPage from './pages/commercial/VisitesAccueilPage'
import NouvelleVisitePage from './pages/commercial/NouvelleVisitePage'
import CompleterVisitePage from './pages/commercial/CompleterVisitePage'
import EnvoyerListePage from './pages/commercial/EnvoyerListePage'
import AdminVisitesPage from './pages/admin/AdminVisitesPage'
import AdminVisiteFichePage from './pages/admin/AdminVisiteFichePage'
import AdminCommercesPage from './pages/admin/AdminCommercesPage'
import AdminCommerceFichePage from './pages/admin/AdminCommerceFichePage'
import { useAutoUpdate } from './hooks/useAutoUpdate'

function AutoUpdate() {
  useAutoUpdate()
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AutoUpdate />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute requireRole={['ouvrier', 'admin']}>
                <CheckInPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute requireRole="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="chantiers" element={<AdminChantiersPage />} />
            <Route path="ouvriers" element={<AdminOuvriersPage />} />
            <Route path="heures" element={<AdminHeuresPage />} />
            <Route path="visites" element={<AdminVisitesPage />} />
            <Route path="visites/:id" element={<AdminVisiteFichePage />} />
            <Route path="commerces" element={<AdminCommercesPage />} />
            <Route path="commerces/:id" element={<AdminCommerceFichePage />} />
          </Route>

          <Route
            path="/visites"
            element={
              <ProtectedRoute requireRole="commercial">
                <VisitesAccueilPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visites/nouvelle"
            element={
              <ProtectedRoute requireRole="commercial">
                <NouvelleVisitePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visites/:id/completer"
            element={
              <ProtectedRoute requireRole="commercial">
                <CompleterVisitePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visites/envoyer"
            element={
              <ProtectedRoute requireRole="commercial">
                <EnvoyerListePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/heures/fiche/:ouvrierId"
            element={
              <ProtectedRoute requireRole="admin">
                <FicheHeuresPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
