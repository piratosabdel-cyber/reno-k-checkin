import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { distanceMetres, getCurrentPosition } from '../../lib/geo'
import { ajouterALaFile, listerFile } from '../../lib/offlineQueue'
import { synchroniser } from '../../lib/sync'
import ProposerChantierForm from '../../components/ProposerChantierForm'
import type { Chantier, Pointage, TypePointage } from '../../types/database'

const LABELS: Record<TypePointage, string> = {
  arrivee: 'Arrivée',
  pause_debut: 'Début de pause',
  pause_fin: 'Fin de pause',
  depart: 'Départ',
}

const COULEURS: Record<TypePointage, string> = {
  arrivee: 'bg-emerald-600 active:bg-emerald-700',
  pause_debut: 'bg-amber-600 active:bg-amber-700',
  pause_fin: 'bg-amber-600 active:bg-amber-700',
  depart: 'bg-red-600 active:bg-red-700',
}

type PointageAffichage = Pointage & { enAttente?: boolean }

/** Au-delà de cette distance du chantier le plus proche, on ne propose rien : l'ouvrier choisit dans la liste. */
const DISTANCE_DETECTION_M = 2000
/** Après "Non, je suis encore sur place", on ne repropose pas le départ avant ce délai. */
const DELAI_RAPPEL_SORTIE_MS = 10 * 60000

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function estAujourdhui(iso: string) {
  return new Date(iso) >= startOfToday()
}

export default function CheckInPage() {
  const { profile, signOut } = useAuth()
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [tousChantiers, setTousChantiers] = useState<Chantier[]>([])
  const [chantierId, setChantierId] = useState<string>('')
  const [pointagesDuJour, setPointagesDuJour] = useState<PointageAffichage[]>([])
  const [enAttenteCount, setEnAttenteCount] = useState(0)
  const [enLigne, setEnLigne] = useState(navigator.onLine)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'warning' | 'success'; text: string } | null>(
    null
  )
  const syncEnCours = useRef(false)
  const [appActive, setAppActive] = useState<boolean | null>(null)
  const [proposer, setProposer] = useState(false)
  const [mesPropositions, setMesPropositions] = useState<Chantier[]>([])

  // Détection automatique du chantier le plus proche (GPS) — l'ouvrier doit confirmer.
  const [detection, setDetection] = useState<
    | { etat: 'recherche' }
    | { etat: 'trouve'; chantier: Chantier; distance: number }
    | { etat: 'aucun' }
    | { etat: 'erreur' }
  >({ etat: 'recherche' })
  const [chantierConfirme, setChantierConfirme] = useState(false)
  const [choixManuel, setChoixManuel] = useState(false)

  // Sortie de zone détectée pendant qu'une arrivée est en cours.
  const [sortieZone, setSortieZone] = useState<{
    distance: number
    lat: number
    lng: number
    precision: number
  } | null>(null)
  const rappelSortieApres = useRef(0)

  const loadData = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const [{ data: assigned }, { data: allActive }, { data: today }, fileLocale, { data: propositions }] =
      await Promise.all([
        supabase
          .from('chantier_assignments')
          .select('chantier:chantiers(*)')
          .eq('ouvrier_id', profile.id),
        supabase.from('chantiers').select('*').eq('statut', 'actif').order('nom'),
        supabase
          .from('pointages')
          .select('*')
          .eq('ouvrier_id', profile.id)
          .gte('heure_appareil', startOfToday().toISOString())
          .order('heure_appareil'),
        listerFile(profile.id),
        supabase
          .from('chantiers')
          .select('*')
          .eq('propose_par', profile.id)
          .eq('statut', 'en_attente')
          .order('created_at'),
      ])

    setMesPropositions((propositions as Chantier[]) ?? [])

    const assignedActive =
      (assigned
        ?.map((a) => a.chantier as unknown as Chantier)
        .filter((c) => c && c.statut === 'actif') as Chantier[]) ?? []

    const list = assignedActive.length > 0 ? assignedActive : (allActive ?? [])
    setChantiers(list)
    setTousChantiers((allActive as Chantier[]) ?? [])

    const serveur: PointageAffichage[] = ((today as Pointage[]) ?? []).map((p) => ({
      ...p,
      enAttente: false,
    }))

    const locaux: PointageAffichage[] = fileLocale
      .filter((p) => estAujourdhui(p.heure_appareil))
      .map((p) => ({
        id: p.client_uuid,
        client_uuid: p.client_uuid,
        ouvrier_id: p.ouvrier_id,
        chantier_id: p.chantier_id,
        type: p.type,
        heure_appareil: p.heure_appareil,
        heure_serveur: p.heure_appareil,
        latitude: p.latitude,
        longitude: p.longitude,
        precision_gps_m: p.precision_gps_m,
        distance_chantier_m: p.distance_chantier_m,
        hors_zone: p.hors_zone,
        justification: p.justification,
        statut: p.statut,
        modele_telephone: p.modele_telephone,
        cree_hors_ligne: true,
        created_at: p.heure_appareil,
        enAttente: true,
      }))

    const parUuid = new Map<string, PointageAffichage>()
    for (const p of [...serveur, ...locaux]) parUuid.set(p.client_uuid, p)
    const fusion = [...parUuid.values()].sort(
      (a, b) => new Date(a.heure_appareil).getTime() - new Date(b.heure_appareil).getTime()
    )

    setPointagesDuJour(fusion)
    setEnAttenteCount(fileLocale.length)
    if (list.length > 0 && !chantierId) setChantierId(list[0].id)

    setLoading(false)
  }, [profile, chantierId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const dernier = pointagesDuJour.length > 0 ? pointagesDuJour[pointagesDuJour.length - 1] : null
  // Une arrivée (ou une pause) non suivie d'un départ = journée en cours sur ce chantier.
  const enCours = dernier && dernier.type !== 'depart' ? dernier : null
  const chantierEnCours = enCours
    ? (tousChantiers.find((c) => c.id === enCours.chantier_id) ??
      chantiers.find((c) => c.id === enCours.chantier_id) ??
      null)
    : null

  // Journée en cours : le départ se fait forcément sur le chantier de l'arrivée.
  const enCoursUuid = enCours?.client_uuid
  useEffect(() => {
    if (enCours) {
      setChantierId(enCours.chantier_id)
      setChantierConfirme(true)
    }
  }, [enCoursUuid]) // eslint-disable-line react-hooks/exhaustive-deps

  const detecterChantier = useCallback(async () => {
    const candidats = chantiers.filter((c) => c.latitude != null && c.longitude != null)
    if (candidats.length === 0) {
      setDetection({ etat: 'aucun' })
      return
    }
    setDetection({ etat: 'recherche' })
    try {
      const pos = await getCurrentPosition()
      let meilleur: { chantier: Chantier; distance: number } | null = null
      for (const c of candidats) {
        const distance = Math.round(distanceMetres(pos.lat, pos.lng, c.latitude!, c.longitude!))
        if (!meilleur || distance < meilleur.distance) meilleur = { chantier: c, distance }
      }
      if (meilleur && meilleur.distance <= DISTANCE_DETECTION_M) {
        setDetection({ etat: 'trouve', ...meilleur })
        setChantierId(meilleur.chantier.id)
      } else {
        setDetection({ etat: 'aucun' })
      }
    } catch {
      setDetection({ etat: 'erreur' })
    }
  }, [chantiers])

  // Lance la détection une fois la liste des chantiers connue (sauf si une journée est en cours).
  const nbChantiers = chantiers.length
  useEffect(() => {
    if (!loading && nbChantiers > 0 && !chantierConfirme && !enCours) detecterChantier()
  }, [loading, nbChantiers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Surveillance de la zone tant qu'une arrivée est en cours et que l'appli est à l'écran :
  // dès que l'ouvrier en sort (ou s'il rouvre l'appli ailleurs), on lui propose le départ.
  const chantierEnCoursId = chantierEnCours?.id
  useEffect(() => {
    if (!enCours || !chantierEnCours || chantierEnCours.latitude == null || chantierEnCours.longitude == null) {
      setSortieZone(null)
      return
    }
    if (!navigator.geolocation) return
    const c = chantierEnCours
    let watchId: number | null = null

    const verifier = (coords: GeolocationCoordinates) => {
      const distance = Math.round(distanceMetres(coords.latitude, coords.longitude, c.latitude!, c.longitude!))
      if (distance > c.rayon_metres) {
        if (Date.now() < rappelSortieApres.current) return
        setSortieZone({ distance, lat: coords.latitude, lng: coords.longitude, precision: coords.accuracy })
      } else {
        setSortieZone(null)
      }
    }
    const demarrer = () => {
      if (watchId != null) return
      watchId = navigator.geolocation.watchPosition((p) => verifier(p.coords), () => undefined, {
        enableHighAccuracy: true,
        maximumAge: 30000,
      })
    }
    const arreter = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
    const onVisibilite = () => (document.visibilityState === 'visible' ? demarrer() : arreter())

    demarrer()
    document.addEventListener('visibilitychange', onVisibilite)
    return () => {
      arreter()
      document.removeEventListener('visibilitychange', onVisibilite)
    }
  }, [enCoursUuid, chantierEnCoursId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Si hors ligne, on ne bloque pas (on ne peut pas vérifier) — l'app
    // reste utilisable, elle se resynchronisera au retour du réseau.
    if (!navigator.onLine) return
    supabase
      .from('parametres_app')
      .select('app_active')
      .eq('id', 1)
      .single()
      .then(({ data }) => setAppActive(data?.app_active ?? true))
  }, [])

  const tenterSynchro = useCallback(async () => {
    if (!profile || syncEnCours.current || !navigator.onLine) return
    syncEnCours.current = true
    try {
      await synchroniser(profile.id)
    } finally {
      syncEnCours.current = false
      loadData()
    }
  }, [profile, loadData])

  // Détecte le retour de connexion et resynchronise automatiquement.
  useEffect(() => {
    function onOnline() {
      setEnLigne(true)
      tenterSynchro()
    }
    function onOffline() {
      setEnLigne(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [tenterSynchro])

  // Filet de sécurité : retente toutes les 20s tant qu'il reste des pointages en attente
  // (au cas où l'appareil est "en ligne" sur le papier mais sans accès réel au serveur).
  useEffect(() => {
    if (enAttenteCount === 0) return
    const t = setInterval(tenterSynchro, 20000)
    return () => clearInterval(t)
  }, [enAttenteCount, tenterSynchro])

  const typeSuivant: TypePointage = enCours ? 'depart' : 'arrivee'

  async function enregistrerPointage(
    type: TypePointage,
    lat: number | null,
    lng: number | null,
    precision: number | null,
    distance: number | null,
    hors_zone: boolean
  ) {
    if (!profile || !chantierId) return

    const pointage = {
      client_uuid: crypto.randomUUID(),
      ouvrier_id: profile.id,
      chantier_id: chantierId,
      type,
      heure_appareil: new Date().toISOString(),
      latitude: lat,
      longitude: lng,
      precision_gps_m: precision,
      distance_chantier_m: distance,
      hors_zone,
      justification: null,
      statut: (hors_zone ? 'hors_zone' : 'accepte') as 'hors_zone' | 'accepte',
      modele_telephone: navigator.userAgent,
    }

    // Hors-ligne connu : on ne tente même pas le réseau, on enregistre directement en local.
    if (!navigator.onLine) {
      await ajouterALaFile(pointage)
      setMessage({ type: 'warning', text: `${LABELS[type]} enregistré hors ligne — sera synchronisé.` })
      setSortieZone(null)
      loadData()
      return
    }

    try {
      const { error } = await supabase.from('pointages').insert({ ...pointage, cree_hors_ligne: false })

      if (error) {
        // Une vraie erreur serveur (ex: refusée par une règle) a un code Postgrest.
        // Une coupure réseau n'en a généralement pas -> on bascule en file locale.
        if (error.code) {
          setMessage({ type: 'error', text: 'Erreur lors du pointage. Réessaie.' })
          return
        }
        throw error
      }

      setMessage({
        type: hors_zone || lat == null ? 'warning' : 'success',
        text: hors_zone
          ? `${LABELS[type]} enregistré — hors zone du chantier.`
          : lat == null
            ? `${LABELS[type]} enregistré sans position GPS.`
            : `${LABELS[type]} enregistré.`,
      })
    } catch {
      await ajouterALaFile(pointage)
      setMessage({ type: 'warning', text: `${LABELS[type]} enregistré hors ligne — sera synchronisé.` })
    }

    setSortieZone(null)
    loadData()
  }

  async function handlePointer(type: TypePointage) {
    if (!chantierId) return
    setWorking(true)
    setMessage(null)

    const chantier = chantiers.find((c) => c.id === chantierId) ?? tousChantiers.find((c) => c.id === chantierId)

    let lat: number | null = null
    let lng: number | null = null
    let precision: number | null = null
    let distance: number | null = null
    let hors_zone = false
    let gpsOk = true

    try {
      const pos = await getCurrentPosition()
      lat = pos.lat
      lng = pos.lng
      precision = pos.accuracy
      if (chantier?.latitude != null && chantier?.longitude != null) {
        distance = Math.round(distanceMetres(lat, lng, chantier.latitude, chantier.longitude))
        hors_zone = distance > chantier.rayon_metres
      }
    } catch {
      gpsOk = false
    }

    // Arrivée : uniquement dans la zone du chantier. Sans GPS, on accepte mais
    // le pointage est marqué "sans position" pour l'admin.
    if (type === 'arrivee' && gpsOk && hors_zone && chantier) {
      setWorking(false)
      setMessage({
        type: 'error',
        text: `Arrivée refusée : tu es à ${distance} m de ${chantier.nom} (zone autorisée : ${chantier.rayon_metres} m). Rapproche-toi du chantier et réessaie.`,
      })
      return
    }

    await enregistrerPointage(type, lat, lng, precision, distance, hors_zone)
    setWorking(false)
  }

  async function departDepuisSortie() {
    if (!sortieZone) return
    setWorking(true)
    setMessage(null)
    await enregistrerPointage('depart', sortieZone.lat, sortieZone.lng, sortieZone.precision, sortieZone.distance, true)
    setWorking(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Chargement...
      </div>
    )
  }

  if (profile && !profile.active) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center text-white">
        <p className="text-5xl">🔒</p>
        <h1 className="text-xl font-bold">Accès bloqué</h1>
        <p className="max-w-xs text-slate-400">
          Ton compte a été désactivé. Contacte ton responsable pour plus d'informations.
        </p>
        <button
          onClick={signOut}
          className="mt-4 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
        >
          Déconnexion
        </button>
      </div>
    )
  }

  if (appActive === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center text-white">
        <p className="text-5xl">🔒</p>
        <h1 className="text-xl font-bold">Application désactivée</h1>
        <p className="max-w-xs text-slate-400">
          Le pointage est temporairement indisponible. Contacte ton responsable pour plus d'informations.
        </p>
        <button
          onClick={signOut}
          className="mt-4 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
        >
          Déconnexion
        </button>
      </div>
    )
  }

  const chantierSelectionne =
    chantiers.find((c) => c.id === chantierId) ?? tousChantiers.find((c) => c.id === chantierId)

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
        <div>
          <p className="text-sm text-slate-400">Reno-K</p>
          <p className="font-semibold">{profile?.full_name}</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 active:bg-slate-800"
        >
          Déconnexion
        </button>
      </header>

      {(!enLigne || enAttenteCount > 0) && (
        <div
          className={`px-5 py-2 text-center text-sm font-medium ${
            !enLigne ? 'bg-slate-700 text-white' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {!enLigne
            ? '📴 Hors ligne — tes pointages sont enregistrés sur le téléphone'
            : `⏳ ${enAttenteCount} pointage(s) en attente de synchronisation...`}
        </div>
      )}

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-8">
        {proposer && profile ? (
          <ProposerChantierForm
            ouvrierId={profile.id}
            onAnnuler={() => setProposer(false)}
            onEnvoye={() => {
              setProposer(false)
              setMessage({
                type: 'success',
                text: "Chantier proposé — en attente d'approbation par l'administrateur.",
              })
              loadData()
            }}
          />
        ) : sortieZone && chantierEnCours ? (
          <div className="w-full max-w-md rounded-2xl border-2 border-red-300 bg-white p-6 shadow-sm">
            <p className="mb-1 text-sm font-medium uppercase tracking-wide text-red-600">Sortie de zone</p>
            <h2 className="mb-2 text-xl font-bold text-slate-900">Tu as quitté {chantierEnCours.nom}</h2>
            <p className="mb-4 text-sm text-slate-500">
              Tu es à <strong>{sortieZone.distance} m</strong> du chantier (zone : {chantierEnCours.rayon_metres} m).
              Pointer le départ maintenant ?
            </p>
            <button
              onClick={departDepuisSortie}
              disabled={working}
              className={`w-full rounded-2xl py-6 text-2xl font-bold text-white shadow disabled:opacity-50 ${COULEURS.depart}`}
            >
              {working ? '...' : 'DÉPART MAINTENANT'}
            </button>
            <button
              onClick={() => {
                rappelSortieApres.current = Date.now() + DELAI_RAPPEL_SORTIE_MS
                setSortieZone(null)
              }}
              className="mt-3 w-full rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-600"
            >
              Non, je suis encore sur le chantier
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
            <p className="mb-2 text-lg font-semibold text-slate-800">Chantier</p>

            {enCours && chantierEnCours ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
                <p className="truncate text-lg font-bold text-emerald-900">📍 {chantierEnCours.nom}</p>
                <p className="truncate text-xs text-emerald-700">
                  Arrivée pointée à{' '}
                  {new Date(enCours.heure_appareil).toLocaleTimeString('fr-BE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            ) : chantierConfirme ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-emerald-900">📍 {chantierSelectionne?.nom}</p>
                  <p className="truncate text-xs text-emerald-700">{chantierSelectionne?.adresse}</p>
                </div>
                <button
                  onClick={() => {
                    setChantierConfirme(false)
                    setChoixManuel(true)
                  }}
                  className="shrink-0 text-sm text-emerald-700 underline"
                >
                  Changer
                </button>
              </div>
            ) : choixManuel ||
              detection.etat === 'aucun' ||
              detection.etat === 'erreur' ||
              chantiers.length === 0 ? (
              <>
                {!choixManuel && detection.etat === 'erreur' && chantiers.length > 0 && (
                  <p className="mb-2 text-sm text-amber-700">Position GPS non disponible — choisis ton chantier.</p>
                )}
                {!choixManuel && detection.etat === 'aucun' && chantiers.length > 0 && (
                  <p className="mb-2 text-sm text-amber-700">
                    Aucun chantier détecté à moins de {DISTANCE_DETECTION_M / 1000} km — choisis-le dans la liste.
                  </p>
                )}
                <select
                  id="chantier"
                  value={chantierId}
                  onChange={(e) => setChantierId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                >
                  {chantiers.length === 0 && <option value="">Aucun chantier actif</option>}
                  {chantiers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={() => {
                      setChoixManuel(false)
                      detecterChantier()
                    }}
                    className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-600"
                  >
                    🔄 Détecter
                  </button>
                  <button
                    onClick={() => setChantierConfirme(true)}
                    disabled={!chantierId}
                    className="flex-1 rounded-xl bg-slate-800 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    ✓ Confirmer
                  </button>
                </div>
              </>
            ) : detection.etat === 'recherche' ? (
              <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-slate-500">
                📡 Recherche de ta position...
                <button onClick={() => setChoixManuel(true)} className="mt-3 block w-full text-sm underline">
                  Choisir dans la liste
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-orange-300 bg-orange-50 p-4">
                <p className="text-sm text-orange-700">
                  Tu es à <strong>{detection.distance} m</strong> de :
                </p>
                <p className="mt-1 text-xl font-bold text-slate-900">{detection.chantier.nom}</p>
                <p className="text-sm text-slate-600">{detection.chantier.adresse}</p>
                <p className="mt-3 text-base font-semibold text-slate-800">C'est bien ici ?</p>
                <div className="mt-3 grid gap-2">
                  <button
                    onClick={() => {
                      setChantierId(detection.chantier.id)
                      setChantierConfirme(true)
                    }}
                    className="w-full rounded-xl bg-orange-600 py-4 text-lg font-bold text-white active:bg-orange-700"
                  >
                    ✓ Oui, je suis ici
                  </button>
                  <button
                    onClick={() => setChoixManuel(true)}
                    className="w-full rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-600"
                  >
                    Non, choisir un autre chantier
                  </button>
                </div>
              </div>
            )}

            {chantierConfirme && (
              <div className="mt-6 grid gap-3">
                <button
                  onClick={() => handlePointer(typeSuivant)}
                  disabled={working || !chantierId}
                  className={`w-full rounded-2xl py-6 text-2xl font-bold text-white shadow disabled:opacity-50 ${COULEURS[typeSuivant]}`}
                >
                  {working ? '...' : LABELS[typeSuivant].toUpperCase()}
                </button>
                {typeSuivant === 'arrivee' && (
                  <p className="text-center text-xs text-slate-400">
                    L'arrivée n'est acceptée que dans la zone du chantier.
                  </p>
                )}
              </div>
            )}

            {!enCours && (
              <button
                onClick={() => {
                  setMessage(null)
                  setProposer(true)
                }}
                className="mt-4 w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 active:bg-slate-50"
              >
                ➕ Le chantier n'est pas dans la liste ? Proposer un nouveau chantier
              </button>
            )}
          </div>
        )}

        {!proposer && mesPropositions.length > 0 && (
          <div className="w-full max-w-md rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            <p className="mb-1 font-semibold">⏳ En attente d'approbation</p>
            <ul className="list-inside list-disc">
              {mesPropositions.map((c) => (
                <li key={c.id}>
                  {c.nom} — {c.adresse}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pointagesDuJour.length > 0 && (
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-slate-700">Aujourd'hui</p>
            <ul className="space-y-1 text-sm text-slate-600">
              {pointagesDuJour.map((p) => (
                <li key={p.client_uuid} className="flex justify-between">
                  <span>
                    {LABELS[p.type]}
                    {p.hors_zone && <span className="ml-2 text-amber-600">(hors zone)</span>}
                    {p.latitude == null && <span className="ml-2 text-slate-400">(sans position)</span>}
                    {p.enAttente && <span className="ml-2 text-slate-400">(en attente)</span>}
                  </span>
                  <span>
                    {new Date(p.heure_appareil).toLocaleTimeString('fr-BE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {message && (
          <p
            role="alert"
            className={`w-full max-w-md rounded-xl px-4 py-3 text-center text-sm ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700'
                : message.type === 'warning'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {message.text}
          </p>
        )}
      </main>
    </div>
  )
}
