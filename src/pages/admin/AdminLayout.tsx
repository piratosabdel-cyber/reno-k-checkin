import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-4 py-2 text-sm font-medium transition ${
    isActive ? 'bg-orange-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`

export default function AdminLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold">Reno-K — Admin</span>
          <nav className="flex gap-2">
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
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{profile?.full_name}</span>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
