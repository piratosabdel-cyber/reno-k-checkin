import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LABEL_RESULTAT, RESULTATS, dateLocale, debutSemaine } from '../../lib/visites'
import { dateCourte, heure } from '../../lib/visitesAdmin'
import type { ResultatVisite } from '../../types/database'

type Periode = 'semaine' | 'mois'

interface LigneStat {
  id: string
  commerce_id: string
  resultat: ResultatVisite
  plateaux: number | null
  palettes: number | null
  date_relance: string | null
  heure_ouverture: string | null
  heure_appareil: string
  commerce: { nom: string; commune: string | null } | null
}

function bornes(periode: Periode, decalage: number): [Date, Date] {
  if (periode === 'semaine') {
    const debut = debutSemaine()
    debut.setDate(debut.getDate() + 7 * decalage)
    const fin = new Date(debut)
    fin.setDate(fin.getDate() + 7)
    return [debut, fin]
  }
  const n = new Date()
  return [new Date(n.getFullYear(), n.getMonth() + decalage, 1), new Date(n.getFullYear(), n.getMonth() + decalage + 1, 1)]
}

function Tuile({ valeur, label }: { valeur: string | number; label: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-3xl font-bold text-slate-900">{valeur}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}

export default function StatsVisites() {
  const [periode, setPeriode] = useState<Periode>('semaine')
  const [decalage, setDecalage] = useState(0)
  const [visites, setVisites] = useState<LigneStat[]>([])
  const [nouveaux, setNouveaux] = useState(0)
  const [relances, setRelances] = useState<LigneStat[]>([])

  const [debut, fin] = bornes(periode, decalage)

  useEffect(() => {
    const champs =
      'id, commerce_id, resultat, plateaux, palettes, date_relance, heure_ouverture, heure_appareil, commerce:commerces(nom, commune)'
    supabase
      .from('visites')
      .select(champs)
      .gte('heure_appareil', debut.toISOString())
      .lt('heure_appareil', fin.toISOString())
      .order('heure_appareil')
      .limit(5000)
      .then(({ data }) => setVisites((data as unknown as LigneStat[]) ?? []))
    supabase
      .from('commerces')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', debut.toISOString())
      .lt('created_at', fin.toISOString())
      .then(({ count }) => setNouveaux(count ?? 0))
  }, [periode, decalage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Relances à venir (30 jours) : seule compte la dernière visite de chaque commerce.
  useEffect(() => {
    const depuis = new Date()
    depuis.setDate(depuis.getDate() - 120)
    supabase
      .from('visites')
      .select('id, commerce_id, resultat, plateaux, palettes, date_relance, heure_ouverture, heure_appareil, commerce:commerces(nom, commune)')
      .gte('heure_appareil', depuis.toISOString())
      .order('heure_appareil', { ascending: false })
      .limit(5000)
      .then(({ data }) => {
        const derniere = new Map<string, LigneStat>()
        for (const v of (data as unknown as LigneStat[]) ?? []) if (!derniere.has(v.commerce_id)) derniere.set(v.commerce_id, v)
        const limite = new Date()
        limite.setDate(limite.getDate() + 30)
        setRelances(
          [...derniere.values()]
            .filter((v) => v.date_relance && v.date_relance <= dateLocale(limite))
            .sort((a, b) => a.date_relance!.localeCompare(b.date_relance!))
        )
      })
  }, [])

  const stats = useMemo(() => {
    const parResultat = Object.fromEntries(RESULTATS.map((r) => [r.valeur, 0])) as Record<ResultatVisite, number>
    let plateaux = 0
    let palettes = 0
    const jours = new Map<string, LigneStat[]>()
    for (const v of visites) {
      parResultat[v.resultat]++
      plateaux += v.plateaux ?? 0
      palettes += v.palettes ?? 0
      const j = dateLocale(new Date(v.heure_appareil))
      jours.set(j, [...(jours.get(j) ?? []), v])
    }
    return { parResultat, plateaux, palettes, jours: [...jours.entries()] }
  }, [visites])

  const total = visites.length
  const libelle =
    periode === 'semaine'
      ? `Semaine du ${debut.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })}`
      : debut.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        {(['semaine', 'mois'] as Periode[]).map((p) => (
          <button
            key={p}
            onClick={() => {
              setPeriode(p)
              setDecalage(0)
            }}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${periode === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {p === 'semaine' ? 'Semaine' : 'Mois'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setDecalage((d) => d - 1)} className="rounded-lg bg-slate-100 px-3 py-2">
            ←
          </button>
          <span className="min-w-44 text-center text-sm font-semibold text-slate-800">{libelle}</span>
          <button
            onClick={() => setDecalage((d) => Math.min(0, d + 1))}
            disabled={decalage === 0}
            className="rounded-lg bg-slate-100 px-3 py-2 disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile valeur={total} label="visites" />
        <Tuile valeur={nouveaux} label="nouveaux commerces" />
        <Tuile valeur={stats.plateaux} label="plateaux précommandés" />
        <Tuile valeur={stats.palettes} label="palettes précommandées" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Résultats</h2>
          <ul className="space-y-2">
            {RESULTATS.map((r) => {
              const n = stats.parResultat[r.valeur]
              const pct = total ? Math.round((n / total) * 100) : 0
              return (
                <li key={r.valeur} className="text-sm">
                  <div className="flex justify-between text-slate-700">
                    <span>{LABEL_RESULTAT[r.valeur]}</span>
                    <span>
                      {n} · {pct} %
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${r.couleur.split(' ')[0]}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-900">Journées de travail</h2>
          {stats.jours.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune visite.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {stats.jours.map(([j, vs]) => (
                  <tr key={j}>
                    <td className="py-2 text-slate-700">{dateCourte(`${j}T12:00:00`)}</td>
                    <td className="py-2 text-slate-600">
                      {heure(vs[0].heure_ouverture ?? vs[0].heure_appareil)} → {heure(vs[vs.length - 1].heure_appareil)}
                    </td>
                    <td className="py-2 text-right font-semibold text-slate-900">{vs.length} visites</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">Relances (en retard et 30 prochains jours)</h2>
        {relances.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune relance prévue.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {relances.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                <Link to={`/admin/commerces/${v.commerce_id}`} className="font-medium text-slate-900 hover:underline">
                  {v.commerce?.nom}
                  {v.commerce?.commune && <span className="font-normal text-slate-400"> · {v.commerce.commune}</span>}
                </Link>
                <span className={v.date_relance! < dateLocale(new Date()) ? 'font-semibold text-red-600' : 'text-slate-600'}>
                  {new Date(`${v.date_relance}T12:00:00`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
