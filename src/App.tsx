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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
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
          </Route>

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
