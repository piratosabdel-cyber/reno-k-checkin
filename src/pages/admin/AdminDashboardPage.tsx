import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import PointagesMap from '../../components/PointagesMap'
import type { PointageWithRelations, Profile, Chantier, TypePointage } from '../../types/database'

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

function statutPresence(dernierType: TypePointage): { label: string; classe: string } {
  if (dernierType === 'arrivee' || dernierType === 'pause_fin')
    return { label: 'Présent', classe: 'bg-emerald-100 text-emerald-700' }
  if (dernierType === 'pause_debut') return { label: 'En pause', classe: 'bg-amber-100 text-amber-700' }
  return { label: 'Parti', classe: 'bg-slate-100 text-slate-500' }
}

export default function AdminDashboardPage() {
  const [date, setDate] = useState(aujourdhui())
  const [pointages, setPointages] = useState<PointageWithRelations[]>([])
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [manquants, setManquants] = useState<{ ouvrier: Profile; chantier: Chantier }[]>([])
  const [loading, setLoading] = useState(true)

  const estAujourdhui = date === aujourdhui()

  const loadJour = useCallback(async () => {
    setLoading(true)

    const { data: pointagesJour } = await supabase
      .from('pointages')
      .select('*, ouvrier:profiles(id, full_name), chantier:chantiers(id, nom)')
      .gte('heure_appareil', `${date}T00:00:00`)
      .lte('heure_appareil', `${date}T23:59:59`)
      .order('heure_appareil', { ascending: false })

    const rows = (pointagesJour as unknown as PointageWithRelations[]) ?? []
    setPointages(rows)

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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadJour])

  // Statut de présence "en direct" par ouvrier : basé sur son dernier évènement du jour.
  const presenceParOuvrier = new Map<string, { ouvrier: Profile; chantier: Chantier; dernierType: TypePointage }>()
  for (const p of [...pointages].reverse()) {
    presenceParOuvrier.set(p.ouvrier_id, {
      ouvrier: p.ouvrier as Profile,
      chantier: p.chantier as Chantier,
      dernierType: p.type,
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
                  </tr>
                </thead>
                <tbody>
                  {[...presenceParOuvrier.values()].map((p) => {
                    const s = statutPresence(p.dernierType)
                    return (
                      <tr key={p.ouvrier.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{p.ouvrier.full_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">{p.chantier.nom}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${s.classe}`}>
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {presenceParOuvrier.size === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
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
                  </tr>
                </thead>
                <tbody>
                  {pointages.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-900">{p.ouvrier.full_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{p.chantier.nom}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{LABELS[p.type]}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtHeure(p.heure_appareil)}</td>
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
                      </td>
                    </tr>
                  ))}
                  {pointages.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
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
