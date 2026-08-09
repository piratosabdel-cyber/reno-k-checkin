import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { construireResumeOuvrier, formatHeures, type CreneauAvecDeplacement, type ResumeOuvrier } from '../../lib/heures'
import type { Chantier, PointageWithRelations } from '../../types/database'

function telechargerCsv(nomFichier: string, header: string[], lignes: (string | number)[][]) {
  const csv = [header, ...lignes]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

interface ResumeOuvrierAffiche extends ResumeOuvrier {
  pointages: PointageWithRelations[]
}

export default function AdminHeuresPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [pointages, setPointages] = useState<PointageWithRelations[]>([])
  const [chantiersMap, setChantiersMap] = useState<Map<string, Chantier>>(new Map())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: chantiersData }] = await Promise.all([
      supabase
        .from('pointages')
        .select('*, ouvrier:profiles(id, full_name), chantier:chantiers(id, nom)')
        .gte('heure_appareil', `${from}T00:00:00`)
        .lte('heure_appareil', `${to}T23:59:59`)
        .order('heure_appareil'),
      supabase.from('chantiers').select('*'),
    ])
    setPointages((data as unknown as PointageWithRelations[]) ?? [])
    setChantiersMap(new Map(((chantiersData as Chantier[]) ?? []).map((c) => [c.id, c])))
    setLoading(false)
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const parOuvrierRaw = new Map<string, PointageWithRelations[]>()
  for (const p of pointages) {
    const arr = parOuvrierRaw.get(p.ouvrier_id) ?? []
    arr.push(p)
    parOuvrierRaw.set(p.ouvrier_id, arr)
  }

  const resumeOuvriers: ResumeOuvrierAffiche[] = [...parOuvrierRaw.entries()]
    .map(([ouvrierId, ps]) => ({
      ...construireResumeOuvrier(ouvrierId, ps[0].ouvrier.full_name, ps, chantiersMap),
      pointages: ps,
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom))

  const nomChantier = (chantierId: string, ps: PointageWithRelations[]) =>
    ps.find((p) => p.chantier_id === chantierId)?.chantier.nom ?? '?'

  // Chantiers utilisés sur la période mais sans coordonnées GPS -> déplacement non calculable.
  const chantiersSansCoords = new Set<string>()
  for (const r of resumeOuvriers) {
    for (const c of r.creneaux) {
      const ch = chantiersMap.get(c.chantier_id)
      if (!ch?.latitude || !ch?.longitude) chantiersSansCoords.add(nomChantier(c.chantier_id, r.pointages))
    }
  }

  // Les heures par chantier restent "brutes" (temps réellement passé sur place) : la pause
  // de midi est une déduction par ouvrier/jour, pas rattachée à un chantier en particulier.
  const parChantier = new Map<string, { nom: string; totalTravailMs: number; totalDeplacementMs: number }>()
  for (const r of resumeOuvriers) {
    for (const c of r.creneaux) {
      const nom = nomChantier(c.chantier_id, r.pointages)
      const cur = parChantier.get(c.chantier_id) ?? { nom, totalTravailMs: 0, totalDeplacementMs: 0 }
      cur.totalTravailMs += c.dureeMs
      cur.totalDeplacementMs += c.deplacementMs
      parChantier.set(c.chantier_id, cur)
    }
  }

  function exporterOuvrier(r: ResumeOuvrierAffiche) {
    const parJour = new Map<string, CreneauAvecDeplacement[]>()
    for (const c of r.creneaux) {
      const jour = new Date(c.debut).toDateString()
      const arr = parJour.get(jour) ?? []
      arr.push(c)
      parJour.set(jour, arr)
    }

    const lignes: (string | number)[][] = []
    for (const [jour, cs] of parJour) {
      for (const c of cs) {
        lignes.push([
          new Date(c.debut).toLocaleDateString('fr-BE'),
          nomChantier(c.chantier_id, r.pointages),
          new Date(c.debut).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }),
          new Date(c.fin).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }),
          formatHeures(c.dureeMs),
          formatHeures(c.deplacementMs),
          formatHeures(c.dureeMs + c.deplacementMs),
        ])
      }
      const deduction = r.deductions.find((d) => d.jour === jour)
      if (deduction) {
        lignes.push([
          new Date(jour).toLocaleDateString('fr-BE'),
          'Pause de midi (déduction)',
          '',
          '',
          `-${formatHeures(deduction.deductionMs)}`,
          '',
          `-${formatHeures(deduction.deductionMs)}`,
        ])
      }
    }

    const totalTravailNetMs = r.totalTravailBrutMs - r.totalPauseMs
    lignes.push([
      '',
      '',
      '',
      'TOTAL',
      formatHeures(totalTravailNetMs),
      formatHeures(r.totalDeplacementMs),
      formatHeures(totalTravailNetMs + r.totalDeplacementMs),
    ])

    telechargerCsv(
      `heures_${r.nom.replace(/\s+/g, '_')}_${from}_${to}.csv`,
      ['Date', 'Chantier', 'Arrivée', 'Départ', 'Heures', 'Déplacement (aller)', 'Total payé'],
      lignes
    )
  }

  function exporterBrut() {
    const lignes = pointages.map((p) => [
      p.ouvrier.full_name,
      p.chantier.nom,
      p.type,
      new Date(p.heure_appareil).toLocaleString('fr-BE'),
      p.latitude ?? '',
      p.longitude ?? '',
      p.precision_gps_m ?? '',
      p.statut,
      p.justification ?? '',
    ])
    telechargerCsv(
      `pointages_bruts_${from}_${to}.csv`,
      ['Ouvrier', 'Chantier', 'Type', 'Heure', 'Latitude', 'Longitude', 'Précision GPS (m)', 'Statut', 'Justification'],
      lignes
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-slate-900">Heures travaillées</h1>
        <p className="mb-4 text-sm text-slate-500">
          Déplacement payé à l'aller uniquement : 15 min si le chantier est à moins de 10 km du bureau, 30 min
          au-delà. Pause de midi déduite forfaitairement (30 min/jour), sauf le samedi (pause payée) — affichée
          séparément, elle n'est jamais retirée des heures d'un chantier précis.
        </p>

        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Du</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Au</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        {chantiersSansCoords.size > 0 && (
          <div className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            ⚠ Déplacement non calculé pour : <strong>{[...chantiersSansCoords].join(', ')}</strong> — ajoute leurs
            coordonnées GPS dans "Chantiers" pour que le forfait s'applique.
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Chargement...</p>
        ) : (
          <>
            <div className="mb-6 overflow-hidden rounded-xl bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Ouvrier</th>
                    <th className="px-4 py-3">Heures chantiers</th>
                    <th className="px-4 py-3">Pause midi</th>
                    <th className="px-4 py-3">Déplacement</th>
                    <th className="px-4 py-3">Total payé</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {resumeOuvriers.map((r) => (
                    <tr key={r.ouvrierId} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{r.nom}</td>
                      <td className="px-4 py-3 text-slate-700">{formatHeures(r.totalTravailBrutMs)}</td>
                      <td className="px-4 py-3 text-slate-500">-{formatHeures(r.totalPauseMs)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatHeures(r.totalDeplacementMs)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatHeures(r.totalTravailBrutMs - r.totalPauseMs + r.totalDeplacementMs)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.creneaux.length > 0 && (
                          <Link
                            to={`/admin/heures/fiche/${r.ouvrierId}?from=${from}&to=${to}`}
                            target="_blank"
                            className="mr-3 text-orange-600 hover:underline"
                          >
                            Fiche PDF
                          </Link>
                        )}
                        <button
                          onClick={() => exporterOuvrier(r)}
                          disabled={r.creneaux.length === 0}
                          className="text-slate-500 hover:underline disabled:text-slate-300"
                        >
                          CSV
                        </button>
                      </td>
                    </tr>
                  ))}
                  {resumeOuvriers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                        Aucun pointage sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Chantier</th>
                    <th className="px-4 py-3">Heures travaillées</th>
                    <th className="px-4 py-3">Déplacement</th>
                    <th className="px-4 py-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...parChantier.values()].map((c) => (
                    <tr key={c.nom} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{c.nom}</td>
                      <td className="px-4 py-3 text-slate-700">{formatHeures(c.totalTravailMs)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatHeures(c.totalDeplacementMs)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatHeures(c.totalTravailMs + c.totalDeplacementMs)}
                      </td>
                    </tr>
                  ))}
                  {parChantier.size === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                        Aucun pointage sur cette période.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                Ce tableau ne déduit pas la pause de midi (elle est par ouvrier/jour, pas par chantier) — voir le
                total réel payé par ouvrier ci-dessus.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Export complet</h2>
        <p className="mb-4 text-sm text-slate-500">
          Tous les pointages bruts de la période (utile pour la comptabilité ou un contrôle détaillé).
        </p>
        <button
          onClick={exporterBrut}
          className="rounded-lg bg-slate-700 px-4 py-2 font-medium text-white hover:bg-slate-800"
        >
          Exporter tous les pointages (CSV)
        </button>
      </div>
    </div>
  )
}
