import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  listerVisitesEnAttente,
  rafraichirCommerces,
  synchroniserVisites,
  type VisiteEnAttente,
} from '../../lib/visitesQueue'
import { BADGE_RESULTAT, LABEL_RESULTAT, dateLocale, debutJour, debutSemaine } from '../../lib/visites'
import type { ResultatVisite } from '../../types/database'
import AdalaHeader from '../../components/visites/AdalaHeader'

interface LigneVisite {
  id: string
  commerce_id: string
  resultat: ResultatVisite
  plateaux: number | null
  palettes: number | null
  date_relance: string | null
  a_completer: boolean
  heure_appareil: string
  commerce: { nom: string; commune: string | null } | null
}

interface Affichage {
  cle: string
  nom: string
  commune: string | null
  resultat: ResultatVisite
  plateaux: number | null
  palettes: number | null
  enAttente?: boolean
  refus?: string | null
}

export default function VisitesAccueilPage() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [visites, setVisites] = useState<LigneVisite[]>([])
  const [enAttente, setEnAttente] = useState<VisiteEnAttente[]>([])
  const [enLigne, setEnLigne] = useState(navigator.onLine)
  const [chargement, setChargement] = useState(true)
  const [message, setMessage] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null
  )
  const syncEnCours = useRef(false)

  useEffect(() => {
    if (message) {
      // Le message ne doit pas réapparaître si on recharge la page.
      navigate(location.pathname, { replace: true, state: null })
      const t = setTimeout(() => setMessage(null), 6000)
      return () => clearTimeout(t)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const charger = useCallback(async () => {
    if (!profile) return
    setEnAttente(await listerVisitesEnAttente(profile.id))
    if (navigator.onLine) {
      const depuis = new Date()
      depuis.setDate(depuis.getDate() - 60)
      const { data } = await supabase
        .from('visites')
        .select(
          'id, commerce_id, resultat, plateaux, palettes, date_relance, a_completer, heure_appareil, commerce:commerces(nom, commune)'
        )
        .eq('commercial_id', profile.id)
        .gte('heure_appareil', depuis.toISOString())
        .order('heure_appareil', { ascending: false })
        .limit(1000)
      if (data) setVisites(data as unknown as LigneVisite[])
    }
    setChargement(false)
  }, [profile])

  const synchro = useCallback(async () => {
    if (!profile || syncEnCours.current || !navigator.onLine) return
    syncEnCours.current = true
    try {
      await synchroniserVisites(profile.id)
    } finally {
      syncEnCours.current = false
      charger()
    }
  }, [profile, charger])

  useEffect(() => {
    charger().then(synchro)
    if (navigator.onLine) rafraichirCommerces()
  }, [charger, synchro])

  useEffect(() => {
    const on = () => {
      setEnLigne(true)
      synchro()
    }
    const off = () => setEnLigne(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [synchro])

  // Filet de sécurité : retente régulièrement tant qu'il reste des visites à envoyer.
  useEffect(() => {
    if (enAttente.length === 0) return
    const t = setInterval(synchro, 20000)
    return () => clearInterval(t)
  }, [enAttente.length, synchro])

  const aujourdhui = debutJour()
  const semaine = debutSemaine()
  const duJour: Affichage[] = [
    ...enAttente
      .filter((v) => new Date(v.heure_appareil) >= aujourdhui)
      .map((v) => ({
        cle: v.client_uuid,
        nom: v.commerce_nom,
        commune: v.nouveau_commerce?.commune ?? null,
        resultat: v.resultat,
        plateaux: v.plateaux,
        palettes: v.palettes,
        enAttente: true,
        refus: v.derniere_erreur,
      })),
    ...visites
      .filter((v) => new Date(v.heure_appareil) >= aujourdhui)
      .map((v) => ({
        cle: v.id,
        nom: v.commerce?.nom ?? '—',
        commune: v.commerce?.commune ?? null,
        resultat: v.resultat,
        plateaux: v.plateaux,
        palettes: v.palettes,
      })),
  ]
  const nbSemaine =
    visites.filter((v) => new Date(v.heure_appareil) >= semaine).length +
    enAttente.filter((v) => new Date(v.heure_appareil) >= semaine).length

  const aCompleter = visites.filter(
    (v) => v.a_completer && Date.now() - new Date(v.heure_appareil).getTime() < 36 * 3600000
  )

  // Relances : la dernière visite de chaque commerce demande une relance aujourd'hui ou avant.
  const derniereParCommerce = new Map<string, LigneVisite>()
  for (const v of visites) if (!derniereParCommerce.has(v.commerce_id)) derniereParCommerce.set(v.commerce_id, v)
  const relances = [...derniereParCommerce.values()]
    .filter((v) => v.date_relance && v.date_relance <= dateLocale(new Date()))
    .sort((a, b) => a.date_relance!.localeCompare(b.date_relance!))

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <AdalaHeader
        titre="Adala Visites"
        droite={
          <button
            onClick={signOut}
            className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200"
          >
            Déconnexion
          </button>
        }
      />

      <main className="mx-auto max-w-3xl space-y-4 px-3 py-4">
        <p className="text-slate-600">
          Bonjour <strong className="text-slate-900">{profile?.full_name}</strong>
          {!enLigne && <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">Hors connexion</span>}
        </p>

        {message && (
          <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
            {message}
          </p>
        )}

        <Link
          to="/visites/nouvelle"
          className="flex min-h-24 items-center justify-center gap-3 rounded-2xl bg-[#b83a2c] text-2xl font-bold text-white shadow-md active:opacity-90"
        >
          <span className="text-3xl">＋</span> Nouvelle visite
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <p className="text-4xl font-bold text-slate-900">{duJour.length}</p>
            <p className="text-sm text-slate-500">aujourd'hui</p>
          </div>
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <p className="text-4xl font-bold text-slate-900">{nbSemaine}</p>
            <p className="text-sm text-slate-500">cette semaine</p>
          </div>
        </div>

        {enAttente.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              ⏳ {enAttente.length} visite{enAttente.length > 1 ? 's' : ''} en attente d'envoi
            </span>
            {enLigne && (
              <button onClick={synchro} className="font-semibold underline">
                Envoyer
              </button>
            )}
          </div>
        )}

        {aCompleter.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">À compléter</h2>
            <ul className="space-y-2">
              {aCompleter.map((v) => (
                <li key={v.id}>
                  <Link
                    to={`/visites/${v.id}/completer`}
                    className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
                  >
                    <span className="font-medium text-slate-800">{v.commerce?.nom}</span>
                    <span className="text-sm font-semibold text-amber-800">Compléter →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {relances.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Relances à faire</h2>
            <ul className="divide-y divide-slate-100">
              {relances.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-slate-800">
                    {v.commerce?.nom}
                    {v.commerce?.commune && <span className="text-slate-400"> · {v.commerce.commune}</span>}
                  </span>
                  <span className="shrink-0 text-sm text-slate-500">
                    {new Date(v.date_relance! + 'T12:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Visites du jour</h2>
          {chargement ? (
            <p className="py-4 text-center text-slate-400">Chargement…</p>
          ) : duJour.length === 0 ? (
            <p className="py-4 text-center text-slate-400">Aucune visite pour l'instant.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {duJour.map((v) => (
                <li key={v.cle} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{v.nom}</p>
                    {v.commune && <p className="truncate text-sm text-slate-500">{v.commune}</p>}
                    {v.enAttente && (
                      <p className={`text-xs ${v.refus ? 'text-red-600' : 'text-amber-700'}`}>
                        {v.refus ? `Non envoyée : ${v.refus}` : "En attente d'envoi"}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${BADGE_RESULTAT[v.resultat]}`}>
                      {LABEL_RESULTAT[v.resultat]}
                    </span>
                    {(!!v.plateaux || !!v.palettes) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {v.plateaux ? `${v.plateaux} plat.` : ''} {v.palettes ? `${v.palettes} pal.` : ''}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
