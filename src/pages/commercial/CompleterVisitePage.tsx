import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { appelServeur, demanderArchivageDrive } from '../../lib/visitesQueue'
import { TYPES_COMMERCE } from '../../lib/visites'
import { useLangue } from '../../lib/langue'
import type { TypeCommerce, Visite } from '../../types/database'
import AdalaHeader from '../../components/visites/AdalaHeader'
import BonCommande, { CadreBon, EnvoiBonClient, type BonSigne } from '../../components/visites/BonCommande'
import CameraCapture from '../../components/visites/CameraCapture'
import ChampsVisite, { DETAILS_VIDES, Puce, Section, adresseComplete, type DetailsVisite } from '../../components/visites/ChampsVisite'

const DELAI_MODIFICATION_MS = 7 * 24 * 3600000

interface VisiteChargee extends Visite {
  commerce: { nom: string; type: TypeCommerce; adresse: string | null; commune: string | null }
}

/**
 * Fiche d'une visite côté commerciale : tout se modifie pendant 7 jours
 * (commerce, adresse, photo, résultat, commande, contact…), sauf l'heure et
 * la position GPS, qui prouvent la visite.
 */
export default function CompleterVisitePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, locale, labelType } = useLangue()
  const [bon, setBon] = useState<BonSigne | null>(null)
  const [bonOuvert, setBonOuvert] = useState(false)
  const [envoiClient, setEnvoiClient] = useState(false)
  const [visite, setVisite] = useState<VisiteChargee | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [nouvellePhoto, setNouvellePhoto] = useState<{ blob: Blob; url: string; priseA: string } | null>(null)
  const [cameraOuverte, setCameraOuverte] = useState(false)
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypeCommerce>('autre')
  const [adresse, setAdresse] = useState('')
  const [commune, setCommune] = useState('')
  const [details, setDetails] = useState<DetailsVisite | null>(null)
  const [modifiable, setModifiable] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function charger() {
    const { data, error } = await supabase
      .from('visites')
      .select('*, commerce:commerces(nom, type, adresse, commune)')
      .eq('id', id!)
      .single()
    if (error || !data) {
      setErreur(
        navigator.onLine
          ? t('Visite introuvable.', 'Bezoek niet gevonden.')
          : t('Connecte-toi à internet pour ouvrir cette visite.', 'Maak verbinding met internet om dit bezoek te openen.')
      )
      return
    }
    const v = data as VisiteChargee
    setVisite(v)
    setNom(v.commerce.nom)
    setType(v.type_commerce ?? v.commerce.type)
    setAdresse(v.commerce.adresse ?? '')
    setCommune(v.commerce.commune ?? '')
    setModifiable(Date.now() - new Date(v.heure_serveur).getTime() < DELAI_MODIFICATION_MS)
    setDetails({
      ...DETAILS_VIDES,
      resultat: v.resultat,
      plateaux: v.plateaux ?? 0,
      palettes: v.palettes ?? 0,
      date_relance: v.date_relance,
      remarques: v.remarques ?? [],
      commentaire: v.commentaire ?? '',
      contact_nom: v.contact_nom ?? '',
      contact_fonction: v.contact_fonction ?? '',
      contact_telephone: v.contact_telephone ?? '',
      contact_email: v.contact_email ?? '',
      adresse_livraison: v.adresse_livraison ?? '',
      adresse_facturation: v.adresse_facturation ?? '',
      numero_entreprise: v.numero_entreprise ?? '',
      numero_tva: v.numero_tva ?? '',
      reseau_social: v.reseau_social ?? '',
    })
    setBon(null)
    setNouvellePhoto(null)
    if (!v.photo_path) return setPhoto(null)
    const { data: lien } = await supabase.storage.from('visites-photos').createSignedUrl(v.photo_path, 3600)
    setPhoto(lien?.signedUrl ?? null)
  }

  useEffect(() => {
    charger()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (nouvellePhoto) URL.revokeObjectURL(nouvellePhoto.url)
    }
  }, [nouvellePhoto])

  // Quantités du formulaire différentes de celles enregistrées.
  const quantitesChangees =
    !!visite && !!details && (details.plateaux !== (visite.plateaux ?? 0) || details.palettes !== (visite.palettes ?? 0))
  const quantite = details?.resultat === 'precommande' ? details.plateaux + details.palettes : 0
  // Le bon signé ne vaut que pour les quantités signées.
  const bonSigneValable = !!visite?.bon_signe_le && !quantitesChangees
  const bonLocal = bon && details && bon.plateaux === details.plateaux && bon.palettes === details.palettes ? bon : null

  /** Enregistre la visite ; avec « rester », on reste sur la fiche. */
  async function enregistrer(rester = false): Promise<boolean> {
    if (!details || !visite) return false
    if (!nom.trim()) {
      setErreur(t('Indique le nom du commerce.', 'Geef de naam van de zaak.'))
      return false
    }
    if (details.resultat === 'precommande' && details.plateaux + details.palettes === 0) {
      setErreur(t('Indique le nombre de plateaux ou de palettes.', 'Geef het aantal trays of paletten.'))
      return false
    }
    setEnvoi(true)
    setErreur(null)

    const commerceChange =
      nom.trim() !== visite.commerce.nom ||
      type !== visite.commerce.type ||
      adresse.trim() !== (visite.commerce.adresse ?? '') ||
      commune.trim() !== (visite.commerce.commune ?? '')
    if (commerceChange) {
      const { error } = await supabase.rpc('modifier_commerce_visite', {
        p_visite: visite.id,
        p_nom: nom,
        p_type: type,
        p_adresse: adresse,
        p_commune: commune,
      })
      if (error) {
        setEnvoi(false)
        setErreur(navigator.onLine ? `${t('Commerce non modifié', 'Zaak niet gewijzigd')} (${error.message}).` : t('Pas de connexion : réessaie dans un instant.', 'Geen verbinding: probeer zo opnieuw.'))
        return false
      }
    }

    // Fichiers rangés avant la visite : nouvelle photo, signature du bon.
    let photoPath: string | null = null
    if (nouvellePhoto) {
      photoPath = `${visite.commercial_id}/${visite.client_uuid}-${Date.now()}.jpg`
      const { error: errPhoto } = await supabase.storage
        .from('visites-photos')
        .upload(photoPath, nouvellePhoto.blob, { contentType: 'image/jpeg' })
      if (errPhoto) {
        setEnvoi(false)
        setErreur(`${t('Photo non enregistrée', 'Foto niet opgeslagen')} (${errPhoto.message}).`)
        return false
      }
    }

    const d = details
    const nouveauBon = bonLocal && d.resultat === 'precommande' && (!visite.bon_signe_le || quantitesChangees) ? bonLocal : null
    let signaturePath: string | null = null
    if (nouveauBon) {
      signaturePath = `${visite.commercial_id}/${visite.client_uuid}-signature-${Date.now()}.png`
      const { error: errSig } = await supabase.storage
        .from('visites-photos')
        .upload(signaturePath, nouveauBon.signature, { contentType: 'image/png', upsert: true })
      if (errSig) {
        setEnvoi(false)
        setErreur(`${t('Signature non enregistrée', 'Handtekening niet opgeslagen')} (${errSig.message}).`)
        return false
      }
    }
    const { data: maj, error } = await supabase
      .from('visites')
      .update({
        type_commerce: type,
        resultat: d.resultat,
        plateaux: d.resultat === 'precommande' ? d.plateaux : null,
        palettes: d.resultat === 'precommande' ? d.palettes : null,
        date_relance: d.date_relance,
        remarques: d.remarques,
        commentaire: d.commentaire.trim() || null,
        contact_nom: d.contact_nom.trim() || null,
        contact_fonction: d.contact_fonction || null,
        contact_telephone: d.contact_telephone.trim() || null,
        contact_email: d.contact_email.trim() || null,
        adresse_livraison: d.adresse_livraison.trim() || null,
        adresse_facturation: d.adresse_facturation.trim() || null,
        numero_entreprise: d.numero_entreprise.trim() || null,
        numero_tva: d.numero_tva.trim() || null,
        reseau_social: d.reseau_social.trim() || null,
        a_completer: false,
        ...(photoPath ? { photo_path: photoPath, photo_prise_a: nouvellePhoto!.priseA } : {}),
        ...(nouveauBon
          ? { bon_signature_path: signaturePath, bon_signataire: nouveauBon.signataire, bon_signe_le: nouveauBon.signe_le }
          : {}),
      })
      .eq('id', id!)
      .select('id')
    if (error) {
      setEnvoi(false)
      setErreur(navigator.onLine ? `${t('Enregistrement refusé', 'Opslaan geweigerd')} (${error.message}).` : t('Pas de connexion : réessaie dans un instant.', 'Geen verbinding: probeer zo opnieuw.'))
      return false
    }
    // Sans ligne renvoyée, la base a refusé (délai de 7 jours dépassé).
    if (!maj?.length) {
      setEnvoi(false)
      setErreur(t('Cette visite ne peut plus être modifiée.', 'Dit bezoek kan niet meer gewijzigd worden.'))
      return false
    }
    demanderArchivageDrive()
    if (nouveauBon) await appelServeur('/api/bon-commande', { id: visite.id })
    setEnvoi(false)

    // Quantités changées sur un bon signé, sans nouvelle signature : on reste
    // ici pour faire signer ou envoyer le nouveau bon au client.
    const aResigner = !!visite.bon_signe_le && quantitesChangees && !nouveauBon && d.resultat === 'precommande'
    if (rester || aResigner) {
      await charger()
      setInfo(
        aResigner
          ? t(
              'Visite enregistrée. Les quantités ont changé : fais signer le nouveau bon, ou envoie-le au client.',
              'Bezoek opgeslagen. De aantallen zijn gewijzigd: laat de nieuwe bon tekenen of stuur hem naar de klant.'
            )
          : null
      )
      return true
    }
    navigate('/visites', {
      replace: true,
      state: {
        message: nouveauBon
          ? t(`Visite chez ${nom.trim()} enregistrée ✓ — bon de commande envoyé à order@`, `Bezoek bij ${nom.trim()} opgeslagen ✓ — bestelbon naar order@ verstuurd`)
          : visite.a_completer
            ? t(`Visite chez ${nom.trim()} complétée ✓`, `Bezoek bij ${nom.trim()} aangevuld ✓`)
            : t(`Visite chez ${nom.trim()} modifiée ✓`, `Bezoek bij ${nom.trim()} gewijzigd ✓`),
      },
    })
    return true
  }

  /** Le bon envoyé au client doit correspondre à ce qui est enregistré. */
  async function ouvrirEnvoiClient() {
    setInfo(null)
    if (await enregistrer(true)) setEnvoiClient(true)
  }

  async function effacer() {
    if (!visite) return
    const question = t(
      `Effacer la visite chez ${visite.commerce.nom} ?\n\nLa visite et sa photo seront supprimées.`,
      `Bezoek bij ${visite.commerce.nom} wissen?\n\nHet bezoek en de foto worden verwijderd.`
    )
    if (!window.confirm(question)) return
    setEnvoi(true)
    const r = await appelServeur('/api/supprimer-visite', { id: visite.id })
    setEnvoi(false)
    if (r.erreur) {
      setErreur(r.erreur)
      return
    }
    navigate('/visites', { replace: true, state: { message: t(`Visite chez ${visite.commerce.nom} effacée`, `Bezoek bij ${visite.commerce.nom} gewist`) } })
  }

  const date = visite
    ? new Date(visite.heure_appareil).toLocaleString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  const heureCourte = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const imagePhoto = nouvellePhoto?.url ?? photo

  return (
    <div className="min-h-screen bg-slate-100 pb-40">
      <AdalaHeader
        titre={visite ? visite.commerce.nom : t('Visite', 'Bezoek')}
        droite={
          <Link to="/visites" className="rounded-lg px-3 py-2 text-sm text-slate-300">
            {t('Retour', 'Terug')}
          </Link>
        }
      />
      <main className="mx-auto max-w-3xl space-y-3 px-3 py-3">
        {visite && (
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {imagePhoto ? (
              <a href={imagePhoto} target="_blank" rel="noreferrer">
                <img src={imagePhoto} alt={t('Photo de la visite', 'Foto van het bezoek')} className="max-h-80 w-full bg-slate-200 object-contain" />
              </a>
            ) : visite.photo_path ? (
              <div className="flex h-40 items-center justify-center bg-slate-200 text-slate-500">Photo…</div>
            ) : (
              <div className="flex h-16 items-center justify-center bg-slate-100 text-sm text-slate-500">{t('Pas de photo', 'Geen foto')}</div>
            )}
            <div className="space-y-2 p-4 text-sm">
              {modifiable && (
                <button
                  type="button"
                  onClick={() => setCameraOuverte(true)}
                  className="min-h-12 w-full rounded-xl border-2 border-slate-300 font-semibold text-slate-700 active:bg-slate-50"
                >
                  📷 {imagePhoto ? t('Changer la photo', 'Foto vervangen') : t('Ajouter une photo', 'Foto toevoegen')}
                </button>
              )}
              <p className="text-slate-500 first-letter:uppercase">{date}</p>
              <p className="text-xs text-slate-400">
                {t("L'heure et la position GPS ne se modifient pas : elles prouvent la visite.", 'Tijdstip en GPS-positie kunnen niet gewijzigd worden: ze bewijzen het bezoek.')}
              </p>
            </div>
          </section>
        )}

        {visite && !modifiable && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('Cette visite a plus de 7 jours : elle ne peut plus être modifiée.', 'Dit bezoek is ouder dan 7 dagen: het kan niet meer gewijzigd worden.')}
          </p>
        )}

        {details && modifiable && (
          <>
            <Section titre={t('Commerce', 'Zaak')}>
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder={t('Nom du commerce', 'Naam van de zaak')}
                className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
              />
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <input
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder={t('Adresse (rue et numéro)', 'Adres (straat en nummer)')}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base sm:col-span-2"
                />
                <input
                  value={commune}
                  onChange={(e) => setCommune(e.target.value)}
                  placeholder={t('Commune', 'Gemeente')}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {TYPES_COMMERCE.map((ty) => (
                  <Puce key={ty.valeur} actif={type === ty.valeur} onClick={() => setType(ty.valeur)}>
                    {ty.emoji} {labelType(ty.valeur)}
                  </Puce>
                ))}
              </div>
            </Section>
            <ChampsVisite
              details={details}
              onChange={setDetails}
              contactConnu={!!details.contact_nom}
              adresseCommerce={adresseComplete({ adresse: adresse || null, commune: commune || null })}
            />

            {info && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{info}</p>}

            {visite!.bon_signe_le && quantitesChangees && quantite > 0 && !bonLocal && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t(
                  'Les quantités ont changé : le bon signé n’est plus valable. Le client doit signer le nouveau bon, ici ou à distance.',
                  'De aantallen zijn gewijzigd: de getekende bon geldt niet meer. De klant moet de nieuwe bon tekenen, hier of op afstand.'
                )}
              </p>
            )}
            <CadreBon
              quantite={quantite}
              bon={
                bonSigneValable
                  ? { signataire: visite!.bon_signataire ?? '', signe_le: visite!.bon_signe_le! }
                  : bonLocal
              }
              onOuvrir={() => setBonOuvert(true)}
              onRetirer={bonSigneValable ? undefined : () => setBon(null)}
            />
            {bonSigneValable && (
              <p className="-mt-1 px-1 text-xs text-slate-500">
                {visite!.bon_envoye_le
                  ? t('Bon envoyé à order@ ✓. Si les quantités changent, il faudra le refaire signer.', 'Bestelbon naar order@ verstuurd ✓. Als de aantallen wijzigen, moet hij opnieuw getekend worden.')
                  : t('Bon en cours d’envoi à order@.', 'Bestelbon wordt naar order@ verstuurd.')}
              </p>
            )}
            {!bonSigneValable && !bonLocal && quantite > 0 && (
              <div className="space-y-2">
                {visite!.bon_client_envoye_le && !quantitesChangees && (
                  <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    {t(
                      `Bon envoyé au client le ${heureCourte(visite!.bon_client_envoye_le)} (${visite!.bon_client_canal === 'email' ? 'e-mail' : visite!.bon_client_canal === 'partage' ? t('partage', 'gedeeld') : 'WhatsApp'}). En attente de la copie signée.`,
                      `Bestelbon naar de klant gestuurd op ${heureCourte(visite!.bon_client_envoye_le)} (${visite!.bon_client_canal === 'email' ? 'e-mail' : visite!.bon_client_canal === 'partage' ? t('partage', 'gedeeld') : 'WhatsApp'}). Wachten op de getekende kopie.`
                    )}
                  </p>
                )}
                <button
                  type="button"
                  disabled={envoi}
                  onClick={ouvrirEnvoiClient}
                  className="min-h-14 w-full rounded-xl border-2 border-slate-300 bg-white text-base font-semibold text-slate-800 disabled:opacity-50"
                >
                  📤 {visite!.bon_client_envoye_le && !quantitesChangees
                    ? t('Renvoyer le bon au client', 'Bestelbon opnieuw naar de klant sturen')
                    : t('Client absent : envoyer le bon à signer (WhatsApp / e-mail)', 'Klant afwezig: bestelbon sturen om te tekenen (WhatsApp / e-mail)')}
                </button>
              </div>
            )}

            <button
              onClick={effacer}
              disabled={envoi}
              className="w-full rounded-xl border-2 border-red-200 bg-white py-3 font-semibold text-red-700 disabled:opacity-50"
            >
              🗑 {t('Effacer cette visite', 'Dit bezoek wissen')}
            </button>
          </>
        )}
        {!visite && !erreur && <p className="py-10 text-center text-slate-400">{t('Chargement…', 'Laden…')}</p>}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-[600] border-t border-slate-200 bg-white/95 px-3 py-3">
        <div className="mx-auto max-w-3xl space-y-2">
          {erreur && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {erreur}
            </p>
          )}
          {details && modifiable && (
            <button
              onClick={() => enregistrer()}
              disabled={envoi}
              className="min-h-14 w-full rounded-xl bg-[#b83a2c] text-lg font-bold text-white disabled:opacity-50"
            >
              {envoi ? t('Enregistrement…', 'Opslaan…') : t('Enregistrer', 'Opslaan')}
            </button>
          )}
        </div>
      </div>

      {bonOuvert && visite && details && (
        <BonCommande
          client={{
            nom: nom.trim() || visite.commerce.nom,
            adresse: adresseComplete({ adresse: adresse || null, commune: commune || null }),
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

      {envoiClient && visite && details && (
        <EnvoiBonClient
          visiteId={visite.id}
          commerce={nom.trim() || visite.commerce.nom}
          telephone={details.contact_telephone}
          email={details.contact_email}
          onFermer={() => setEnvoiClient(false)}
          onEnvoye={(message) => {
            setEnvoiClient(false)
            setInfo(message)
            charger()
          }}
        />
      )}

      {cameraOuverte && (
        <CameraCapture
          onFermer={() => setCameraOuverte(false)}
          onPhoto={(blob, priseA) => {
            setNouvellePhoto({ blob, url: URL.createObjectURL(blob), priseA })
            setCameraOuverte(false)
          }}
        />
      )}
    </div>
  )
}
