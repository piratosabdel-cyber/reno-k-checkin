import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
    isActive ? 'bg-orange-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`

export default function AdminLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <span className="text-lg font-bold">Reno-K — Admin</span>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden text-sm text-slate-400 sm:inline">{profile?.full_name}</span>
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
        <Outlet />
      </main>
    </div>
  )
}
