import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { appelServeur, demanderArchivageDrive } from '../../lib/visitesQueue'
import { TYPES_COMMERCE } from '../../lib/visites'
import { useLangue } from '../../lib/langue'
import type { TypeCommerce, Visite } from '../../types/database'
import AdalaHeader from '../../components/visites/AdalaHeader'
import ChampsVisite, { DETAILS_VIDES, Puce, Section, adresseComplete, type DetailsVisite } from '../../components/visites/ChampsVisite'

const DELAI_MODIFICATION_MS = 7 * 24 * 3600000

/** L'adresse GPS contient souvent déjà la commune : on ne la répète pas. */
function adresseAffichee(v: VisiteChargee) {
  const adresse = v.commerce.adresse ?? v.adresse_gps ?? ''
  const commune = v.commerce.commune
  if (commune && !adresse.toLowerCase().includes(commune.toLowerCase())) return [adresse, commune].filter(Boolean).join(', ')
  return adresse || commune || '—'
}

interface VisiteChargee extends Visite {
  commerce: { nom: string; type: TypeCommerce; adresse: string | null; commune: string | null }
}

/**
 * Fiche d'une visite côté commerciale : tout se modifie pendant 7 jours,
 * sauf la photo, l'adresse, l'heure et la position GPS (affichées seulement).
 */
export default function CompleterVisitePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, locale, labelType } = useLangue()
  const [visite, setVisite] = useState<VisiteChargee | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [type, setType] = useState<TypeCommerce>('autre')
  const [details, setDetails] = useState<DetailsVisite | null>(null)
  const [modifiable, setModifiable] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    supabase
      .from('visites')
      .select('*, commerce:commerces(nom, type, adresse, commune)')
      .eq('id', id!)
      .single()
      .then(async ({ data, error }) => {
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
        const { data: lien } = await supabase.storage.from('visites-photos').createSignedUrl(v.photo_path, 3600)
        setPhoto(lien?.signedUrl ?? null)
      })
  }, [id])

  async function enregistrer() {
    if (!details || !visite) return
    if (!nom.trim()) {
      setErreur(t('Indique le nom du commerce.', 'Geef de naam van de zaak.'))
      return
    }
    if (details.resultat === 'precommande' && details.plateaux + details.palettes === 0) {
      setErreur(t('Indique le nombre de plateaux ou de palettes.', 'Geef het aantal trays of paletten.'))
      return
    }
    setEnvoi(true)
    setErreur(null)

    if (nom.trim() !== visite.commerce.nom || type !== visite.commerce.type) {
      const { error } = await supabase.rpc('modifier_commerce_visite', { p_visite: visite.id, p_nom: nom, p_type: type })
      if (error) {
        setEnvoi(false)
        setErreur(navigator.onLine ? `${t('Commerce non modifié', 'Zaak niet gewijzigd')} (${error.message}).` : t('Pas de connexion : réessaie dans un instant.', 'Geen verbinding: probeer zo opnieuw.'))
        return
      }
    }

    const d = details
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
      })
      .eq('id', id!)
      .select('id')
    setEnvoi(false)
    if (error) {
      setErreur(navigator.onLine ? `${t('Enregistrement refusé', 'Opslaan geweigerd')} (${error.message}).` : t('Pas de connexion : réessaie dans un instant.', 'Geen verbinding: probeer zo opnieuw.'))
      return
    }
    // Sans ligne renvoyée, la base a refusé (délai de 7 jours dépassé).
    if (!maj?.length) {
      setErreur(t('Cette visite ne peut plus être modifiée.', 'Dit bezoek kan niet meer gewijzigd worden.'))
      return
    }
    demanderArchivageDrive()
    navigate('/visites', {
      replace: true,
      state: {
        message: visite.a_completer
          ? t(`Visite chez ${nom.trim()} complétée ✓`, `Bezoek bij ${nom.trim()} aangevuld ✓`)
          : t(`Visite chez ${nom.trim()} modifiée ✓`, `Bezoek bij ${nom.trim()} gewijzigd ✓`),
      },
    })
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
            {photo ? (
              <a href={photo} target="_blank" rel="noreferrer">
                <img src={photo} alt={t('Photo de la visite', 'Foto van het bezoek')} className="max-h-80 w-full bg-slate-200 object-contain" />
              </a>
            ) : (
              <div className="flex h-40 items-center justify-center bg-slate-200 text-slate-500">Photo…</div>
            )}
            <div className="space-y-1 p-4 text-sm">
              <p className="text-slate-500 first-letter:uppercase">{date}</p>
              <p className="text-slate-800">
                📍 {adresseAffichee(visite)}
              </p>
              <p className="text-xs text-slate-400">{t("La photo et l'adresse ne se modifient pas.", 'Foto en adres kunnen niet gewijzigd worden.')}</p>
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
                className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
              />
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
              adresseCommerce={adresseComplete(visite!.commerce)}
            />
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
              onClick={enregistrer}
              disabled={envoi}
              className="min-h-14 w-full rounded-xl bg-[#b83a2c] text-lg font-bold text-white disabled:opacity-50"
            >
              {envoi ? t('Enregistrement…', 'Opslaan…') : t('Enregistrer', 'Opslaan')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
