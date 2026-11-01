import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { appelServeur } from '../../lib/visitesQueue'
import { BADGE_RESULTAT, LABEL_RESULTAT, LABEL_TYPE, TYPES_COMMERCE, debutJour, debutSemaine } from '../../lib/visites'
import type { ResultatVisite, TypeCommerce } from '../../types/database'
import AdalaHeader from '../../components/visites/AdalaHeader'
import { Puce, Section } from '../../components/visites/ChampsVisite'

interface Ligne {
  id: string
  resultat: ResultatVisite
  plateaux: number | null
  palettes: number | null
  heure_appareil: string
  type_commerce: TypeCommerce | null
  commerce: { nom: string; commune: string | null; type: TypeCommerce } | null
}

type Periode = 'jour' | 'semaine' | 'mois'

const PERIODES: { id: Periode; label: string }[] = [
  { id: 'jour', label: "Aujourd'hui" },
  { id: 'semaine', label: 'Cette semaine' },
  { id: 'mois', label: '30 derniers jours' },
]

function debutPeriode(p: Periode) {
  if (p === 'jour') return debutJour()
  if (p === 'semaine') return debutSemaine()
  const d = debutJour()
  d.setDate(d.getDate() - 30)
  return d
}

/** La commerciale envoie à order@adalacola.com les visites qu'elle choisit (cochées, ou par type). */
export default function EnvoyerListePage() {
  const { profile } = useAuth()
  const [periode, setPeriode] = useState<Periode>('jour')
  const [type, setType] = useState<TypeCommerce | null>(null)
  const [visites, setVisites] = useState<Ligne[]>([])
  const [chargement, setChargement] = useState(true)
  const [cochees, setCochees] = useState<Set<string>>(new Set())
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (!profile) return
    setChargement(true)
    supabase
      .from('visites')
      .select('id, resultat, plateaux, palettes, heure_appareil, type_commerce, commerce:commerces(nom, commune, type)')
      .eq('commercial_id', profile.id)
      .gte('heure_appareil', debutPeriode(periode).toISOString())
      .order('heure_appareil', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setVisites((data as unknown as Ligne[]) ?? [])
        setChargement(false)
      })
  }, [profile, periode])

  const typeDe = (v: Ligne) => v.type_commerce ?? v.commerce?.type ?? 'autre'
  const filtrees = useMemo(() => visites.filter((v) => !type || typeDe(v) === type), [visites, type])
  const typesPresents = TYPES_COMMERCE.filter((t) => visites.some((v) => typeDe(v) === t.valeur))
  // On n'envoie que des visites visibles : une case cochée puis filtrée ne compte plus.
  const selection = filtrees.filter((v) => cochees.has(v.id))
  const aEnvoyer = selection.length > 0 ? selection : filtrees

  function basculer(id: string) {
    setCochees((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function envoyer() {
    const titre = [
      `Visites de ${profile?.full_name ?? 'la commerciale'}`,
      type && LABEL_TYPE[type],
      PERIODES.find((p) => p.id === periode)!.label.toLowerCase(),
    ]
      .filter(Boolean)
      .join(' — ')
    if (!window.confirm(`Envoyer ${aEnvoyer.length} visite(s) à order@adalacola.com ?`)) return
    setEnvoi(true)
    setMessage(null)
    const r = await appelServeur('/api/envoyer-liste', { ids: aEnvoyer.map((v) => v.id), titre })
    setEnvoi(false)
    if (r.erreur) {
      setMessage({ texte: `Envoi impossible : ${r.erreur}`, ok: false })
      return
    }
    setMessage({ texte: `${aEnvoyer.length} visite(s) envoyée(s) à order@adalacola.com ✓`, ok: true })
    setCochees(new Set())
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-40">
      <AdalaHeader
        titre="Envoyer à order@"
        droite={
          <Link to="/visites" className="rounded-lg px-3 py-2 text-sm text-slate-300">
            Retour
          </Link>
        }
      />
      <main className="mx-auto max-w-3xl space-y-3 px-3 py-3">
        <Section titre="Période">
          <div className="flex flex-wrap gap-2">
            {PERIODES.map((p) => (
              <Puce key={p.id} actif={periode === p.id} onClick={() => setPeriode(p.id)}>
                {p.label}
              </Puce>
            ))}
          </div>
        </Section>

        {typesPresents.length > 1 && (
          <Section titre="Type de commerce">
            <div className="flex flex-wrap gap-2">
              <Puce actif={type === null} onClick={() => setType(null)}>
                Tous
              </Puce>
              {typesPresents.map((t) => (
                <Puce key={t.valeur} actif={type === t.valeur} onClick={() => setType(t.valeur)}>
                  {t.emoji} {t.label}
                </Puce>
              ))}
            </div>
          </Section>
        )}

        <Section titre="Visites">
          {chargement ? (
            <p className="py-4 text-center text-slate-400">Chargement…</p>
          ) : filtrees.length === 0 ? (
            <p className="py-4 text-center text-slate-400">Aucune visite sur cette période.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-500">
                Coche des visites pour n'envoyer qu'elles ; sinon, toute la liste est envoyée.
              </p>
              <ul className="divide-y divide-slate-100">
                {filtrees.map((v) => (
                  <li key={v.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-3">
                      <input
                        type="checkbox"
                        checked={cochees.has(v.id)}
                        onChange={() => basculer(v.id)}
                        className="h-6 w-6 shrink-0 accent-[#b83a2c]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{v.commerce?.nom}</span>
                        <span className="block truncate text-sm text-slate-500">
                          {new Date(v.heure_appareil).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {' · '}
                          {LABEL_TYPE[typeDe(v)]}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${BADGE_RESULTAT[v.resultat]}`}>
                          {LABEL_RESULTAT[v.resultat]}
                        </span>
                        {(!!v.plateaux || !!v.palettes) && (
                          <span className="mt-1 block text-xs text-slate-500">
                            {v.plateaux ? `${v.plateaux} plat.` : ''} {v.palettes ? `${v.palettes} pal.` : ''}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-[600] border-t border-slate-200 bg-white/95 px-3 py-3">
        <div className="mx-auto max-w-3xl space-y-2">
          {message && (
            <p
              role="status"
              className={`rounded-lg px-3 py-2 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-700'}`}
            >
              {message.texte}
            </p>
          )}
          <button
            onClick={envoyer}
            disabled={envoi || aEnvoyer.length === 0}
            className="min-h-14 w-full rounded-xl bg-[#b83a2c] text-lg font-bold text-white disabled:opacity-50"
          >
            {envoi
              ? 'Envoi…'
              : selection.length > 0
                ? `✉ Envoyer la sélection (${selection.length})`
                : `✉ Envoyer toute la liste (${filtrees.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
