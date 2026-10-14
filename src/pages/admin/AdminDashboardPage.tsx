import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import PointagesMap from '../../components/PointagesMap'
import LieuLabel from '../../components/LieuLabel'
import type { Pointage, PointageWithRelations, Profile, Chantier, TypePointage } from '../../types/database'

type Echec = {
  client_uuid: string
  type: TypePointage
  heure_appareil: string
  erreur_code: string | null
  erreur_message: string | null
  ouvrier: { full_name: string } | null
  chantier: { nom: string } | null
}

/** Un pointage synchronisé plus de 10 min après avoir été fait (réseau absent sur le chantier). */
function arriveEnRetard(p: Pointage) {
  return p.cree_hors_ligne && new Date(p.heure_serveur).getTime() - new Date(p.heure_appareil).getTime() > 10 * 60_000
}

const LABELS: Record<TypePointage, string> = {
  arrivee: 'Arrivée',
  pause_debut: 'Début de pause',
  pause_fin: 'Fin de pause',
  depart: 'Départ',
}

function aujourdhui() {
  return new Date().toISOString().slice(0, 10)
}

function fmtHeure(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
}

function statutPresence(dernierType: TypePointage, aujourdhui: boolean): { label: string; classe: string } {
  if (dernierType === 'arrivee' || dernierType === 'pause_fin')
    return aujourdhui
      ? { label: 'Présent', classe: 'bg-emerald-100 text-emerald-700' }
      : { label: 'Départ manquant', classe: 'bg-red-100 text-red-700' }
  if (dernierType === 'pause_debut') return { label: 'En pause', classe: 'bg-amber-100 text-amber-700' }
  return { label: 'Parti', classe: 'bg-slate-100 text-slate-500' }
}

export default function AdminDashboardPage() {
  const [date, setDate] = useState(aujourdhui())
  const [pointages, setPointages] = useState<PointageWithRelations[]>([])
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [manquants, setManquants] = useState<{ ouvrier: Profile; chantier: Chantier }[]>([])
  const [echecs, setEchecs] = useState<Echec[]>([])
  const [loading, setLoading] = useState(true)

  const estAujourdhui = date === aujourdhui()

  const loadJour = useCallback(async () => {
    setLoading(true)

    const { data: pointagesJour } = await supabase
      .from('pointages')
      .select('*, ouvrier:profiles(id, full_name, active), chantier:chantiers(id, nom)')
      .gte('heure_appareil', `${date}T00:00:00`)
      .lte('heure_appareil', `${date}T23:59:59`)
      .order('heure_appareil', { ascending: false })

    // Les ouvriers dont l'accès est bloqué n'apparaissent plus dans la vue du jour.
    const rows = ((pointagesJour as unknown as PointageWithRelations[]) ?? []).filter(
      (p) => (p.ouvrier as Profile)?.active !== false
    )
    setPointages(rows)

    // Pointages refusés par le serveur et restés sur le téléphone de l'ouvrier.
    // Dès qu'un pointage finit par passer, il est dans `pointages` -> on le masque ici.
    const { data: echecsJour } = await supabase
      .from('pointages_echecs')
      .select('*, ouvrier:profiles(full_name), chantier:chantiers(nom)')
      .gte('heure_appareil', `${date}T00:00:00`)
      .lte('heure_appareil', `${date}T23:59:59`)
      .order('heure_appareil')
    const uuidsRecus = new Set(((pointagesJour as Pointage[]) ?? []).map((p) => p.client_uuid))
    setEchecs(((echecsJour as unknown as Echec[]) ?? []).filter((e) => !uuidsRecus.has(e.client_uuid)))

    const [{ data: assignments }, { data: chantiersActifs }] = await Promise.all([
      supabase
        .from('chantier_assignments')
        .select('ouvrier:profiles(*), chantier:chantiers!inner(*)')
        .eq('chantier.statut', 'actif'),
      supabase.from('chantiers').select('*').eq('statut', 'actif'),
    ])

    setChantiers((chantiersActifs as Chantier[]) ?? [])

    const pointedOuvrierIds = new Set(rows.map((p) => p.ouvrier_id))

    const missing = (assignments ?? [])
      .map((a) => ({
        ouvrier: a.ouvrier as unknown as Profile,
        chantier: a.chantier as unknown as Chantier,
      }))
      .filter((a) => a.ouvrier?.active && a.chantier && !pointedOuvrierIds.has(a.ouvrier.id))

    setManquants(missing)
    setLoading(false)
  }, [date])

  useEffect(() => {
    loadJour()

    const channel = supabase
      .channel('pointages-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pointages' }, () => {
        loadJour()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pointages_echecs' }, () => {
        loadJour()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadJour])

  // Statut de présence "en direct" par ouvrier : basé sur son dernier évènement du jour.
  const presenceParOuvrier = new Map<
    string,
    {
      ouvrier: Profile
      chantier: Chantier
      dernierType: TypePointage
      latitude: number | null
      longitude: number | null
      hors_zone: boolean
      distance_chantier_m: number | null
    }
  >()
  for (const p of [...pointages].reverse()) {
    presenceParOuvrier.set(p.ouvrier_id, {
      ouvrier: p.ouvrier as Profile,
      chantier: p.chantier as Chantier,
      dernierType: p.type,
      latitude: p.latitude,
      longitude: p.longitude,
      hors_zone: p.hors_zone,
      distance_chantier_m: p.distance_chantier_m,
    })
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">
          {estAujourdhui
            ? 'Vue du jour'
            : `Vue du ${new Date(`${date}T00:00:00`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        </h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={aujourdhui()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {!estAujourdhui && (
            <button
              onClick={() => setDate(aujourdhui())}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Aujourd'hui
            </button>
          )}
        </div>
      </div>

      {echecs.length > 0 && (
        <div className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">
          <p className="mb-1 font-semibold">⛔ Pointages refusés par le serveur (gardés sur le téléphone de l'ouvrier) :</p>
          <ul className="list-inside list-disc text-sm">
            {echecs.map((e) => (
              <li key={e.client_uuid}>
                {e.ouvrier?.full_name ?? 'Ouvrier inconnu'} — {LABELS[e.type]} à {fmtHeure(e.heure_appareil)}
                {e.chantier && <> sur {e.chantier.nom}</>}
                <span className="text-red-700">
                  {' '}
                  ({e.erreur_code === '42501' ? 'compte bloqué ou règle de sécurité' : (e.erreur_message ?? e.erreur_code)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {manquants.length > 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900">
          <p className="mb-1 font-semibold">
            ⚠ {estAujourdhui ? "Pas encore pointé aujourd'hui" : 'N\'a pas pointé ce jour-là'} :
          </p>
          <ul className="list-inside list-disc text-sm">
            {manquants.map((m, i) => (
              <li key={i}>
                {m.ouvrier.full_name} — prévu sur {m.chantier.nom}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Chargement...</p>
      ) : (
        <>
          <div className="mb-6">
            <PointagesMap pointages={pointages} chantiers={chantiers} />
          </div>

          <div className="mb-6 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Ouvrier</th>
                    <th className="px-4 py-3 whitespace-nowrap">Chantier</th>
                    <th className="px-4 py-3 whitespace-nowrap">Statut actuel</th>
                    <th className="px-4 py-3 whitespace-nowrap">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {[...presenceParOuvrier.values()].map((p) => {
                    const s = statutPresence(p.dernierType, estAujourdhui)
                    return (
                      <tr key={p.ouvrier.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{p.ouvrier.full_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">{p.chantier.nom}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${s.classe}`}>
                            {s.label}
                          </span>
                          {p.hors_zone && p.distance_chantier_m != null && (
                            <span className="ml-2 text-xs text-amber-600">
                              ({p.distance_chantier_m} m
                              {p.latitude != null && p.longitude != null && (
                                <>
                                  {' — '}
                                  <LieuLabel lat={p.latitude} lng={p.longitude} chantiers={chantiers} />
                                </>
                              )}
                              )
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {p.latitude != null && p.longitude != null ? (
                            <a
                              href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-600 hover:underline"
                            >
                              📍 Voir sur la carte
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {presenceParOuvrier.size === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                        Personne n'a pointé {estAujourdhui ? "aujourd'hui" : 'ce jour-là'}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Ouvrier</th>
                    <th className="px-4 py-3 whitespace-nowrap">Chantier</th>
                    <th className="px-4 py-3 whitespace-nowrap">Type</th>
                    <th className="px-4 py-3 whitespace-nowrap">Heure</th>
                    <th className="px-4 py-3 whitespace-nowrap">Statut</th>
                    <th className="px-4 py-3 whitespace-nowrap">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {pointages.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{p.ouvrier.full_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{p.chantier.nom}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{LABELS[p.type]}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {fmtHeure(p.heure_appareil)}
                        {arriveEnRetard(p) && (
                          <span
                            className="ml-2 text-xs text-slate-500"
                            title="Pointé sans réseau, envoyé plus tard par le téléphone"
                          >
                            📶 reçu à {fmtHeure(p.heure_serveur)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            p.statut === 'hors_zone'
                              ? 'bg-amber-100 text-amber-700'
                              : p.statut === 'corrige'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {p.statut === 'accepte' ? 'Accepté' : p.statut === 'hors_zone' ? 'Hors zone' : p.statut}
                        </span>
                        {p.hors_zone && p.distance_chantier_m != null && (
                          <span className="ml-2 text-xs text-slate-500">
                            ({p.distance_chantier_m} m
                            {p.latitude != null && p.longitude != null && (
                              <>
                                {' — '}
                                <LieuLabel lat={p.latitude} lng={p.longitude} chantiers={chantiers} />
                              </>
                            )}
                            )
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.latitude != null && p.longitude != null ? (
                          <a
                            href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-orange-600 hover:underline"
                          >
                            📍 Voir sur la carte
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {pointages.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                        Aucun pointage {estAujourdhui ? "aujourd'hui" : 'ce jour-là'}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
