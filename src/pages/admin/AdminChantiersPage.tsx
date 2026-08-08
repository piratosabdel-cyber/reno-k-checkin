import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Chantier, Profile } from '../../types/database'

const emptyForm = {
  id: null as string | null,
  nom: '',
  adresse: '',
  latitude: '',
  longitude: '',
  rayon_metres: '200',
}

export default function AdminChantiersPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [ouvriers, setOuvriers] = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: o }, { data: a }] = await Promise.all([
      supabase.from('chantiers').select('*').order('statut').order('nom'),
      supabase.from('profiles').select('*').eq('role', 'ouvrier').eq('active', true).order('full_name'),
      supabase.from('chantier_assignments').select('chantier_id, ouvrier_id'),
    ])
    setChantiers((c as Chantier[]) ?? [])
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
  }, [])

  function startEdit(c?: Chantier) {
    if (c) {
      setForm({
        id: c.id,
        nom: c.nom,
        adresse: c.adresse,
        latitude: c.latitude?.toString() ?? '',
        longitude: c.longitude?.toString() ?? '',
        rayon_metres: c.rayon_metres.toString(),
      })
    } else {
      setForm(emptyForm)
    }
    setShowForm(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      nom: form.nom,
      adresse: form.adresse,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      rayon_metres: Number(form.rayon_metres) || 200,
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Chantiers</h1>
        <button
          onClick={() => (showForm ? setShowForm(false) : startEdit())}
          className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
        >
          {showForm ? 'Annuler' : '+ Nouveau chantier'}
        </button>
      </div>

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
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="ex. Witteramsdal 93, Asse"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Latitude (optionnel)</label>
            <input
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="50.9048"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Longitude (optionnel)</label>
            <input
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: e.target.value })}
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

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-2"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
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
                <th className="px-4 py-3">Chantier</th>
                <th className="px-4 py-3">Adresse</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {chantiers.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.nom}</td>
                    <td className="px-4 py-3 text-slate-500">{c.adresse}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          c.statut === 'actif'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {c.statut === 'actif' ? 'Actif' : 'Terminé'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
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
                        {c.statut === 'actif' ? 'Terminer' : 'Réactiver'}
                      </button>
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
              {chantiers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Aucun chantier pour le moment.
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
