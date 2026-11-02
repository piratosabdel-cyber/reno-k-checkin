import { useEffect, useRef, useState } from 'react'
import { useLangue } from '../../lib/langue'
import { appelServeur } from '../../lib/visitesQueue'

export interface BonSigne {
  signature: Blob
  signataire: string
  signe_le: string
  /** Quantités au moment de la signature : si elles changent, il faut re-signer. */
  plateaux: number
  palettes: number
}

export interface ClientBon {
  nom: string
  adresse: string | null
  numero_entreprise: string
  adresse_facturation: string
  adresse_livraison: string
  contact_nom: string
  contact_telephone: string
}

/** Cadre « Bon de commande » du formulaire : bouton pour faire signer, ou bon déjà signé. */
export function CadreBon({
  quantite,
  bon,
  onOuvrir,
  onRetirer,
}: {
  quantite: number
  bon: { signataire: string; signe_le: string } | null
  onOuvrir: () => void
  onRetirer?: () => void
}) {
  const { t, locale } = useLangue()
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t('Bon de commande', 'Bestelbon')}
      </h2>
      {bon ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
          <span>
            ✓ {t('Signé par', 'Getekend door')} <strong>{bon.signataire}</strong>
            <span className="text-sm">
              {' '}
              · {new Date(bon.signe_le).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
          {onRetirer && (
            <button type="button" onClick={onRetirer} className="shrink-0 text-sm font-semibold underline">
              {t('Refaire', 'Opnieuw')}
            </button>
          )}
        </div>
      ) : quantite > 0 ? (
        <button
          type="button"
          onClick={onOuvrir}
          className="min-h-14 w-full rounded-xl border-2 border-[#b83a2c] bg-white text-lg font-bold text-[#b83a2c] active:bg-red-50"
        >
          ✍ {t('Faire signer le bon de commande', 'Bestelbon laten tekenen')}
        </button>
      ) : (
        <p className="text-sm text-slate-400">
          {t('Indique une quantité dans « Commande » pour faire signer un bon.', 'Geef een aantal bij « Bestelling » om een bestelbon te laten tekenen.')}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">
        {t('Le bon signé part tout de suite à order@adalacola.com.', 'De getekende bestelbon gaat meteen naar order@adalacola.com.')}
      </p>
    </section>
  )
}

/**
 * Le bon de commande affiché au client sur la tablette, qu'il signe du doigt.
 * Le PDF définitif est fabriqué par le serveur à partir des mêmes données.
 */
export default function BonCommande({
  client,
  plateaux,
  palettes,
  commercial,
  onSigne,
  onFermer,
}: {
  client: ClientBon
  plateaux: number
  palettes: number
  commercial: string
  onSigne: (b: BonSigne) => void
  onFermer: () => void
}) {
  const { t, locale } = useLangue()
  const canvas = useRef<HTMLCanvasElement>(null)
  const dessin = useRef<{ actif: boolean; x: number; y: number }>({ actif: false, x: 0, y: 0 })
  const [vide, setVide] = useState(true)
  const [signataire, setSignataire] = useState(client.contact_nom)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    const c = canvas.current!
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function debut(e: React.PointerEvent<HTMLCanvasElement>) {
    canvas.current!.setPointerCapture(e.pointerId)
    dessin.current = { actif: true, ...point(e) }
  }

  function trace(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dessin.current.actif) return
    const ctx = canvas.current!.getContext('2d')!
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(dessin.current.x, dessin.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    dessin.current = { actif: true, ...p }
    setVide(false)
  }

  function effacer() {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setVide(true)
  }

  function valider() {
    if (!signataire.trim()) {
      setErreur(t('Indique le nom de la personne qui signe.', 'Geef de naam van wie tekent.'))
      return
    }
    if (vide) {
      setErreur(t('Le client doit signer dans le cadre.', 'De klant moet in het kader tekenen.'))
      return
    }
    canvas.current!.toBlob((blob) => {
      if (!blob) return
      onSigne({ signature: blob, signataire: signataire.trim(), signe_le: new Date().toISOString(), plateaux, palettes })
    }, 'image/png')
  }

  const ligne = (label: string, valeur: string | null) =>
    valeur ? (
      <p>
        <span className="text-slate-500">{label} : </span>
        {valeur}
      </p>
    ) : null

  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-slate-100">
      <div className="mx-auto max-w-3xl space-y-3 p-3 pb-10">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b-2 border-[#b83a2c] pb-3">
            <div className="flex items-center gap-3">
              <img src="/adala/icon-192.png" alt="" className="h-12 w-12 rounded-full" />
              <div>
                <p className="text-xl font-bold text-[#b83a2c]">BON DE COMMANDE</p>
                <p className="text-sm font-semibold text-slate-500">BESTELBON</p>
              </div>
            </div>
            <p className="text-right text-sm text-slate-500">{new Date().toLocaleDateString(locale)}</p>
          </div>

          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-slate-400">{t('Fournisseur', 'Leverancier')}</p>
              <p className="font-semibold">Adala Drinks Europe SRL</p>
              <p>Z.5 Mollem 44, 1730 Asse</p>
              <p>order@adalacola.com</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase text-slate-400">{t('Client', 'Klant')}</p>
              <p className="font-semibold">{client.nom}</p>
              {client.adresse && <p>{client.adresse}</p>}
              {ligne(t("N° d'entreprise", 'Ondernemingsnr.'), client.numero_entreprise)}
              {ligne(t('Facturation', 'Facturatie'), client.adresse_facturation)}
              {ligne(t('Livraison', 'Levering'), client.adresse_livraison || client.adresse_facturation)}
              {ligne(t('Contact', 'Contact'), [client.contact_nom, client.contact_telephone].filter(Boolean).join(' · '))}
            </div>
          </div>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="p-2">{t('Produit', 'Product')}</th>
                <th className="p-2">{t('Conditionnement', 'Verpakking')}</th>
                <th className="p-2 text-right">{t('Quantité', 'Aantal')}</th>
              </tr>
            </thead>
            <tbody>
              {plateaux > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="p-2">Adala Cola</td>
                  <td className="p-2">{t('Plateau de 24', 'Tray van 24')}</td>
                  <td className="p-2 text-right text-lg font-bold">{plateaux}</td>
                </tr>
              )}
              {palettes > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="p-2">Adala Cola</td>
                  <td className="p-2">{t('Palette', 'Pallet')}</td>
                  <td className="p-2 text-right text-lg font-bold">{palettes}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-400">
            {t('Commercial(e)', 'Vertegenwoordiger')} : {commercial}
          </p>
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('Bon pour commande — signature du client', 'Voor akkoord — handtekening klant')}
          </p>
          <input
            value={signataire}
            onChange={(e) => setSignataire(e.target.value)}
            placeholder={t('Nom de la personne qui signe', 'Naam van wie tekent')}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
          />
          <canvas
            ref={canvas}
            onPointerDown={debut}
            onPointerMove={trace}
            onPointerUp={() => (dessin.current.actif = false)}
            onPointerCancel={() => (dessin.current.actif = false)}
            className="h-48 w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
          />
          <button type="button" onClick={effacer} className="text-sm font-semibold text-slate-500">
            ↺ {t('Effacer la signature', 'Handtekening wissen')}
          </button>
          {erreur && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onFermer} className="min-h-14 rounded-xl border-2 border-slate-300 font-semibold text-slate-700">
              {t('Annuler', 'Annuleren')}
            </button>
            <button type="button" onClick={valider} className="min-h-14 rounded-xl bg-[#b83a2c] text-lg font-bold text-white">
              ✍ {t('Valider la signature', 'Handtekening bevestigen')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Numéro belge « 0470 12 34 56 » → « 32470123456 » pour wa.me. */
function numeroWhatsapp(tel: string) {
  let n = tel.replace(/\D/g, '')
  if (n.startsWith('00')) n = n.slice(2)
  else if (n.startsWith('0')) n = `32${n.slice(1)}`
  return n
}

/**
 * Client absent : le bon à signer part chez lui par WhatsApp, e-mail ou le
 * partage de la tablette. Il le renvoie signé à order@ ou par WhatsApp.
 */
export function EnvoiBonClient({
  visiteId,
  commerce,
  telephone,
  email,
  onEnvoye,
  onFermer,
}: {
  visiteId: string
  commerce: string
  telephone: string
  email: string
  onEnvoye: (message: string) => void
  onFermer: () => void
}) {
  const { t } = useLangue()
  const [bon, setBon] = useState<{ numero: string; url: string | null } | null>(null)
  const [fichier, setFichier] = useState<File | null>(null)
  const [adresse, setAdresse] = useState(email)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    appelServeur<{ numero: string; url: string | null }>('/api/bon-client', { id: visiteId, action: 'preparer' }).then(
      async (r) => {
        if (r.erreur || !r.reponse) {
          setErreur(r.erreur ?? t('Bon non préparé.', 'Bestelbon niet klaar.'))
          return
        }
        setBon(r.reponse)
        // Le PDF est chargé d'avance : le partage doit partir au toucher.
        if (r.reponse.url && 'canShare' in navigator) {
          const blob = await fetch(r.reponse.url).then((x) => (x.ok ? x.blob() : null)).catch(() => null)
          const f = blob && new File([blob], `${r.reponse.numero}.pdf`, { type: 'application/pdf' })
          if (f && navigator.canShare({ files: [f] })) setFichier(f)
        }
      }
    )
  }, [visiteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const message = bon
    ? t(
        `Bonjour, voici le bon de commande Adala Cola ${bon.numero} pour ${commerce}. Merci de le signer et de nous renvoyer une copie signée ici ou à order@adalacola.com.`,
        `Goeiedag, hierbij de bestelbon van Adala Cola ${bon.numero} voor ${commerce}. Gelieve hem te ondertekenen en een getekende kopie terug te sturen hier of naar order@adalacola.com.`
      )
    : ''

  async function noter(canal: 'whatsapp' | 'email' | 'partage') {
    setEnvoi(true)
    setErreur(null)
    const r = await appelServeur('/api/bon-client', { id: visiteId, canal, email: adresse })
    setEnvoi(false)
    if (r.erreur) setErreur(r.erreur)
    return !r.erreur
  }

  async function whatsapp() {
    if (!bon) return
    if (!(await noter('whatsapp'))) return
    const numero = numeroWhatsapp(telephone)
    window.location.href = `https://wa.me/${numero}?text=${encodeURIComponent(`${message}\n${bon.url ?? ''}`)}`
    onEnvoye(t('Bon envoyé au client par WhatsApp. En attente de la copie signée.', 'Bestelbon via WhatsApp naar de klant. Wachten op de getekende kopie.'))
  }

  async function mail() {
    if (!(await noter('email'))) return
    onEnvoye(t(`Bon envoyé par e-mail à ${adresse} (copie à order@).`, `Bestelbon per e-mail naar ${adresse} (kopie naar order@).`))
  }

  async function partager() {
    if (!fichier) return
    try {
      await navigator.share({ files: [fichier], text: message })
    } catch {
      return
    }
    if (await noter('partage'))
      onEnvoye(t('Bon partagé avec le client. En attente de la copie signée.', 'Bestelbon gedeeld met de klant. Wachten op de getekende kopie.'))
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-lg space-y-3 rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <p className="text-lg font-bold text-slate-900">{t('Envoyer le bon au client', 'Bestelbon naar de klant sturen')}</p>
        <p className="text-sm text-slate-500">
          {t(
            'Le client le signe et renvoie une copie signée par WhatsApp ou à order@adalacola.com.',
            'De klant tekent en stuurt een getekende kopie terug via WhatsApp of naar order@adalacola.com.'
          )}
        </p>
        {!bon && !erreur && <p className="py-4 text-center text-slate-400">{t('Préparation du bon…', 'Bestelbon wordt klaargemaakt…')}</p>}
        {bon && (
          <>
            <p className="text-sm text-slate-700">
              N° <strong>{bon.numero}</strong>
              {bon.url && (
                <>
                  {' · '}
                  <a href={bon.url} target="_blank" rel="noreferrer" className="font-semibold text-[#b83a2c] underline">
                    {t('Voir le PDF', 'PDF bekijken')}
                  </a>
                </>
              )}
            </p>
            <button
              type="button"
              disabled={envoi}
              onClick={whatsapp}
              className="min-h-14 w-full rounded-xl bg-[#25D366] text-lg font-bold text-white disabled:opacity-50"
            >
              WhatsApp{telephone ? ` · ${telephone}` : ''}
            </button>
            <div className="flex gap-2">
              <input
                type="email"
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder={t('E-mail du client', 'E-mail van de klant')}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-base"
              />
              <button
                type="button"
                disabled={envoi || !adresse.trim()}
                onClick={mail}
                className="min-h-14 shrink-0 rounded-xl bg-slate-800 px-4 font-bold text-white disabled:opacity-50"
              >
                ✉ {t('E-mail', 'E-mail')}
              </button>
            </div>
            {fichier && (
              <button
                type="button"
                disabled={envoi}
                onClick={partager}
                className="min-h-12 w-full rounded-xl border-2 border-slate-300 font-semibold text-slate-700 disabled:opacity-50"
              >
                📤 {t('Partager le PDF (autre appli)', 'PDF delen (andere app)')}
              </button>
            )}
          </>
        )}
        {erreur && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
        <button type="button" onClick={onFermer} className="min-h-12 w-full font-semibold text-slate-500">
          {t('Fermer', 'Sluiten')}
        </button>
      </div>
    </div>
  )
}
