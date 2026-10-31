import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types/database'

/** Écran d'accueil de chaque rôle. */
export function accueilPour(role: Role | undefined): string {
  if (role === 'admin') return '/admin'
  if (role === 'commercial') return '/visites'
  return '/'
}

export default function ProtectedRoute({
  children,
  requireRole,
}: {
  children: ReactNode
  requireRole?: Role | Role[]
}) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Chargement...
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  const autorises = requireRole == null ? null : Array.isArray(requireRole) ? requireRole : [requireRole]
  if (autorises && (!profile || !autorises.includes(profile.role))) {
    if (!profile) {
      return (
        <div className="flex min-h-screen items-center justify-center px-6 text-center text-slate-500">
          Profil introuvable. Déconnecte-toi puis reconnecte-toi.
        </div>
      )
    }
    return <Navigate to={accueilPour(profile.role)} replace />
  }

  return <>{children}</>
}
