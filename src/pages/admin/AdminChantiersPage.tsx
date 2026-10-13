import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ChantierLocationPicker from '../../components/ChantierLocationPicker'
import type { Chantier, Profile } from '../../types/database'

type ChantierAvecProposant = Chantier & { proposant: Pick<Profile, 'id' | 'full_name'> | null }
type Filtre = 'a_approuver' | 'actif' | 'archive' | 'tous'

const BADGES: Record<Chantier['statut'], { label: string; classe: string }> = {
  actif: { label: 'Actif', classe: 'bg-emerald-100 text-emerald-700' },
  termine: { label: 'Archivé', classe: 'bg-slate-100 text-slate-500' },
  en_attente: { label: 'À approuver', classe: 'bg-amber-100 text-amber-700' },
  refuse: { label: 'Refusé', classe: 'bg-red-100 text-red-600' },
}

const emptyForm = {
  id: null as string | null,
  nom: '',
  adresse: '',
  client: '',
  latitude: '',
  longitude: '',
  rayon_metres: '300',
  mode_hors_zone: 'justifier' as 'justifier' | 'bloquer',
  date_debut: '',
  date_fin: '',
  positionConfirmee: false,
}

export default function AdminChantiersPage() {
  const [searchParams] = useSearchParams()
  const [chantiers, setChantiers] = useState<ChantierAvecProposant[]>([])
  const [ouvriers, setOuvriers] = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filtreStatut, setFiltreStatut] = useState<Filtre>(
    searchParams.get('filtre') === 'a_approuver' ? 'a_approuver' : 'actif'
  )
  const [erreurForm, setErreurForm] = useState<string | null>(null)
  const [declencheurRecherche, setDeclencheurRecherche] = useState(0)

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: o }, { data: a }] = await Promise.all([
      supabase.from('chantiers').select('*, proposant:profiles(id, full_name)').order('statut').order('nom'),
      supabase.from('profiles').select('*').eq('role', 'ouvrier').eq('active', true).order('full_name'),
      supabase.from('chantier_assignments').select('chantier_id, ouvrier_id'),
    ])
    setChantiers((c as unknown as ChantierAvecProposant[]) ?? [])
    setOuvriers((o as Profile[]) ?? [])
    const map: Record<string, string[]> = {}
    for (const row of a ?? []) {
      map[row.chantier_id] = [...(map[row.chantier_id] ?? []), row.ouvrier_id]
    }
    setAssignments(map)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('chantiers-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chantiers' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function approuver(c: ChantierAvecProposant) {
    await supabase
      .from('chantiers')
      .update({ statut: 'actif', date_decision: new Date().toISOString() })
      .eq('id', c.id)
    if (c.propose_par) {
      await supabase.from('chantier_assignments').insert({ chantier_id: c.id, ouvrier_id: c.propose_par })
    }
    load()
  }

  async function refuser(c: ChantierAvecProposant) {
    if (!confirm(`Refuser le chantier "${c.nom}" ? L'ouvrier ne pourra pas pointer dessus.`)) return
    await supabase
      .from('chantiers')
      .update({ statut: 'refuse', date_decision: new Date().toISOString() })
      .eq('id', c.id)
    load()
  }

  function startEdit(c?: Chantier) {
    if (c) {
      setForm({
        id: c.id,
        nom: c.nom,
        adresse: c.adresse,
        client: c.client ?? '',
        latitude: c.latitude?.toString() ?? '',
        longitude: c.longitude?.toString() ?? '',
        rayon_metres: c.rayon_metres.toString(),
        mode_hors_zone: c.mode_hors_zone,
        date_debut: c.date_debut ?? '',
        date_fin: c.date_fin ?? '',
        positionConfirmee: c.latitude != null && c.longitude != null,
      })
    } else {
      setForm(emptyForm)
    }
    setErreurForm(null)
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.latitude || !form.longitude) {
      setErreurForm("Place d'abord le point du chantier sur la carte (cherche l'adresse ou clique sur la carte).")
      return
    }
    if (!form.positionConfirmee) {
      setErreurForm('Vérifie le point orange sur la carte puis clique sur "Confirmer cet emplacement".')
      return
    }
    setErreurForm(null)
    setSaving(true)

    const payload = {
      nom: form.nom,
      adresse: form.adresse,
      client: form.client || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      rayon_metres: Number(form.rayon_metres) || 300,
      mode_hors_zone: form.mode_hors_zone,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
    }

    if (form.id) {
      await supabase.from('chantiers').update(payload).eq('id', form.id)
    } else {
      await supabase.from('chantiers').insert(payload)
    }

    setSaving(false)
    setShowForm(false)
    setForm(emptyForm)
    load()
  }

  async function toggleStatut(c: Chantier) {
    await supabase
      .from('chantiers')
      .update({ statut: c.statut === 'actif' ? 'termine' : 'actif' })
      .eq('id', c.id)
    load()
  }

  async function toggleAssignment(chantierId: string, ouvrierId: string) {
    const current = assignments[chantierId] ?? []
    const isAssigned = current.includes(ouvrierId)

    if (isAssigned) {
      await supabase
        .from('chantier_assignments')
        .delete()
        .eq('chantier_id', chantierId)
        .eq('ouvrier_id', ouvrierId)
    } else {
      await supabase.from('chantier_assignments').insert({ chantier_id: chantierId, ouvrier_id: ouvrierId })
    }
    load()
  }

  const chantiersFiltres = chantiers.filter((c) => {
    if (filtreStatut === 'a_approuver') return c.statut === 'en_attente'
    if (filtreStatut === 'actif') return c.statut === 'actif'
    if (filtreStatut === 'archive') return c.statut === 'termine'
    return true
  })
  const nbEnAttente = chantiers.filter((c) => c.statut === 'en_attente').length
  const nbActifs = chantiers.filter((c) => c.statut === 'actif').length
  const nbArchives = chantiers.filter((c) => c.statut === 'termine').length

  const onglets: [Filtre, string][] = [
    ...(nbEnAttente > 0 ? ([['a_approuver', `🔔 À approuver (${nbEnAttente})`]] as [Filtre, string][]) : []),
    ['actif', `Actifs (${nbActifs})`],
    ['archive', `Archivés (${nbArchives})`],
    ['tous', `Tous (${chantiers.length})`],
  ]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Chantiers</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {onglets.map(([valeur, libelle]) => (
              <button
                key={valeur}
                onClick={() => setFiltreStatut(valeur)}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  filtreStatut === valeur
                    ? 'bg-white text-slate-900 shadow-sm'
                    : valeur === 'a_approuver'
                      ? 'text-amber-700 hover:text-amber-900'
                      : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
          <button
            onClick={() => (showForm ? setShowForm(false) : startEdit())}
            className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
          >
            {showForm ? 'Annuler' : '+ Nouveau chantier'}
          </button>
        </div>
      </div>

      {filtreStatut === 'archive' && (
        <p className="mb-4 text-sm text-slate-500">
          Les chantiers archivés ne sont visibles que par toi — ils n'apparaissent jamais dans l'écran de
          pointage des ouvriers.
        </p>
      )}
      {filtreStatut === 'a_approuver' && (
        <p className="mb-4 text-sm text-slate-500">
          Chantiers proposés par les ouvriers. Vérifie le nom et l'emplacement ("Modifier" si besoin), puis
          approuve : il devient actif et l'ouvrier qui l'a proposé y est assigné automatiquement.
        </p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 grid gap-4 rounded-xl bg-white p-6 shadow-sm sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
            <input
              required
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="ex. Witteramsdal 93"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Adresse</label>
            <input
              required
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value, positionConfirmee: false })}
              onBlur={() => form.adresse.trim() && !form.positionConfirmee && setDeclencheurRecherche((n) => n + 1)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="ex. Witteramsdal 93, Asse"
            />
            <p className="mt-1 text-xs text-slate-400">La recherche sur la carte se lance toute seule quand tu quittes ce champ.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Emplacement du chantier (zone de pointage)</label>
            <ChantierLocationPicker
              adresse={form.adresse}
              latitude={form.latitude}
              longitude={form.longitude}
              rayonMetres={Number(form.rayon_metres) || 300}
              confirmee={form.positionConfirmee}
              declencheurRecherche={declencheurRecherche}
              onChange={(lat, lng) =>
                setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6), positionConfirmee: false }))
              }
              onAdresseTrouvee={(adresse) => setForm((f) => ({ ...f, adresse }))}
              onConfirmer={() => {
                setForm((f) => ({ ...f, positionConfirmee: true }))
                setErreurForm(null)
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Latitude (rempli automatiquement)</label>
            <input
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: e.target.value, positionConfirmee: false })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="50.9048"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Longitude (rempli automatiquement)</label>
            <input
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: e.target.value, positionConfirmee: false })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="4.1938"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Rayon toléré (mètres)
            </label>
            <input
              value={form.rayon_metres}
              onChange={(e) => setForm({ ...form, rayon_metres: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Client (optionnel)</label>
            <input
              value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="ex. Famille Janssens"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Date de début (optionnel)</label>
            <input
              type="date"
              value={form.date_debut}
              onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Date de fin (optionnel)</label>
            <input
              type="date"
              value={form.date_fin}
              onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          {erreurForm && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:col-span-2">⚠ {erreurForm}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-2"
          >
            {saving ? 'Enregistrement...' : form.positionConfirmee ? 'Enregistrer' : 'Enregistrer (emplacement à confirmer)'}
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
                <th className="px-4 py-3 whitespace-nowrap">Chantier</th>
                <th className="px-4 py-3 whitespace-nowrap">Adresse</th>
                <th className="px-4 py-3 whitespace-nowrap">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {chantiersFiltres.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">
                      {c.nom}
                      {c.proposant && (
                        <span className="block text-xs font-normal text-slate-400">
                          Proposé par {c.proposant.full_name} le{' '}
                          {new Date(c.created_at).toLocaleDateString('fr-BE')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{c.adresse}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${BADGES[c.statut].classe}`}>
                        {BADGES[c.statut].label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {c.statut === 'en_attente' ? (
                        <>
                          <button onClick={() => startEdit(c)} className="mr-3 text-slate-500 hover:underline">
                            Modifier
                          </button>
                          <button
                            onClick={() => approuver(c)}
                            className="mr-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            ✓ Approuver
                          </button>
                          <button onClick={() => refuser(c)} className="text-red-600 hover:underline">
                            Refuser
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                            className="mr-3 text-orange-600 hover:underline"
                          >
                            Assigner
                          </button>
                          <button onClick={() => startEdit(c)} className="mr-3 text-slate-500 hover:underline">
                            Modifier
                          </button>
                          <button onClick={() => toggleStatut(c)} className="text-slate-500 hover:underline">
                            {c.statut === 'actif' ? 'Archiver' : 'Réactiver'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr className="border-t border-slate-100 bg-slate-50">
                      <td colSpan={4} className="px-4 py-4">
                        <p className="mb-2 text-sm font-medium text-slate-700">
                          Ouvriers assignés à ce chantier :
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {ouvriers.map((o) => {
                            const checked = (assignments[c.id] ?? []).includes(o.id)
                            return (
                              <label
                                key={o.id}
                                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                                  checked
                                    ? 'border-orange-400 bg-orange-50 text-orange-800'
                                    : 'border-slate-200 text-slate-600'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAssignment(c.id, o.id)}
                                />
                                {o.full_name}
                              </label>
                            )
                          })}
                          {ouvriers.length === 0 && (
                            <p className="text-slate-400">Aucun ouvrier actif.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {chantiersFiltres.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    {chantiers.length === 0 ? 'Aucun chantier pour le moment.' : 'Aucun chantier dans cette catégorie.'}
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
