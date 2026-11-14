import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
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
import AdminVehiculesPage from './pages/admin/AdminVehiculesPage'
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
            <Route path="vehicules" element={<AdminVehiculesPage />} />
          </Route>

          <Route
            path="/admin/heures/fiche/:ouvrierId"
            element={
              <ProtectedRoute requireRole="admin">
                <FicheHeuresPage />
              </ProtectedRoute>
            }
          />

          {/* Ancienne adresse ou lien inconnu : retour à l'accueil. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
