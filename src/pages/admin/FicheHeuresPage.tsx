import { Fragment, useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { construireResumeOuvrier, formatHeures, type CreneauAvecDeplacement } from '../../lib/heures'
import type { Chantier, Pointage, Profile } from '../../types/database'

export default function FicheHeuresPage() {
  const { ouvrierId } = useParams<{ ouvrierId: string }>()
  const [searchParams] = useSearchParams()
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  const [ouvrier, setOuvrier] = useState<Profile | null>(null)
  const [pointages, setPointages] = useState<Pointage[]>([])
  const [chantiersMap, setChantiersMap] = useState<Map<string, Chantier>>(new Map())
  const [nomsChantiers, setNomsChantiers] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ouvrierId) return
    ;(async () => {
      setLoading(true)
      const [{ data: profil }, { data: ps }, { data: chantiersData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', ouvrierId).single(),
        supabase
          .from('pointages')
          .select('*')
          .eq('ouvrier_id', ouvrierId)
          .gte('heure_appareil', `${from}T00:00:00`)
          .lte('heure_appareil', `${to}T23:59:59`)
          .order('heure_appareil'),
        supabase.from('chantiers').select('*'),
      ])
      setOuvrier(profil as Profile)
      setPointages((ps as Pointage[]) ?? [])
      const map = new Map(((chantiersData as Chantier[]) ?? []).map((c) => [c.id, c]))
      setChantiersMap(map)
      setNomsChantiers(new Map([...map.entries()].map(([id, c]) => [id, c.nom])))
      setLoading(false)
    })()
  }, [ouvrierId, from, to])

  if (loading || !ouvrier) {
    return <div className="p-8 text-slate-400">Chargement...</div>
  }

  const resume = construireResumeOuvrier(ouvrier.id, ouvrier.full_name, pointages, chantiersMap)

  const parJour = new Map<string, CreneauAvecDeplacement[]>()
  for (const c of resume.creneaux) {
    const jour = new Date(c.debut).toDateString()
    const arr = parJour.get(jour) ?? []
    arr.push(c)
    parJour.set(jour, arr)
  }

  const totalTravailNetMs = resume.totalTravailBrutMs - resume.totalPauseMs
  const totalPayeMs = totalTravailNetMs + resume.totalDeplacementMs

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-3xl px-6 py-8 print:px-0 print:py-0">
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link to="/admin/heures" className="text-sm text-slate-500 hover:underline">
            ← Retour
          </Link>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
          >
            Imprimer / Enregistrer en PDF
          </button>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
          <div className="mb-8 flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Reno-K</h1>
              <p className="text-slate-500">Fiche d'heures</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-slate-900">{ouvrier.full_name}</p>
              <p className="text-sm text-slate-500">
                Du {new Date(from).toLocaleDateString('fr-BE')} au {new Date(to).toLocaleDateString('fr-BE')}
              </p>
            </div>
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-slate-500">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Chantier</th>
                <th className="py-2 pr-2">Check-in</th>
                <th className="py-2 pr-2">Check-out</th>
                <th className="py-2 pr-2 text-right">Heures</th>
                <th className="py-2 pr-2 text-right">Déplacement</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...parJour.entries()].map(([jour, creneaux]) => (
                <Fragment key={jour}>
                  {creneaux.map((c, i) => (
                    <tr key={`${jour}-${i}`} className="border-b border-slate-100">
                      <td className="py-2 pr-2 text-slate-700">
                        {i === 0 ? new Date(c.debut).toLocaleDateString('fr-BE') : ''}
                      </td>
                      <td className="py-2 pr-2 text-slate-700">{nomsChantiers.get(c.chantier_id) ?? '?'}</td>
                      <td className="py-2 pr-2 text-slate-700">
                        {new Date(c.debut).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                        {c.arriveeHorsZone && (
                          <span className="ml-1 text-xs font-medium text-amber-600">(hors zone)</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-slate-700">
                        {new Date(c.fin).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
                        {c.departHorsZone && (
                          <span className="ml-1 text-xs font-medium text-amber-600">(hors zone)</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right text-slate-700">{formatHeures(c.dureeMs)}</td>
                      <td className="py-2 pr-2 text-right text-slate-500">{formatHeures(c.deplacementMs)}</td>
                      <td className="py-2 text-right font-medium text-slate-900">
                        {formatHeures(c.dureeMs + c.deplacementMs)}
                      </td>
                    </tr>
                  ))}
                  {resume.deductions
                    .filter((d) => d.jour === jour)
                    .map((d) => (
                      <tr key={`${jour}-pause`} className="border-b border-slate-100 text-amber-700">
                        <td className="py-2 pr-2" />
                        <td className="py-2 pr-2 italic">Pause de midi</td>
                        <td className="py-2 pr-2" />
                        <td className="py-2 pr-2" />
                        <td className="py-2 pr-2 text-right">-{formatHeures(d.deductionMs)}</td>
                        <td className="py-2 pr-2" />
                        <td className="py-2 text-right">-{formatHeures(d.deductionMs)}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
              {resume.creneaux.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    Aucun pointage sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end break-inside-avoid">
            <div className="w-64 space-y-1">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Heures</span>
                <span>{formatHeures(totalTravailNetMs)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Déplacement</span>
                <span>{formatHeures(resume.totalDeplacementMs)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-slate-300 pt-1 text-base font-bold text-slate-900">
                <span>Total</span>
                <span>{formatHeures(totalPayeMs)}</span>
              </div>
            </div>
          </div>

          <p className="mt-8 text-xs text-slate-400">
            Pause de midi déduite forfaitairement (30 min/jour), sauf le samedi. Déplacement payé à l'aller,
            forfait unique par jour selon la distance au bureau (15 min si &lt; 10 km, 30 min au-delà).
          </p>
        </div>
      </div>
    </div>
  )
}
