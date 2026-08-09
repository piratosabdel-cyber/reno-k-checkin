import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { adminAuthClient, generatePassword } from '../../lib/adminAuthClient'
import type { Profile, PointageWithRelations, TypePointage } from '../../types/database'

const LABELS_TYPE: Record<TypePointage, string> = {
  arrivee: 'Arrivée',
  pause_debut: 'Début de pause',
  pause_fin: 'Fin de pause',
  depart: 'Départ',
}

export default function AdminOuvriersPage() {
  const [ouvriers, setOuvriers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(generatePassword())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(
    null
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [historique, setHistorique] = useState<PointageWithRelations[]>([])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'ouvrier')
      .order('full_name')
    setOuvriers((data as Profile[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const { error } = await adminAuthClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: 'ouvrier' } },
    })

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    setCreatedCreds({ email, password })
    setFullName('')
    setEmail('')
    setPassword(generatePassword())
    setShowForm(false)
    load()
  }

  async function toggleActive(o: Profile) {
    await supabase.from('profiles').update({ active: !o.active }).eq('id', o.id)
    load()
  }

  async function toggleHistorique(o: Profile) {
    if (expandedId === o.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(o.id)
    const { data } = await supabase
      .from('pointages')
      .select('*, chantier:chantiers(id, nom)')
      .eq('ouvrier_id', o.id)
      .order('heure_appareil', { ascending: false })
      .limit(10)
    setHistorique((data as unknown as PointageWithRelations[]) ?? [])
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Ouvriers</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
        >
          {showForm ? 'Annuler' : '+ Ajouter un ouvrier'}
        </button>
      </div>

      {createdCreds && (
        <div className="mb-6 rounded-xl bg-emerald-50 p-4 text-emerald-900">
          <p className="font-semibold">Compte créé.</p>
          <p className="text-sm">
            Transmets ces identifiants à l'ouvrier (par SMS/WhatsApp) :
          </p>
          <p className="mt-1 font-mono text-sm">
            {createdCreds.email} / {createdCreds.password}
          </p>
          <button
            onClick={() => setCreatedCreds(null)}
            className="mt-2 text-sm underline"
          >
            Fermer
          </button>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 grid gap-4 rounded-xl bg-white p-6 shadow-sm sm:grid-cols-2"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nom complet</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="ex. Mihai Popescu"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="mihai@reno-k.be"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Mot de passe temporaire
            </label>
            <div className="flex gap-2">
              <input
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
              <button
                type="button"
                onClick={() => setPassword(generatePassword())}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Générer
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-2"
          >
            {saving ? 'Création...' : "Créer l'ouvrier"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-400">Chargement...</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {ouvriers.map((o) => (
                <Fragment key={o.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{o.full_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          o.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {o.active ? 'Actif' : 'Archivé'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleHistorique(o)}
                        className="mr-3 text-orange-600 hover:underline"
                      >
                        Historique
                      </button>
                      <button onClick={() => toggleActive(o)} className="text-slate-500 hover:underline">
                        {o.active ? 'Archiver' : 'Réactiver'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === o.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={3} className="px-4 py-3">
                        {historique.length === 0 ? (
                          <p className="text-slate-400">Aucun pointage.</p>
                        ) : (
                          <ul className="space-y-1">
                            {historique.map((p) => (
                              <li key={p.id} className="text-slate-600">
                                {p.chantier.nom} — {LABELS_TYPE[p.type]} —{' '}
                                {new Date(p.heure_appareil).toLocaleString('fr-BE')}
                                {p.hors_zone && <span className="ml-2 text-amber-600">(hors zone)</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {ouvriers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                    Aucun ouvrier pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
