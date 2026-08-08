import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { PointageWithRelations, Profile, Chantier } from '../../types/database'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function fmtHeure(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
}

export default function AdminDashboardPage() {
  const [pointages, setPointages] = useState<PointageWithRelations[]>([])
  const [manquants, setManquants] = useState<{ ouvrier: Profile; chantier: Chantier }[]>([])
  const [loading, setLoading] = useState(true)

  const [exportFrom, setExportFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [exportTo, setExportTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [exporting, setExporting] = useState(false)

  const loadToday = useCallback(async () => {
    setLoading(true)

    const { data: todayPointages } = await supabase
      .from('pointages')
      .select('*, ouvrier:profiles(id, full_name), chantier:chantiers(id, nom)')
      .gte('check_in_at', startOfToday())
      .order('check_in_at', { ascending: false })

    setPointages((todayPointages as unknown as PointageWithRelations[]) ?? [])

    const [{ data: assignments }] = await Promise.all([
      supabase
        .from('chantier_assignments')
        .select('ouvrier:profiles(*), chantier:chantiers!inner(*)')
        .eq('chantier.statut', 'actif'),
    ])

    const pointedOuvrierIds = new Set(
      (todayPointages ?? []).map((p) => (p as unknown as PointageWithRelations).ouvrier_id)
    )

    const missing = (assignments ?? [])
      .map((a) => ({
        ouvrier: a.ouvrier as unknown as Profile,
        chantier: a.chantier as unknown as Chantier,
      }))
      .filter((a) => a.ouvrier?.active && a.chantier && !pointedOuvrierIds.has(a.ouvrier.id))

    setManquants(missing)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadToday()

    const channel = supabase
      .channel('pointages-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pointages' }, () => {
        loadToday()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadToday])

  async function handleExport() {
    setExporting(true)

    const { data } = await supabase
      .from('pointages')
      .select('*, ouvrier:profiles(id, full_name), chantier:chantiers(id, nom)')
      .gte('check_in_at', `${exportFrom}T00:00:00`)
      .lte('check_in_at', `${exportTo}T23:59:59`)
      .order('check_in_at')

    const rows = (data as unknown as PointageWithRelations[]) ?? []

    const header = ['Ouvrier', 'Chantier', 'Arrivée', 'Départ', 'Heures']
    const lines = rows.map((p) => {
      const heures = p.check_out_at
        ? (
            (new Date(p.check_out_at).getTime() - new Date(p.check_in_at).getTime()) /
            3600000
          ).toFixed(2)
        : ''
      return [
        p.ouvrier.full_name,
        p.chantier.nom,
        new Date(p.check_in_at).toLocaleString('fr-BE'),
        p.check_out_at ? new Date(p.check_out_at).toLocaleString('fr-BE') : '',
        heures,
      ]
    })

    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pointages_${exportFrom}_${exportTo}.csv`
    a.click()
    URL.revokeObjectURL(url)

    setExporting(false)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Vue du jour</h1>

        {manquants.length > 0 && (
          <div className="mb-4 rounded-xl bg-amber-50 p-4 text-amber-900">
            <p className="mb-1 font-semibold">⚠ Pas encore pointé aujourd'hui :</p>
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
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ouvrier</th>
                  <th className="px-4 py-3">Chantier</th>
                  <th className="px-4 py-3">Arrivée</th>
                  <th className="px-4 py-3">Départ</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {pointages.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.ouvrier.full_name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.chantier.nom}</td>
                    <td className="px-4 py-3">{fmtHeure(p.check_in_at)}</td>
                    <td className="px-4 py-3">{fmtHeure(p.check_out_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          p.check_out_at
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {p.check_out_at ? 'Terminé' : 'En cours'}
                      </span>
                    </td>
                  </tr>
                ))}
                {pointages.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      Aucun pointage aujourd'hui.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Export des heures</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Du</label>
            <input
              type="date"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Au</label>
            <input
              type="date"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {exporting ? 'Export...' : 'Exporter en CSV'}
          </button>
        </div>
      </div>
    </div>
  )
}
