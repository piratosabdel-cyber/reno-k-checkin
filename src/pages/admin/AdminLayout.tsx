import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import KillSwitchButton from '../../components/KillSwitchButton'
import { usePropositionsEnAttente } from '../../hooks/usePropositionsEnAttente'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
    isActive ? 'bg-orange-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const propositions = usePropositionsEnAttente()

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <span className="text-lg font-bold">Reno-K — Admin</span>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-slate-400 sm:inline">{profile?.full_name}</span>
            <KillSwitchButton />
            <button
              onClick={signOut}
              className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Déconnexion
            </button>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-6 sm:pb-4">
          <NavLink to="/admin" end className={linkClass}>
            Vue du jour
          </NavLink>
          <NavLink to="/admin/chantiers" className={linkClass}>
            Chantiers
            {propositions > 0 && (
              <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-slate-900">
                {propositions}
              </span>
            )}
          </NavLink>
          <NavLink to="/admin/ouvriers" className={linkClass}>
            Ouvriers
          </NavLink>
          <NavLink to="/admin/heures" className={linkClass}>
            Heures
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">
        {propositions > 0 && (
          <Link
            to="/admin/chantiers?filtre=a_approuver"
            className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
          >
            <span>
              🔔 <strong>{propositions}</strong> nouveau{propositions > 1 ? 'x' : ''} chantier
              {propositions > 1 ? 's' : ''} proposé{propositions > 1 ? 's' : ''} par un ouvrier — à approuver
            </span>
            <span className="shrink-0 font-semibold">Voir →</span>
          </Link>
        )}
        <Outlet />
      </main>
    </div>
  )
}
