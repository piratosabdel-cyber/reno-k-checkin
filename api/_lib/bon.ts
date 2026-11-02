import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { envoyerMail } from './recap.js'
import { echapper, URL_APP } from './serveur.js'
import { LABEL_TYPE, dateBxl, heureBxl } from './textes.js'

/** Société qui vend en Belgique (mentions légales du site adalacola.com). */
const ADALA = {
  nom: 'Adala Drinks Europe SRL',
  lignes: [
    'Z.5 Mollem 44',
    '1730 Asse, Belgique',
    process.env.ADALA_NUMERO_ENTREPRISE ? `N° d'entreprise : ${process.env.ADALA_NUMERO_ENTREPRISE}` : 'RPM Bruxelles (néerlandophone)',
    'order@adalacola.com',
  ],
}

const ROUGE = rgb(0.72, 0.23, 0.17)
const GRIS = rgb(0.42, 0.45, 0.5)
const NOIR = rgb(0.07, 0.09, 0.15)

interface VisiteBon {
  id: string
  client_uuid: string
  commercial_id: string
  plateaux: number | null
  palettes: number | null
  remarques: string[] | null
  commentaire: string | null
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
  adresse_livraison: string | null
  adresse_facturation: string | null
  numero_entreprise: string | null
  type_commerce: string | null
  bon_signature_path: string | null
  bon_signataire: string | null
  bon_signe_le: string | null
  bon_envoye_le: string | null
  bon_version: number
  bon_client_envoye_le: string | null
  bon_client_code: string | null
  commerce: { nom: string; adresse: string | null; commune: string | null; type: string } | null
  commercial: { full_name: string } | null
}

const SELECT_BON =
  'id, client_uuid, commercial_id, plateaux, palettes, remarques, commentaire, contact_nom, contact_fonction, contact_telephone, contact_email, adresse_livraison, adresse_facturation, numero_entreprise, type_commerce, bon_signature_path, bon_signataire, bon_signe_le, bon_envoye_le, bon_version, bon_client_envoye_le, bon_client_code, commerce:commerces(nom, adresse, commune, type), commercial:profiles(full_name)'

/**
 * BC-20261102-3F9A : date de signature + début de l'identifiant de la visite.
 * Un bon modifié après signature prend un suffixe : BC-20261102-3F9A-V2.
 */
export function numeroBon(v: { client_uuid: string; bon_signe_le: string | null; bon_version?: number }) {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' })
    .format(new Date(v.bon_signe_le ?? Date.now()))
    .replace(/-/g, '')
  const version = (v.bon_version ?? 1) > 1 ? `-V${v.bon_version}` : ''
  return `BC-${jour}-${v.client_uuid.slice(0, 4).toUpperCase()}${version}`
}

function quantitesTexte(v: VisiteBon) {
  return [v.plateaux ? `${v.plateaux} plateau(x) de 24` : '', v.palettes ? `${v.palettes} palette(s)` : '']
    .filter(Boolean)
    .join(' + ')
}

function logoAdala() {
  return fetch(`${URL_APP}/adala/icon-192.png`)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b ? new Uint8Array(b) : null))
    .catch(() => null)
}

async function chargerVisite(db: SupabaseClient, filtre: { id?: string; client_uuid?: string }, commercialId: string | null) {
  let requete = db.from('visites').select(SELECT_BON)
  requete = filtre.id ? requete.eq('id', filtre.id) : requete.eq('client_uuid', filtre.client_uuid!)
  if (commercialId) requete = requete.eq('commercial_id', commercialId)
  const { data, error } = await requete.maybeSingle()
  if (error) throw new Error(error.message)
  const v = data as unknown as VisiteBon | null
  if (!v) throw new Error('Visite introuvable.')
  return v
}

/** Les polices standard du PDF ne connaissent que l'alphabet latin (WinAnsi). */
function propre(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—€]/g, '')
}

function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const lignes: string[] = []
  for (const paragraphe of propre(texte).split(/\n/)) {
    let ligne = ''
    for (const mot of paragraphe.split(/\s+/)) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (police.widthOfTextAtSize(essai, taille) > largeur && ligne) {
        lignes.push(ligne)
        ligne = mot
      } else ligne = essai
    }
    lignes.push(ligne)
  }
  return lignes
}

export async function genererPdf(v: VisiteBon, signature: Uint8Array | null, logo: Uint8Array | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Bon de commande ${numeroBon(v)}`)
  pdf.setAuthor(ADALA.nom)
  const page: PDFPage = pdf.addPage([595.28, 841.89])
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold)
  const M = 48
  const L = 595.28 - 2 * M
  let y = 841.89 - M

  const texte = (s: string, x: number, yy: number, taille = 10, police = normal, couleur = NOIR) =>
    page.drawText(propre(s), { x, y: yy, size: taille, font: police, color: couleur })
  const bloc = (lignes: string[], x: number, yy: number, largeur: number, taille = 10) => {
    for (const l of lignes.flatMap((s) => couper(s, normal, taille, largeur))) {
      texte(l, x, yy, taille)
      yy -= taille + 4
    }
    return yy
  }

  // En-tête
  if (logo) {
    const img = await pdf.embedPng(logo)
    page.drawImage(img, { x: M, y: y - 52, width: 52, height: 52 })
  }
  texte('BON DE COMMANDE', M + 66, y - 20, 20, gras, ROUGE)
  texte('BESTELBON', M + 66, y - 38, 11, gras, GRIS)
  if ((v.bon_version ?? 1) > 1) {
    texte('Bon modifié : remplace la version précédente / Gewijzigde bon', M + 66, y - 52, 9, gras, ROUGE)
  }
  texte(`N° ${numeroBon(v)}`, M + L - gras.widthOfTextAtSize(`N° ${numeroBon(v)}`, 11), y - 20, 11, gras)
  const quand = v.bon_signe_le ? `${dateBxl(v.bon_signe_le)} ${heureBxl(v.bon_signe_le)}` : ''
  texte(quand, M + L - normal.widthOfTextAtSize(quand, 10), y - 36, 10, normal, GRIS)
  y -= 76
  page.drawLine({ start: { x: M, y }, end: { x: M + L, y }, thickness: 1.5, color: ROUGE })
  y -= 22

  // Fournisseur / client
  const col = L / 2 - 10
  texte('FOURNISSEUR / LEVERANCIER', M, y, 9, gras, GRIS)
  texte('CLIENT / KLANT', M + L / 2 + 10, y, 9, gras, GRIS)
  y -= 16
  texte(ADALA.nom, M, y, 11, gras)
  const c = v.commerce
  texte(c?.nom ?? '—', M + L / 2 + 10, y, 11, gras)
  y -= 15
  const yAdala = bloc(ADALA.lignes, M, y, col)
  const adresseCommerce = [c?.adresse, c?.commune && !(c?.adresse ?? '').toLowerCase().includes(c.commune.toLowerCase()) ? c.commune : null]
    .filter(Boolean)
    .join(', ')
  const yClient = bloc(
    [
      adresseCommerce,
      v.numero_entreprise ? `N° d'entreprise : ${v.numero_entreprise}` : '',
      [v.contact_nom, v.contact_fonction].filter(Boolean).join(' - '),
      [v.contact_telephone, v.contact_email].filter(Boolean).join(' - '),
    ].filter(Boolean),
    M + L / 2 + 10,
    y,
    col
  )
  y = Math.min(yAdala, yClient) - 10

  // Adresses
  const facturation = v.adresse_facturation || adresseCommerce
  const livraison = v.adresse_livraison || facturation
  texte('FACTURATION / FACTURATIE', M, y, 9, gras, GRIS)
  texte('LIVRAISON / LEVERING', M + L / 2 + 10, y, 9, gras, GRIS)
  y -= 15
  y = Math.min(bloc([facturation || '—'], M, y, col), bloc([livraison || '—'], M + L / 2 + 10, y, col)) - 16

  // Lignes de commande
  const cols = [M, M + 250, M + 400]
  page.drawRectangle({ x: M, y: y - 6, width: L, height: 22, color: rgb(0.95, 0.96, 0.97) })
  texte('Produit / Product', cols[0] + 8, y, 10, gras)
  texte('Conditionnement / Verpakking', cols[1] - 70, y, 10, gras)
  texte('Quantité / Aantal', M + L - gras.widthOfTextAtSize('Quantité / Aantal', 10) - 8, y, 10, gras)
  y -= 26
  const lignes: [string, number][] = []
  if (v.plateaux) lignes.push(['Plateau de 24 / Tray van 24', v.plateaux])
  if (v.palettes) lignes.push(['Palette / Pallet', v.palettes])
  for (const [unite, n] of lignes) {
    texte('Adala Cola', cols[0] + 8, y, 11)
    texte(unite, cols[1] - 70, y, 11)
    texte(String(n), cols[2] + 60, y, 12, gras)
    y -= 8
    page.drawLine({ start: { x: M, y }, end: { x: M + L, y }, thickness: 0.5, color: rgb(0.85, 0.86, 0.88) })
    y -= 18
  }
  y -= 6

  const notes = [...(v.remarques ?? []), v.commentaire].filter(Boolean).join(' - ')
  if (notes) {
    texte('REMARQUES / OPMERKINGEN', M, y, 9, gras, GRIS)
    y = bloc([notes], M, y - 15, L) - 8
  }
  texte(
    `Commercial(e) : ${v.commercial?.full_name ?? '—'}  ·  Type : ${LABEL_TYPE[v.type_commerce ?? c?.type ?? 'autre'] ?? ''}`,
    M,
    y,
    9,
    normal,
    GRIS
  )
  y -= 34

  // Signature
  texte('BON POUR COMMANDE / VOOR AKKOORD', M, y, 9, gras, GRIS)
  y -= 8
  page.drawRectangle({ x: M, y: y - 110, width: 260, height: 110, borderColor: rgb(0.8, 0.82, 0.85), borderWidth: 1 })
  if (signature) {
    const img = await pdf.embedPng(signature)
    const echelle = Math.min(250 / img.width, 100 / img.height)
    page.drawImage(img, { x: M + 5, y: y - 105, width: img.width * echelle, height: img.height * echelle })
  }
  if (signature || v.bon_signe_le) {
    texte(`Signé par / Getekend door : ${v.bon_signataire ?? '—'}`, M + 280, y - 30, 10)
    texte(`Le / Op : ${quand}`, M + 280, y - 46, 10)
  } else {
    // Bon envoyé au client : il le signe et renvoie une copie.
    texte('Nom / Naam : ................................', M + 280, y - 20, 10)
    texte('Date / Datum : ..............................', M + 280, y - 40, 10)
    bloc(
      [
        'Merci de signer ce bon et de renvoyer une copie signée par WhatsApp ou à order@adalacola.com.',
        'Gelieve deze bon te ondertekenen en een getekende kopie terug te sturen via WhatsApp of naar order@adalacola.com.',
      ],
      M + 280,
      y - 62,
      L - 280,
      8
    )
  }

  texte(
    'Document établi avec l’app Adala Visites. Prix et conditions selon le tarif Adala en vigueur.',
    M,
    M - 10,
    8,
    normal,
    GRIS
  )
  return pdf.save()
}

/**
 * Fabrique le PDF du bon signé, le range dans le stockage et l'envoie à
 * order@adalacola.com. Ne renvoie pas un bon déjà parti.
 */
export async function envoyerBon(db: SupabaseClient, filtre: { id?: string; client_uuid?: string }, commercialId: string | null) {
  const v = await chargerVisite(db, filtre, commercialId)
  if (!v.bon_signe_le) throw new Error("Ce bon de commande n'est pas signé.")
  if (v.bon_envoye_le) return { numero: numeroBon(v), dejaEnvoye: true }

  try {
    let signature: Uint8Array | null = null
    if (v.bon_signature_path) {
      const { data: fichier } = await db.storage.from('visites-photos').download(v.bon_signature_path)
      if (fichier) signature = new Uint8Array(await fichier.arrayBuffer())
    }
    const pdf = await genererPdf(v, signature, await logoAdala())
    const numero = numeroBon(v)
    // Chaque version garde son PDF : le bon d'origine reste consultable.
    const chemin = `${v.commercial_id}/${v.client_uuid}-bon${v.bon_version > 1 ? `-v${v.bon_version}` : ''}.pdf`
    await db.storage.from('visites-photos').upload(chemin, pdf, { contentType: 'application/pdf', upsert: true })

    const quantites = quantitesTexte(v)
    await envoyerMail(
      `${v.bon_version > 1 ? 'Bon de commande MODIFIÉ' : 'Bon de commande'} ${numero} — ${v.commerce?.nom ?? ''} — ${quantites}`,
      `<p>${v.bon_version > 1 ? 'Bon de commande <b>modifié</b> (remplace la version précédente), signé' : 'Nouveau bon de commande signé'} par <b>${echapper(v.bon_signataire)}</b> pour <b>${echapper(v.commerce?.nom)}</b>.</p>
<p>${echapper(quantites)}<br>Commercial(e) : ${echapper(v.commercial?.full_name)}<br>Signé le ${dateBxl(v.bon_signe_le)} à ${heureBxl(v.bon_signe_le)}</p>
<p>Le bon signé est en pièce jointe. Fiche dans l'app : <a href="${URL_APP}/admin/visites/${v.id}">${URL_APP}/admin/visites/${v.id}</a></p>`,
      [{ filename: `${numero}.pdf`, content: Buffer.from(pdf), contentType: 'application/pdf' }]
    )
    await db
      .from('visites')
      .update({ bon_pdf_path: chemin, bon_envoye_le: new Date().toISOString(), bon_erreur: null })
      .eq('id', v.id)
    return { numero, dejaEnvoye: false }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.from('visites').update({ bon_erreur: message.slice(0, 500) }).eq('id', v.id)
    throw e
  }
}

/**
 * Bon pas encore signé (quantités modifiées, client absent) : PDF à signer,
 * rangé dans le stockage, avec un lien court (visites.adalacola.com/b/…)
 * qui tient sur une ligne dans WhatsApp.
 */
export async function preparerBonClient(db: SupabaseClient, id: string, commercialId: string | null) {
  const v = await chargerVisite(db, { id }, commercialId)
  if (v.bon_signe_le) throw new Error('Ce bon est déjà signé.')
  if (!(v.plateaux || v.palettes)) throw new Error('Aucune quantité commandée.')
  const pdf = await genererPdf(v, null, await logoAdala())
  const numero = numeroBon(v)
  const chemin = `${v.commercial_id}/${v.client_uuid}-bon-a-signer-v${v.bon_version}.pdf`
  const { error } = await db.storage.from('visites-photos').upload(chemin, pdf, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(error.message)
  if (!v.bon_client_code) {
    v.bon_client_code = randomBytes(6).toString('base64url')
    await db.from('visites').update({ bon_client_code: v.bon_client_code }).eq('id', v.id)
  }
  return { v, pdf, numero, chemin, url: `${URL_APP}/b/${v.bon_client_code}` }
}

/**
 * Le bon à signer est parti chez le client. Par e-mail, le serveur l'envoie
 * lui-même (copie à order@) ; par WhatsApp, la tablette l'a partagé et
 * order@ reçoit le PDF pour suivre la signature.
 */
export async function envoyerBonClient(
  db: SupabaseClient,
  id: string,
  commercialId: string | null,
  canal: 'email' | 'whatsapp' | 'partage',
  email: string | null
) {
  const { v, pdf, numero, chemin, url } = await preparerBonClient(db, id, commercialId)
  const piece = [{ filename: `${numero}.pdf`, content: Buffer.from(pdf), contentType: 'application/pdf' }]
  const quantites = quantitesTexte(v)
  const modifie = v.bon_version > 1
  if (canal === 'email') {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse e-mail du client invalide.')
    await envoyerMail(
      `Adala Cola — bon de commande ${modifie ? 'modifié ' : ''}${numero} à signer / te ondertekenen`,
      `<p>Bonjour,</p>
<p>Voici le bon de commande Adala Cola${modifie ? ' <b>modifié</b>' : ''} pour <b>${echapper(v.commerce?.nom)}</b> : ${echapper(quantites)}.</p>
<p>Merci de le signer et de nous renvoyer une copie signée par WhatsApp ou en réponse à cet e-mail (order@adalacola.com).</p>
<hr>
<p>Goeiedag,</p>
<p>Hierbij de${modifie ? ' <b>gewijzigde</b>' : ''} bestelbon van Adala Cola voor <b>${echapper(v.commerce?.nom)}</b>. Gelieve hem te ondertekenen en een getekende kopie terug te sturen via WhatsApp of als antwoord op deze e-mail (order@adalacola.com).</p>
<p>Adala Drinks Europe — ${echapper(v.commercial?.full_name)}</p>`,
      piece,
      { a: email, copie: 'order@adalacola.com', repondreA: 'order@adalacola.com' }
    )
  } else if (!v.bon_client_envoye_le) {
    await envoyerMail(
      `Bon de commande ${modifie ? 'MODIFIÉ ' : ''}${numero} — ${v.commerce?.nom ?? ''} — à signer par le client`,
      `<p>${echapper(v.commercial?.full_name)} a envoyé le bon ${modifie ? '<b>modifié</b> ' : ''}${numero} au client <b>${echapper(v.commerce?.nom)}</b> par ${canal === 'whatsapp' ? 'WhatsApp' : 'partage depuis la tablette'} : ${echapper(quantites)}.</p>
<p>Le client doit le renvoyer signé (WhatsApp ou order@). Bon à signer en pièce jointe. Fiche : <a href="${URL_APP}/admin/visites/${v.id}">${URL_APP}/admin/visites/${v.id}</a></p>`,
      piece
    )
  }
  await db
    .from('visites')
    .update({ bon_client_envoye_le: new Date().toISOString(), bon_client_canal: canal, bon_client_pdf_path: chemin })
    .eq('id', v.id)
  return { numero, url }
}

/** Filet de sécurité (tâche du soir) : envoie les bons signés restés en route. */
export async function envoyerBonsEnAttente(db: SupabaseClient) {
  const { data } = await db
    .from('visites')
    .select('id')
    .not('bon_signe_le', 'is', null)
    .is('bon_envoye_le', null)
    .limit(20)
  let envoyes = 0
  let erreurs = 0
  for (const { id } of data ?? []) {
    try {
      await envoyerBon(db, { id }, null)
      envoyes++
    } catch {
      erreurs++
    }
  }
  return { envoyes, erreurs }
}
