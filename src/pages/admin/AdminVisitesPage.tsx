import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { ResultatVisite, TypeCommerce, VisiteAvecRelations } from '../../types/database'
import {
  BADGE_RESULTAT,
  LABEL_ALERTE,
  LABEL_RESULTAT,
  LABEL_TYPE,
  RESULTATS,
  TYPES_COMMERCE,
  dateLocale,
  debutSemaine,
} from '../../lib/visites'
import { SELECT_VISITE, appelAdmin, dateCourte, duree, exporterVisites, heure, liensPhotos } from '../../lib/visitesAdmin'
import VisitesMap from '../../components/visites/VisitesMap'
import StatsVisites from '../../components/visites/StatsVisites'
import EquipeCommerciale from '../../components/visites/EquipeCommerciale'

type Onglet = 'liste' | 'carte' | 'stats' | 'equipe'

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'liste', label: 'Liste' },
  { id: 'carte', label: 'Carte du jour' },
  { id: 'stats', label: 'Statistiques' },
  { id: 'equipe', label: 'Équipe' },
]

function finJour(date: string) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export default function AdminVisitesPage() {
  const [params, setParams] = useSearchParams()
  const onglet = (params.get('vue') as Onglet) ?? 'liste'
  const setOnglet = (o: Onglet) => setParams({ vue: o }, { replace: true })

  const [du, setDu] = useState(() => dateLocale(debutSemaine()))
  const [au, setAu] = useState(() => dateLocale(new Date()))
  const [type, setType] = useState<TypeCommerce | ''>('')
  const [resultat, setResultat] = useState<ResultatVisite | ''>('')
  const [filtreAlerte, setFiltreAlerte] = useState<'toutes' | 'avec' | 'sans'>('toutes')
  const [visites, setVisites] = useState<VisiteAvecRelations[]>([])
  const [chargement, setChargement] = useState(true)
  const [cochees, setCochees] = useState<Set<string>>(new Set())
  const [envoi, setEnvoi] = useState<{ enCours: boolean; message: string | null; ok: boolean }>({
    enCours: false,
    message: null,
    ok: true,
  })

  const [jour, setJour] = useState(() => dateLocale(new Date()))
  const [visitesJour, setVisitesJour] = useState<VisiteAvecRelations[]>([])
  const [photosJour, setPhotosJour] = useState<Record<string, string>>({})

  useEffect(() => {
    if (onglet !== 'liste') return
    setChargement(true)
    supabase
      .from('visites')
      .select(SELECT_VISITE)
      .gte('heure_serveur', new Date(`${du}T00:00:00`).toISOString())
      .lt('heure_serveur', finJour(au))
      .order('heure_serveur', { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        setVisites((data as unknown as VisiteAvecRelations[]) ?? [])
        setChargement(false)
      })
  }, [du, au, onglet])

  useEffect(() => {
    if (onglet !== 'carte') return
    supabase
      .from('visites')
      .select(SELECT_VISITE)
      .gte('heure_appareil', new Date(`${jour}T00:00:00`).toISOString())
      .lt('heure_appareil', finJour(jour))
      .order('heure_appareil')
      .then(async ({ data }) => {
        const v = (data as unknown as VisiteAvecRelations[]) ?? []
        setVisitesJour(v)
        setPhotosJour(await liensPhotos(v.map((x) => x.photo_path)))
      })
  }, [jour, onglet])

  const filtrees = useMemo(
    () =>
      visites.filter(
        (v) =>
          (!type || (v.type_commerce ?? v.commerce?.type) === type) &&
          (!resultat || v.resultat === resultat) &&
          (filtreAlerte === 'toutes' || (filtreAlerte === 'avec') === v.alertes.length > 0)
      ),
    [visites, type, resultat, filtreAlerte]
  )

  // On n'envoie que des visites visibles : une case cochée puis filtrée ne compte plus.
  const selection = filtrees.filter((v) => cochees.has(v.id))
  const aEnvoyer = selection.length > 0 ? selection : filtrees
  const toutCoche = filtrees.length > 0 && selection.length === filtrees.length

  function basculer(id: string) {
    setCochees((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function envoyerAOrder() {
    const fr = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-BE')
    const titre = [
      'Liste de visites Adala',
      type && LABEL_TYPE[type],
      resultat && LABEL_RESULTAT[resultat],
      du === au ? `le ${fr(du)}` : `du ${fr(du)} au ${fr(au)}`,
    ]
      .filter(Boolean)
      .join(' — ')
    if (!window.confirm(`Envoyer ${aEnvoyer.length} visite(s) à order@adalacola.com ?\n\n« ${titre} »`)) return
    setEnvoi({ enCours: true, message: null, ok: true })
    const r = await appelAdmin('/api/envoyer-liste', { ids: aEnvoyer.map((v) => v.id), titre })
    setEnvoi(
      r.erreur
        ? { enCours: false, message: `Envoi impossible : ${r.erreur}`, ok: false }
        : { enCours: false, message: `${aEnvoyer.length} visite(s) envoyée(s) à order@adalacola.com ✓`, ok: true }
    )
    if (!r.erreur) setCochees(new Set())
  }

  const champ = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Visites commerciales</h1>
        <Link to="/admin/commerces" className="text-sm font-semibold text-orange-700 hover:underline">
          Tous les commerces →
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
              onglet === o.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {onglet === 'liste' && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
            <label className="text-sm text-slate-600">
              Du
              <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className={`ml-2 ${champ}`} />
            </label>
            <label className="text-sm text-slate-600">
              au
              <input type="date" value={au} onChange={(e) => setAu(e.target.value)} className={`ml-2 ${champ}`} />
            </label>
            <select value={type} onChange={(e) => setType(e.target.value as TypeCommerce | '')} className={champ}>
              <option value="">Tous les types</option>
              {TYPES_COMMERCE.map((t) => (
                <option key={t.valeur} value={t.valeur}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={resultat}
              onChange={(e) => setResultat(e.target.value as ResultatVisite | '')}
              className={champ}
            >
              <option value="">Tous les résultats</option>
              {RESULTATS.map((r) => (
                <option key={r.valeur} value={r.valeur}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              value={filtreAlerte}
              onChange={(e) => setFiltreAlerte(e.target.value as 'toutes' | 'avec' | 'sans')}
              className={champ}
            >
              <option value="toutes">Avec ou sans alerte</option>
              <option value="avec">Avec alerte</option>
              <option value="sans">Sans alerte</option>
            </select>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => exporterVisites(aEnvoyer, `visites_${du}_${au}.csv`)}
                disabled={aEnvoyer.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40"
              >
                Export Excel (CSV)
              </button>
              <button
                onClick={envoyerAOrder}
                disabled={aEnvoyer.length === 0 || envoi.enCours}
                className="rounded-lg bg-[#b83a2c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {envoi.enCours
                  ? 'Envoi…'
                  : selection.length > 0
                    ? `✉ Envoyer la sélection (${selection.length}) à order@`
                    : `✉ Envoyer la liste (${filtrees.length}) à order@`}
              </button>
            </div>
          </div>

          <p className="-mt-2 text-xs text-slate-500">
            Coche des visites pour n'envoyer qu'elles ; sinon, toute la liste affichée (avec ses filtres) est envoyée.
          </p>

          {envoi.message && (
            <p
              role="status"
              className={`rounded-lg px-4 py-3 text-sm ${envoi.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-700'}`}
            >
              {envoi.message}
            </p>
          )}

          <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-8 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Tout cocher"
                      checked={toutCoche}
                      onChange={() => setCochees(toutCoche ? new Set() : new Set(filtrees.map((v) => v.id)))}
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Heure</th>
                  <th className="px-3 py-3">Durée</th>
                  <th className="px-3 py-3">Commerce</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Résultat</th>
                  <th className="px-3 py-3">Alertes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {chargement ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                      Chargement…
                    </td>
                  </tr>
                ) : filtrees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                      Aucune visite sur cette période.
                    </td>
                  </tr>
                ) : (
                  filtrees.map((v) => (
                    <tr key={v.id} className={cochees.has(v.id) ? 'bg-orange-50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Choisir ${v.commerce?.nom ?? 'la visite'}`}
                          checked={cochees.has(v.id)}
                          onChange={() => basculer(v.id)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{dateCourte(v.heure_serveur)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {heure(v.heure_serveur)}
                        {v.synchro_differee && (
                          <span className="ml-1 rounded bg-slate-200 px-1 text-xs text-slate-600" title="Synchronisée en différé">
                            différé
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-500">{duree(v)}</td>
                      <td className="px-3 py-3">
                        <Link to={`/admin/visites/${v.id}`} className="font-medium text-slate-900 hover:underline">
                          {v.commerce?.nom}
                        </Link>
                        {v.commerce?.commune && <span className="text-slate-400"> · {v.commerce.commune}</span>}
                        {v.a_completer && (
                          <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-800">à compléter</span>
                        )}
                        {v.modifiee_le && (
                          <span className="ml-2 rounded bg-slate-200 px-1 text-xs text-slate-600">modifiée</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {LABEL_TYPE[v.type_commerce ?? v.commerce?.type ?? 'autre']}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${BADGE_RESULTAT[v.resultat]}`}>
                          {LABEL_RESULTAT[v.resultat]}
                        </span>
                        {!!v.plateaux && <span className="ml-2 text-xs text-slate-500">{v.plateaux} plat.</span>}
                        {!!v.palettes && <span className="ml-1 text-xs text-slate-500">{v.palettes} pal.</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {v.alertes.map((a) => (
                            <span
                              key={a.code}
                              title={a.detail}
                              className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900"
                            >
                              ⚠ {LABEL_ALERTE[a.code] ?? a.code}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!chargement && (
            <p className="text-sm text-slate-500">
              {filtrees.length} visite{filtrees.length > 1 ? 's' : ''}
            </p>
          )}
        </>
      )}

      {onglet === 'carte' && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
            <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} className={champ} />
            {visitesJour.length > 0 ? (
              <p className="text-sm text-slate-700">
                <strong>{visitesJour.length}</strong> visite{visitesJour.length > 1 ? 's' : ''} — première à{' '}
                <strong>{heure(visitesJour[0].heure_ouverture ?? visitesJour[0].heure_appareil)}</strong>, dernière
                terminée à <strong>{heure(visitesJour[visitesJour.length - 1].heure_appareil)}</strong>
              </p>
            ) : (
              <p className="text-sm text-slate-400">Aucune visite ce jour-là.</p>
            )}
          </div>
          <VisitesMap visites={visitesJour} photos={photosJour} />
        </>
      )}

      {onglet === 'stats' && <StatsVisites />}
      {onglet === 'equipe' && <EquipeCommerciale />}
    </div>
  )
}
