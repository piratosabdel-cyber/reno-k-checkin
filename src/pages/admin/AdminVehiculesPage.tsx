import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types/database'

interface Vehicule {
  id: string
  paj_device_id: number
  paj_imei: string | null
  nom: string
  plaque: string | null
  ouvrier_id: string | null
  carte_lukoil: string | null
  actif: boolean
}

interface KmJour {
  vehicule_id: string
  jour: string
  km: number
  points: number
  premier_mouvement: string | null
  dernier_mouvement: string | null
}

interface Controle {
  id: string
  vehicule_id: string
  jour: string | null
  type: string
  gravite: 'info' | 'attention' | 'alerte'
  message: string
}

interface Synchro {
  id: string
  mois: string
  origine: string
  debut: string
  fin: string | null
  statut: 'en_cours' | 'ok' | 'erreur'
  message: string | null
}

const STYLE_GRAVITE: Record<Controle['gravite'], string> = {
  alerte: 'bg-red-100 text-red-800',
  attention: 'bg-amber-100 text-amber-800',
  info: 'bg-slate-100 text-slate-600',
}
const LIBELLE_GRAVITE: Record<Controle['gravite'], string> = { alerte: 'Alerte', attention: 'À vérifier', info: 'Info' }

function moisPrecedent(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() - 1, 15).toISOString().slice(0, 7)
}

const fmtJour = (jour: string) =>
  new Date(`${jour}T12:00:00`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })

export default function AdminVehiculesPage() {
  const [mois, setMois] = useState(moisPrecedent)
  const [vehicules, setVehicules] = useState<Vehicule[]>([])
  const [ouvriers, setOuvriers] = useState<Profile[]>([])
  const [kms, setKms] = useState<KmJour[]>([])
  const [controles, setControles] = useState<Controle[]>([])
  const [synchros, setSynchros] = useState<Synchro[]>([])
  const [loading, setLoading] = useState(true)
  const [lancement, setLancement] = useState(false)
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null)
  const [edition, setEdition] = useState<Vehicule | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const debut = `${mois}-01`
    const [a, m] = mois.split('-').map(Number)
    const fin = new Date(a, m, 0).toLocaleDateString('en-CA')
    const [v, o, k, c, s] = await Promise.all([
      supabase.from('vehicules').select('*').order('actif', { ascending: false }).order('nom'),
      supabase.from('profiles').select('*').eq('role', 'ouvrier').order('full_name'),
      supabase
        .from('vehicules_km_jour')
        .select('vehicule_id, jour, km, points, premier_mouvement, dernier_mouvement')
        .gte('jour', debut)
        .lte('jour', fin)
        .order('jour'),
      supabase.from('vehicules_controles').select('*').eq('mois', debut).order('jour'),
      supabase.from('vehicules_synchros').select('*').order('debut', { ascending: false }).limit(5),
    ])
    setVehicules((v.data as Vehicule[]) ?? [])
    setOuvriers((o.data as Profile[]) ?? [])
    setKms(((k.data as KmJour[]) ?? []).map((x) => ({ ...x, km: Number(x.km) })))
    setControles((c.data as Controle[]) ?? [])
    setSynchros((s.data as Synchro[]) ?? [])
    setLoading(false)
  }, [mois])

  useEffect(() => {
    load()
  }, [load])

  async function lancerControle() {
    setLancement(true)
    setRetour(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const res = await fetch('/api/paj-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ mois }),
      })
      const texte = await res.text()
      let j: { ok?: boolean; message?: string; error?: string } = {}
      try {
        j = JSON.parse(texte)
      } catch {
        j = { error: `Réponse inattendue du serveur (${res.status})` }
      }
      setRetour({ ok: res.ok && !!j.ok, texte: j.message ?? j.error ?? `Erreur ${res.status}` })
    } catch (e) {
      setRetour({ ok: false, texte: e instanceof Error ? e.message : String(e) })
    }
    setLancement(false)
    load()
  }

  async function enregistrerVehicule() {
    if (!edition) return
    const { error } = await supabase
      .from('vehicules')
      .update({
        nom: edition.nom.trim(),
        plaque: edition.plaque?.trim() || null,
        ouvrier_id: edition.ouvrier_id || null,
        carte_lukoil: edition.carte_lukoil?.trim() || null,
        actif: edition.actif,
      })
      .eq('id', edition.id)
    if (error) {
      alert(error.message)
      return
    }
    setEdition(null)
    load()
  }

  const nomOuvrier = (id: string | null) => ouvriers.find((o) => o.id === id)?.full_name ?? '—'

  const resume = useMemo(
    () =>
      vehicules.map((v) => {
        const lignes = kms.filter((k) => k.vehicule_id === v.id)
        const ctrl = controles.filter((c) => c.vehicule_id === v.id)
        return {
          v,
          km: lignes.reduce((s, k) => s + k.km, 0),
          joursRoules: lignes.filter((k) => k.km >= 10).length,
          joursSansSignal: lignes.filter((k) => k.points === 0).length,
          alertes: ctrl.filter((c) => c.gravite === 'alerte').length,
          aVerifier: ctrl.filter((c) => c.gravite === 'attention').length,
        }
      }),
    [vehicules, kms, controles]
  )

  const derniere = synchros[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Véhicules</h1>
          <p className="text-sm text-slate-500">
            Km GPS (PAJ) et contrôle des incohérences. Contrôle automatique le 2 de chaque mois pour le mois
            précédent.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mois}
            onChange={(e) => setMois(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={lancerControle}
            disabled={lancement}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {lancement ? 'Récupération en cours… (jusqu’à 5 min)' : 'Lancer le contrôle maintenant'}
          </button>
        </div>
      </div>

      {retour && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            retour.ok ? 'border-green-300 bg-green-50 text-green-900' : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          {retour.texte}
        </div>
      )}
      {derniere && (
        <p className="text-xs text-slate-500">
          Dernière synchronisation : {new Date(derniere.debut).toLocaleString('fr-BE')} ({derniere.origine}, mois{' '}
          {derniere.mois.slice(0, 7)}) — {derniere.statut === 'ok' ? '✔' : derniere.statut === 'en_cours' ? '⏳' : '⚠'}{' '}
          {derniere.message}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement…</p>
      ) : vehicules.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-sm text-slate-600 shadow-sm">
          Aucun véhicule pour l’instant. Cliquez sur « Lancer le contrôle maintenant » : la liste des traceurs PAJ sera
          importée automatiquement.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Véhicule</th>
                  <th className="px-4 py-3">Chauffeur</th>
                  <th className="px-4 py-3 text-right">Km du mois</th>
                  <th className="px-4 py-3 text-right">Jours roulés</th>
                  <th className="px-4 py-3 text-right">Jours sans signal</th>
                  <th className="px-4 py-3">Contrôle</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resume.map(({ v, km, joursRoules, joursSansSignal, alertes, aVerifier }) => (
                  <tr key={v.id} className={v.actif ? '' : 'text-slate-400'}>
                    <td className="px-4 py-3">
                      <button className="text-left font-medium hover:underline" onClick={() => setDetailId(detailId === v.id ? null : v.id)}>
                        {v.nom}
                      </button>
                      <div className="text-xs text-slate-500">
                        {v.plaque ?? 'plaque ?'} · carte {v.carte_lukoil ?? '?'}
                        {!v.actif && ' · inactif'}
                      </div>
                    </td>
                    <td className="px-4 py-3">{nomOuvrier(v.ouvrier_id)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{Math.round(km).toLocaleString('fr-BE')}</td>
                    <td className="px-4 py-3 text-right">{joursRoules}</td>
                    <td className={`px-4 py-3 text-right ${joursSansSignal > 1 ? 'font-semibold text-red-700' : ''}`}>
                      {joursSansSignal}
                    </td>
                    <td className="px-4 py-3">
                      {alertes > 0 && <span className="mr-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">{alertes} alerte(s)</span>}
                      {aVerifier > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{aVerifier} à vérifier</span>
                      )}
                      {alertes + aVerifier === 0 && <span className="text-xs text-green-700">OK</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEdition(v)} className="text-xs text-orange-700 hover:underline">
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detailId && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-semibold">
                Détail par jour — {vehicules.find((v) => v.id === detailId)?.nom}
              </h2>
              <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4 lg:grid-cols-6">
                {kms
                  .filter((k) => k.vehicule_id === detailId)
                  .map((k) => (
                    <div key={k.jour} className={`rounded px-2 py-1 ${k.points === 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50'}`}>
                      <span className="text-slate-500">{fmtJour(k.jour)}</span>{' '}
                      <strong>{k.points === 0 ? 'pas de signal' : `${k.km} km`}</strong>
                      {k.premier_mouvement && (
                        <div className="text-slate-400">
                          {k.premier_mouvement}–{k.dernier_mouvement}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">Incohérences du mois ({controles.length})</h2>
            {controles.length === 0 ? (
              <p className="text-sm text-slate-500">Rien à signaler, ou contrôle pas encore lancé pour ce mois.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {controles
                  .slice()
                  .sort((a, b) => ['alerte', 'attention', 'info'].indexOf(a.gravite) - ['alerte', 'attention', 'info'].indexOf(b.gravite))
                  .map((c) => (
                    <li key={c.id} className="flex flex-wrap items-start gap-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE_GRAVITE[c.gravite]}`}>
                        {LIBELLE_GRAVITE[c.gravite]}
                      </span>
                      <span className="font-medium">{vehicules.find((v) => v.id === c.vehicule_id)?.nom}</span>
                      <span className="text-slate-700">{c.message}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </>
      )}

      {edition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Véhicule</h2>
            <p className="text-xs text-slate-500">Traceur PAJ {edition.paj_imei ?? edition.paj_device_id}</p>
            <label className="block text-sm">
              Nom
              <input
                value={edition.nom}
                onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Plaque
              <input
                value={edition.plaque ?? ''}
                onChange={(e) => setEdition({ ...edition, plaque: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Chauffeur habituel
              <select
                value={edition.ouvrier_id ?? ''}
                onChange={(e) => setEdition({ ...edition, ouvrier_id: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">— aucun —</option>
                {ouvriers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Carte Lukoil (4 derniers chiffres)
              <input
                value={edition.carte_lukoil ?? ''}
                onChange={(e) => setEdition({ ...edition, carte_lukoil: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edition.actif} onChange={(e) => setEdition({ ...edition, actif: e.target.checked })} />
              Actif (décocher pour ne plus le contrôler)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEdition(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
                Annuler
              </button>
              <button onClick={enregistrerVehicule} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white">
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
