import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types/database'

/** Écran d'accueil de chaque rôle (null : ce compte n'a accès à rien ici). */
export function accueilPour(role: string | undefined): string | null {
  if (role === 'admin') return '/admin'
  if (role === 'ouvrier') return '/'
  return null
}

export default function ProtectedRoute({
  children,
  requireRole,
}: {
  children: ReactNode
  requireRole?: Role | Role[]
}) {
  const { session, profile, loading, signOut } = useAuth()

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
    const accueil = profile ? accueilPour(profile.role) : null
    if (accueil) return <Navigate to={accueil} replace />
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center text-slate-500">
        <p>
          {profile
            ? "Ce compte n'a pas accès à l'application Reno-K."
            : 'Profil introuvable. Déconnecte-toi puis reconnecte-toi.'}
        </p>
        <button
          onClick={signOut}
          className="rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white active:bg-orange-700"
        >
          Se déconnecter
        </button>
      </div>
    )
  }

  return <>{children}</>
}
