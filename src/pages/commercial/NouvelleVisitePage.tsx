import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { distanceMetres, getCurrentPosition, GeoErreur, messageGeoErreur, type GeoPosition } from '../../lib/geo'
import { adresseDepuisGps } from '../../lib/geocode'
import {
  commercesEnCache,
  identifiantAppareil,
  mettreEnFile,
  rafraichirCommerces,
  synchroniserVisites,
  type NouveauCommerce,
} from '../../lib/visitesQueue'
import { DISTANCE_RECONNAISSANCE_M, TYPES_COMMERCE } from '../../lib/visites'
import { useLangue } from '../../lib/langue'
import type { Commerce, TypeCommerce } from '../../types/database'
import AdalaHeader from '../../components/visites/AdalaHeader'
import CameraCapture from '../../components/visites/CameraCapture'
import BonCommande, { CadreBon, type BonSigne } from '../../components/visites/BonCommande'
import ChampsVisite, { DETAILS_VIDES, INFOS_CLIENT_VIDES, adresseComplete, Puce, Section, type DetailsVisite } from '../../components/visites/ChampsVisite'

function normaliser(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function distanceDe(pos: GeoPosition | null, c: Commerce): number | null {
  if (!pos || c.latitude == null || c.longitude == null) return null
  return distanceMetres(pos.lat, pos.lng, c.latitude, c.longitude)
}

function formatDistance(m: number | null) {
  if (m == null) return ''
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export default function NouvelleVisitePage() {
  const { profile } = useAuth()
  const { t, langue, labelType } = useLangue()
  const navigate = useNavigate()

  // Figés à l'ouverture du formulaire.
  const [clientUuid] = useState(() => crypto.randomUUID())
  const [heureOuverture] = useState(() => new Date().toISOString())

  const [posOuverture, setPosOuverture] = useState<GeoPosition | null>(null)
  const [geoEtat, setGeoEtat] = useState<'recherche' | 'ok' | 'erreur'>('recherche')
  const [geoMessage, setGeoMessage] = useState<string | null>(null)
  const [geoRefus, setGeoRefus] = useState(false)
  const [adresseGps, setAdresseGps] = useState<{ adresse: string; commune: string | null } | null>(null)

  const [commerces, setCommerces] = useState<Commerce[]>(() => commercesEnCache())
  const [commerce, setCommerce] = useState<Commerce | null>(null)
  const [nouveau, setNouveau] = useState<NouveauCommerce | null>(null)
  const [recherche, setRecherche] = useState('')
  const [suggestionRefusee, setSuggestionRefusee] = useState(false)

  const [photo, setPhoto] = useState<{ blob: Blob; url: string; priseA: string } | null>(null)
  const [cameraOuverte, setCameraOuverte] = useState(false)

  const [details, setDetails] = useState<DetailsVisite>(DETAILS_VIDES)
  const [bon, setBon] = useState<BonSigne | null>(null)
  const [bonOuvert, setBonOuvert] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function localiser() {
    setGeoEtat('recherche')
    setGeoMessage(null)
    getCurrentPosition()
      .then((p) => {
        setPosOuverture(p)
        setGeoEtat('ok')
        setGeoRefus(false)
        adresseDepuisGps(p.lat, p.lng).then(setAdresseGps)
      })
      .catch((e) => {
        setGeoEtat('erreur')
        setGeoRefus(e instanceof GeoErreur && e.code === 'refus')
        setGeoMessage(messageGeoErreur(e, langue === 'nl'))
      })
  }

  useEffect(() => {
    localiser()
    if (navigator.onLine) rafraichirCommerces().then(setCommerces)
  }, [])

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url)
  }, [photo])

  // Commerces connus tout près : la tablette propose le plus proche.
  const proches = useMemo(
    () =>
      commerces
        .map((c) => ({ c, d: distanceDe(posOuverture, c) }))
        .filter((x): x is { c: Commerce; d: number } => x.d != null && x.d <= DISTANCE_RECONNAISSANCE_M)
        .sort((a, b) => a.d - b.d),
    [commerces, posOuverture]
  )

  const resultatsRecherche = useMemo(() => {
    const q = normaliser(recherche)
    if (q.length < 2) return []
    return commerces
      .filter((c) => normaliser(`${c.nom} ${c.commune ?? ''} ${c.adresse ?? ''}`).includes(q))
      .map((c) => ({ c, d: distanceDe(posOuverture, c) }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
      .slice(0, 6)
  }, [commerces, recherche, posOuverture])

  function choisirCommerce(c: Commerce) {
    setCommerce(c)
    setNouveau(null)
    setRecherche('')
    setDetails((d) => ({
      ...d,
      contact_nom: c.contact_nom ?? '',
      contact_fonction: c.contact_fonction ?? '',
      contact_telephone: c.contact_telephone ?? '',
      contact_email: c.contact_email ?? '',
      adresse_livraison: c.adresse_livraison ?? '',
      adresse_facturation: c.adresse_facturation ?? '',
      numero_entreprise: c.numero_entreprise ?? '',
      numero_tva: c.numero_tva ?? '',
      reseau_social: c.reseau_social ?? '',
    }))
  }

  function creerNouveau() {
    setCommerce(null)
    setNouveau({
      id: crypto.randomUUID(),
      nom: recherche.trim(),
      adresse: adresseGps?.adresse ?? null,
      commune: adresseGps?.commune ?? null,
      type: 'epicerie',
    })
    setDetails((d) => ({ ...d, ...INFOS_CLIENT_VIDES }))
  }

  // Un bon signé ne vaut que pour les quantités signées, et pour ce commerce.
  const bonValable = bon && bon.plateaux === details.plateaux && bon.palettes === details.palettes ? bon : null
  useEffect(() => {
    if (bon && !bonValable) setBon(null)
  }, [bon, bonValable])
  useEffect(() => setBon(null), [commerce?.id, nouveau?.id])

  // L'adresse GPS arrive parfois après le choix « nouveau commerce ».
  useEffect(() => {
    if (adresseGps && nouveau && !nouveau.adresse) {
      setNouveau({ ...nouveau, adresse: adresseGps.adresse, commune: adresseGps.commune })
    }
  }, [adresseGps]) // eslint-disable-line react-hooks/exhaustive-deps

  function manque(rapide: boolean): string | null {
    if (geoRefus) return t('La localisation est refusée : impossible d’enregistrer la visite.', 'Locatie geweigerd: het bezoek kan niet opgeslagen worden.')
    if (!commerce && !nouveau) return t('Choisis le commerce.', 'Kies de zaak.')
    if (nouveau && !nouveau.nom.trim()) return t('Indique le nom du commerce.', 'Geef de naam van de zaak.')
    if (!details.resultat) return t('Choisis le résultat de la visite.', 'Kies het resultaat van het bezoek.')
    if (!rapide && details.resultat === 'precommande' && details.plateaux + details.palettes === 0)
      return t('Indique le nombre de plateaux ou de palettes.', 'Geef het aantal trays of paletten.')
    return null
  }

  async function enregistrer(rapide: boolean) {
    if (envoi) return
    const m = manque(rapide)
    if (m) {
      setErreur(m)
      return
    }
    if (!profile) return
    setErreur(null)
    setEnvoi(true)

    // Deuxième position, au moment de l'envoi.
    let posEnvoi: GeoPosition | null = null
    try {
      posEnvoi = await getCurrentPosition()
    } catch (e) {
      if (e instanceof GeoErreur && e.code === 'refus') {
        setGeoRefus(true)
        setErreur(messageGeoErreur(e, langue === 'nl'))
        setEnvoi(false)
        return
      }
    }
    if (!posEnvoi && !posOuverture) {
      setErreur(
        t(
          'Impossible de trouver ta position. Sors du commerce ou approche-toi d’une fenêtre, puis réessaie.',
          'Je positie is niet gevonden. Ga even naar buiten of dicht bij een raam en probeer opnieuw.'
        )
      )
      setEnvoi(false)
      return
    }

    const nom = commerce?.nom ?? nouveau!.nom.trim()
    const type: TypeCommerce = commerce?.type ?? nouveau!.type
    const d = details
    await mettreEnFile({
      client_uuid: clientUuid,
      commercial_id: profile.id,
      commerce_id: commerce?.id ?? nouveau!.id,
      commerce_nom: nom,
      nouveau_commerce: nouveau ? { ...nouveau, nom } : null,
      type_commerce: type,
      contact_nom: d.contact_nom.trim() || null,
      contact_fonction: d.contact_fonction || null,
      contact_telephone: d.contact_telephone.trim() || null,
      contact_email: d.contact_email.trim() || null,
      adresse_livraison: d.adresse_livraison.trim() || null,
      adresse_facturation: d.adresse_facturation.trim() || null,
      numero_entreprise: d.numero_entreprise.trim() || null,
      numero_tva: d.numero_tva.trim() || null,
      reseau_social: d.reseau_social.trim() || null,
      resultat: d.resultat!,
      plateaux: d.resultat === 'precommande' ? d.plateaux : null,
      palettes: d.resultat === 'precommande' ? d.palettes : null,
      date_relance: d.date_relance,
      remarques: d.remarques,
      commentaire: d.commentaire.trim() || null,
      a_completer: rapide,
      lat_ouverture: posOuverture?.lat ?? null,
      lng_ouverture: posOuverture?.lng ?? null,
      precision_ouverture_m: posOuverture?.accuracy ?? null,
      lat_envoi: posEnvoi?.lat ?? null,
      lng_envoi: posEnvoi?.lng ?? null,
      precision_envoi_m: posEnvoi?.accuracy ?? null,
      adresse_gps: adresseGps?.adresse ?? null,
      heure_ouverture: heureOuverture,
      heure_appareil: new Date().toISOString(),
      photo: photo?.blob ?? null,
      photo_prise_a: photo?.priseA ?? null,
      synchro_differee: !navigator.onLine,
      appareil_id: identifiantAppareil(),
      modele_appareil: navigator.userAgent.slice(0, 200),
      bon: bonValable && d.resultat === 'precommande' ? { signature: bonValable.signature, signataire: bonValable.signataire, signe_le: bonValable.signe_le } : null,
    })

    let message = bonValable
      ? t(`Visite chez ${nom} enregistrée ✓ — bon de commande envoyé à order@`, `Bezoek bij ${nom} opgeslagen ✓ — bestelbon naar order@ verstuurd`)
      : t(`Visite chez ${nom} enregistrée ✓`, `Bezoek bij ${nom} opgeslagen ✓`)
    if (navigator.onLine) {
      const { restantes } = await synchroniserVisites(profile.id)
      if (restantes > 0) message += t(' — elle partira dès que le réseau revient.', ' — het wordt verzonden zodra er netwerk is.')
    } else {
      message += t(' — hors connexion, elle partira dès que le réseau revient.', ' — offline, het wordt verzonden zodra er netwerk is.')
    }
    navigate('/visites', { replace: true, state: { message } })
  }

  const suggestion = !commerce && !nouveau && !suggestionRefusee ? proches[0] : undefined

  return (
    <div className="min-h-screen bg-slate-100 pb-40">
      <AdalaHeader
        titre={t('Nouvelle visite', 'Nieuw bezoek')}
        droite={
          <Link to="/visites" className="rounded-lg px-3 py-2 text-sm text-slate-300 active:bg-white/10">
            {t('Annuler', 'Annuleren')}
          </Link>
        }
      />

      <main className="mx-auto max-w-3xl space-y-3 px-3 py-3">
        {/* Position */}
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            geoEtat === 'ok'
              ? posOuverture!.accuracy > 100
                ? 'bg-amber-50 text-amber-900'
                : 'bg-emerald-50 text-emerald-900'
              : geoEtat === 'erreur'
                ? 'bg-red-50 text-red-800'
                : 'bg-slate-200 text-slate-700'
          }`}
        >
          {geoEtat === 'recherche' && t('📍 Recherche de ta position…', '📍 Je positie wordt gezocht…')}
          {geoEtat === 'ok' && (
            <>
              📍 {t('Position trouvée (précision', 'Positie gevonden (nauwkeurigheid')} ±{Math.round(posOuverture!.accuracy)} m)
              {posOuverture!.accuracy > 100 &&
                t(' — approche-toi de la vitrine ou sors un instant pour mieux capter.', ' — ga dichter bij de etalage of even naar buiten voor beter bereik.')}
            </>
          )}
          {geoEtat === 'erreur' && (
            <div className="space-y-2">
              <p>{geoMessage}</p>
              <button onClick={localiser} className="rounded-lg bg-white px-3 py-2 font-semibold text-red-800">
                {t('Réessayer', 'Opnieuw proberen')}
              </button>
            </div>
          )}
        </div>

        {/* 1. Commerce */}
        <Section titre={t('Commerce', 'Zaak')}>
          {suggestion && (
            <div className="mb-3 rounded-xl border-2 border-[#b83a2c] bg-red-50 p-4">
              <p className="text-base text-slate-800">
                {t('Tu es chez', 'Ben je bij')} <strong>{suggestion.c.nom}</strong> ?
                <span className="text-sm text-slate-500"> ({formatDistance(suggestion.d)})</span>
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => choisirCommerce(suggestion.c)}
                  className="min-h-12 flex-1 rounded-xl bg-[#b83a2c] text-lg font-semibold text-white active:opacity-90"
                >
                  {t('Oui', 'Ja')}
                </button>
                <button
                  onClick={() => setSuggestionRefusee(true)}
                  className="min-h-12 flex-1 rounded-xl border-2 border-slate-300 bg-white text-lg font-semibold text-slate-700"
                >
                  {t('Non', 'Nee')}
                </button>
              </div>
            </div>
          )}

          {commerce ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-slate-900">{commerce.nom}</p>
                <p className="truncate text-sm text-slate-500">
                  {labelType(commerce.type)}
                  {commerce.adresse && ` · ${commerce.adresse}`}
                </p>
              </div>
              <button
                onClick={() => setCommerce(null)}
                className="shrink-0 text-sm font-semibold text-[#b83a2c]"
              >
                {t('Changer', 'Wijzigen')}
              </button>
            </div>
          ) : nouveau ? (
            <div className="space-y-3">
              <input
                value={nouveau.nom}
                onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
                placeholder={t('Nom du commerce', 'Naam van de zaak')}
                autoFocus
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
              />
              <input
                value={nouveau.adresse ?? ''}
                onChange={(e) => setNouveau({ ...nouveau, adresse: e.target.value || null })}
                placeholder={navigator.onLine ? t('Adresse (recherche en cours…)', 'Adres (wordt gezocht…)') : t('Adresse', 'Adres')}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
              <div className="flex flex-wrap gap-2">
                {TYPES_COMMERCE.map((ty) => (
                  <Puce
                    key={ty.valeur}
                    actif={nouveau.type === ty.valeur}
                    onClick={() => setNouveau({ ...nouveau, type: ty.valeur })}
                  >
                    {ty.emoji} {labelType(ty.valeur)}
                  </Puce>
                ))}
              </div>
              <button onClick={() => setNouveau(null)} className="text-sm font-semibold text-slate-500">
                ← {t('Chercher un commerce existant', 'Een bestaande zaak zoeken')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {!suggestion &&
                proches.slice(0, 3).map(({ c, d }) => (
                  <button
                    key={c.id}
                    onClick={() => choisirCommerce(c)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left active:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">{c.nom}</span>
                    <span className="text-sm text-slate-400">{formatDistance(d)}</span>
                  </button>
                ))}
              <input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t('Nom du commerce…', 'Naam van de zaak…')}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
              />
              {resultatsRecherche.map(({ c, d }) => (
                <button
                  key={c.id}
                  onClick={() => choisirCommerce(c)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left active:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{c.nom}</span>
                    <span className="block truncate text-sm text-slate-500">{c.adresse ?? c.commune ?? ''}</span>
                  </span>
                  <span className="shrink-0 text-sm text-slate-400">{formatDistance(d)}</span>
                </button>
              ))}
              <button
                onClick={creerNouveau}
                className="min-h-12 w-full rounded-xl border-2 border-dashed border-slate-300 text-base font-semibold text-slate-700 active:bg-slate-50"
              >
                + {t('Nouveau commerce', 'Nieuwe zaak')}{recherche.trim() && ` « ${recherche.trim()} »`}
              </button>
            </div>
          )}
        </Section>

        {/* 2. Photo */}
        <Section titre={t('Photo (facultative : vitrine, rayon ou frigo)', 'Foto (optioneel: etalage, rek of koelkast)')}>
          {photo ? (
            <div className="flex items-center gap-4">
              <img src={photo.url} alt={t('Photo de la visite', 'Foto van het bezoek')} className="h-28 w-28 rounded-xl object-cover" />
              <button
                onClick={() => setCameraOuverte(true)}
                className="min-h-12 rounded-xl border-2 border-slate-300 px-4 font-semibold text-slate-700"
              >
                {t('Reprendre', 'Opnieuw nemen')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCameraOuverte(true)}
              className="min-h-16 w-full rounded-xl bg-slate-800 text-lg font-semibold text-white active:bg-slate-900"
            >
              📷 {t('Prendre la photo', 'Foto nemen')}
            </button>
          )}
        </Section>

        <ChampsVisite
          key={commerce?.id ?? nouveau?.id ?? 'aucun'}
          details={details}
          onChange={setDetails}
          contactConnu={!!commerce?.contact_nom}
          adresseCommerce={adresseComplete(commerce ?? nouveau)}
        />

        {(commerce || nouveau) && (
          <CadreBon
            quantite={details.plateaux + details.palettes}
            bon={bonValable}
            onOuvrir={() => setBonOuvert(true)}
            onRetirer={() => setBon(null)}
          />
        )}
      </main>

      {/* Boutons fixes en bas, à portée de pouce */}
      <div className="fixed inset-x-0 bottom-0 z-[600] border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="mx-auto max-w-3xl space-y-2">
          {erreur && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {erreur}
            </p>
          )}
          <button
            onClick={() => enregistrer(false)}
            disabled={envoi || geoRefus}
            className="min-h-14 w-full rounded-xl bg-[#b83a2c] text-lg font-bold text-white active:opacity-90 disabled:opacity-50"
          >
            {envoi ? t('Enregistrement…', 'Opslaan…') : t('Enregistrer la visite', 'Bezoek opslaan')}
          </button>
          <button
            onClick={() => enregistrer(true)}
            disabled={envoi || geoRefus}
            className="w-full py-1 text-sm font-semibold text-slate-500 disabled:opacity-50"
          >
            {t('Pas le temps ? Enregistrer et compléter plus tard', 'Geen tijd? Opslaan en later aanvullen')}
          </button>
        </div>
      </div>

      {bonOuvert && (commerce || nouveau) && (
        <BonCommande
          client={{
            nom: commerce?.nom ?? nouveau!.nom,
            adresse: adresseComplete(commerce ?? nouveau),
            numero_entreprise: details.numero_entreprise,
            adresse_facturation: details.adresse_facturation,
            adresse_livraison: details.adresse_livraison,
            contact_nom: details.contact_nom,
            contact_telephone: details.contact_telephone,
          }}
          plateaux={details.plateaux}
          palettes={details.palettes}
          onFermer={() => setBonOuvert(false)}
          onSigne={(b) => {
            setBon(b)
            setBonOuvert(false)
          }}
        />
      )}

      {cameraOuverte && (
        <CameraCapture
          onFermer={() => setCameraOuverte(false)}
          onPhoto={(blob, priseA) => {
            setPhoto({ blob, url: URL.createObjectURL(blob), priseA })
            setCameraOuverte(false)
          }}
        />
      )}
    </div>
  )
}
