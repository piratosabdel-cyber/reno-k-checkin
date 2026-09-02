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
  const [historiqueMois, setHistoriqueMois] = useState(() => new Date().toISOString().slice(0, 7))
  const [historiqueChargement, setHistoriqueChargement] = useState(false)
  const [justificationOuverteId, setJustificationOuverteId] = useState<string | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetFormId, setResetFormId] = useState<string | null>(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [filtreStatut, setFiltreStatut] = useState<'tous' | 'actif' | 'bloque'>('actif')

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

  function ouvrirFormulaireReset(o: Profile) {
    if (resetFormId === o.id) {
      setResetFormId(null)
      return
    }
    setResetError(null)
    setResetPasswordValue('')
    setResetFormId(o.id)
  }

  async function confirmerReset(o: Profile) {
    setResetError(null)
    setResettingId(o.id)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ouvrierId: o.id, password: resetPasswordValue }),
      })

      const texte = await res.text()
      let result: { error?: string; password?: string } = {}
      try {
        result = texte ? JSON.parse(texte) : {}
      } catch {
        setResetError(`Réponse inattendue du serveur (${res.status}) : ${texte.slice(0, 200)}`)
        return
      }

      if (!res.ok) {
        setResetError(result.error ?? `Erreur lors de la réinitialisation (${res.status}).`)
        return
      }

      setCreatedCreds({ email: o.email ?? '(email non renseigné)', password: result.password ?? '' })
      setResetFormId(null)
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Erreur réseau lors de la réinitialisation.')
    } finally {
      setResettingId(null)
    }
  }

  async function toggleActive(o: Profile) {
    await supabase.from('profiles').update({ active: !o.active }).eq('id', o.id)
    load()
  }

  async function chargerHistorique(ouvrierId: string, mois: string) {
    setHistoriqueChargement(true)
    setJustificationOuverteId(null)
    const debut = `${mois}-01T00:00:00`
    const fin = new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0) // dernier jour du mois
    const { data } = await supabase
      .from('pointages')
      .select('*, chantier:chantiers(id, nom)')
      .eq('ouvrier_id', ouvrierId)
      .gte('heure_appareil', debut)
      .lte('heure_appareil', `${fin.toISOString().slice(0, 10)}T23:59:59`)
      .order('heure_appareil', { ascending: false })
    setHistorique((data as unknown as PointageWithRelations[]) ?? [])
    setHistoriqueChargement(false)
  }

  async function toggleHistorique(o: Profile) {
    if (expandedId === o.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(o.id)
    const moisActuel = new Date().toISOString().slice(0, 7)
    setHistoriqueMois(moisActuel)
    chargerHistorique(o.id, moisActuel)
  }

  const ouvriersFiltres = ouvriers.filter((o) => {
    if (filtreStatut === 'actif') return o.active
    if (filtreStatut === 'bloque') return !o.active
    return true
  })
  const nbActifs = ouvriers.filter((o) => o.active).length
  const nbBloques = ouvriers.length - nbActifs

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Ouvriers</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(
              [
                ['tous', `Tous (${ouvriers.length})`],
                ['actif', `Actif (${nbActifs})`],
                ['bloque', `Accès bloqué (${nbBloques})`],
              ] as const
            ).map(([valeur, libelle]) => (
              <button
                key={valeur}
                onClick={() => setFiltreStatut(valeur)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  filtreStatut === valeur
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
          >
            {showForm ? 'Annuler' : '+ Ajouter un ouvrier'}
          </button>
        </div>
      </div>

      {createdCreds && (
        <div className="mb-6 rounded-xl bg-emerald-50 p-4 text-emerald-900">
          <p className="font-semibold">Identifiants à jour.</p>
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

      {resetError && (
        <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{resetError}</div>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Nom</th>
                <th className="px-4 py-3 whitespace-nowrap">Email (login)</th>
                <th className="px-4 py-3 whitespace-nowrap">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {ouvriersFiltres.map((o) => (
                <Fragment key={o.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{o.full_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-600">
                      {o.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          o.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {o.active ? 'Actif' : 'Accès bloqué'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => toggleHistorique(o)}
                        className="mr-3 text-orange-600 hover:underline"
                      >
                        Historique
                      </button>
                      <button
                        onClick={() => ouvrirFormulaireReset(o)}
                        className="mr-3 text-orange-600 hover:underline"
                      >
                        Réinitialiser le mot de passe
                      </button>
                      <button
                        onClick={() => toggleActive(o)}
                        className={o.active ? 'text-red-600 hover:underline' : 'text-emerald-600 hover:underline'}
                      >
                        {o.active ? "Bloquer l'accès" : "Débloquer l'accès"}
                      </button>
                    </td>
                  </tr>
                  {resetFormId === o.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={4} className="px-4 py-3">
                        <label className="mb-1 block text-sm font-medium text-slate-700">
                          Nouveau mot de passe pour {o.full_name}
                        </label>
                        <p className="mb-2 text-xs text-amber-700">
                          ⚠️ Ceci remplace le mot de passe actuel de l'ouvrier — son ancien code ne fonctionnera
                          plus. Rien n'est modifié tant que tu n'as pas cliqué sur "Confirmer".
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <input
                            value={resetPasswordValue}
                            onChange={(e) => setResetPasswordValue(e.target.value)}
                            placeholder="Clique sur Générer, ou tape un mot de passe"
                            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setResetPasswordValue(generatePassword())}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          >
                            Générer
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmerReset(o)}
                            disabled={resettingId === o.id || resetPasswordValue.length < 6}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {resettingId === o.id ? '...' : 'Confirmer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetFormId(null)}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600"
                          >
                            Annuler
                          </button>
                        </div>
                        {resetPasswordValue.length > 0 && resetPasswordValue.length < 6 && (
                          <p className="mt-1 text-xs text-red-600">Minimum 6 caractères.</p>
                        )}
                      </td>
                    </tr>
                  )}
                  {expandedId === o.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={4} className="px-4 py-3">
                        <div className="mb-3 flex items-center gap-2">
                          <label className="text-sm font-medium text-slate-700">Mois</label>
                          <input
                            type="month"
                            value={historiqueMois}
                            onChange={(e) => {
                              setHistoriqueMois(e.target.value)
                              chargerHistorique(o.id, e.target.value)
                            }}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          />
                        </div>
                        {historiqueChargement ? (
                          <p className="text-slate-400">Chargement...</p>
                        ) : historique.length === 0 ? (
                          <p className="text-slate-400">Aucun pointage ce mois-ci.</p>
                        ) : (
                          <ul className="space-y-1">
                            {historique.map((p) => (
                              <li key={p.id} className="text-slate-600">
                                {p.chantier.nom} — {LABELS_TYPE[p.type]} —{' '}
                                {new Date(p.heure_appareil).toLocaleString('fr-BE')}
                                {p.hors_zone && (
                                  <>
                                    {' '}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setJustificationOuverteId(justificationOuverteId === p.id ? null : p.id)
                                      }
                                      className="text-amber-700 underline decoration-dotted hover:text-amber-900"
                                    >
                                      (hors zone)
                                    </button>
                                  </>
                                )}
                                {justificationOuverteId === p.id && (
                                  <div className="mt-1 ml-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                    {p.justification
                                      ? `« ${p.justification} »`
                                      : "Aucun commentaire n'a été laissé par l'ouvrier."}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {ouvriersFiltres.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    {ouvriers.length === 0 ? 'Aucun ouvrier pour le moment.' : 'Aucun ouvrier dans cette catégorie.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  )
}
