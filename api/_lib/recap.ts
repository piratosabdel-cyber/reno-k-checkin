import type { SupabaseClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { echapper, env, URL_APP } from './serveur.js'
import { LABEL_RESULTAT, LABEL_TYPE, dateBxl, heureBxl, journeeBxl } from './textes.js'

interface LigneRecap {
  id: string
  resultat: string
  plateaux: number | null
  palettes: number | null
  heure_ouverture: string | null
  heure_appareil: string
  heure_serveur: string
  date_relance: string | null
  a_completer: boolean
  synchro_differee: boolean
  remarques: string[] | null
  commentaire: string | null
  drive_dossier_id: string | null
  commerce: { nom: string; commune: string | null; type: string } | null
  commercial: { full_name: string } | null
  alertes: { detail: string }[]
}

/** Récapitulatif de la journée envoyé à order@adalacola.com. */
export async function envoyerRecap(db: SupabaseClient): Promise<{ visites: number }> {
  const [debut, fin] = journeeBxl()
  const { data } = await db
    .from('visites')
    .select(
      'id, resultat, plateaux, palettes, heure_ouverture, heure_appareil, heure_serveur, date_relance, a_completer, synchro_differee, remarques, commentaire, drive_dossier_id, commerce:commerces(nom, commune, type), commercial:profiles(full_name), alertes:visites_alertes(detail)'
    )
    .gte('heure_appareil', debut)
    .lt('heure_appareil', fin)
    .order('heure_appareil')
  const visites = (data as unknown as LigneRecap[]) ?? []

  const { count: nouveaux } = await db
    .from('commerces')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', debut)
    .lt('created_at', fin)

  const precommandes = visites.filter((v) => v.resultat === 'precommande')
  const plateaux = visites.reduce((s, v) => s + (v.plateaux ?? 0), 0)
  const palettes = visites.reduce((s, v) => s + (v.palettes ?? 0), 0)
  const avecAlerte = visites.filter((v) => v.alertes.length > 0)
  const jour = dateBxl(debut)

  const td = 'style="border:1px solid #e5e7eb;padding:6px 8px;font-size:13px;vertical-align:top"'
  const lignes = visites
    .map(
      (v, i) => `<tr>
<td ${td}>${i + 1}</td>
<td ${td}>${heureBxl(v.heure_appareil)}</td>
<td ${td}><b>${echapper(v.commerce?.nom)}</b><br><span style="color:#6b7280">${echapper(v.commerce?.commune ?? '')} · ${echapper(LABEL_TYPE[v.commerce?.type ?? 'autre'])}</span></td>
<td ${td}>${echapper(LABEL_RESULTAT[v.resultat])}${v.a_completer ? '<br><i>à compléter</i>' : ''}</td>
<td ${td}>${v.resultat === 'precommande' ? `${v.plateaux ?? 0} plat. · ${v.palettes ?? 0} pal.` : ''}</td>
<td ${td}>${echapper([...(v.remarques ?? []), v.commentaire].filter(Boolean).join(' · '))}</td>
<td style="border:1px solid #e5e7eb;padding:6px 8px;font-size:13px;vertical-align:top;color:#b45309">${v.alertes.map((a) => '⚠ ' + echapper(a.detail)).join('<br>')}${v.synchro_differee ? '<br><span style="color:#6b7280">envoyée en différé</span>' : ''}</td>
<td ${td}>${v.drive_dossier_id ? `<a href="https://drive.google.com/drive/folders/${v.drive_dossier_id}">Drive</a> · ` : ''}<a href="${URL_APP}/admin/visites/${v.id}">App</a></td>
</tr>`
    )
    .join('')

  const tuile = (n: string | number, l: string) =>
    `<td style="padding:10px 14px;background:#f8fafc;border-radius:8px;text-align:center"><div style="font-size:22px;font-weight:700">${n}</div><div style="font-size:12px;color:#6b7280">${l}</div></td>`

  const premiere = visites[0]
  const derniere = visites[visites.length - 1]
  const html = `<div style="font-family:Arial,sans-serif;color:#111827;max-width:900px">
<h2 style="color:#b83a2c;margin:0 0 4px">Adala — visites du ${jour}</h2>
<p style="color:#6b7280;margin:0 0 16px">${
    visites.length
      ? `De ${heureBxl(premiere.heure_ouverture ?? premiere.heure_appareil)} à ${heureBxl(derniere.heure_appareil)} · ${echapper(
          [...new Set(visites.map((v) => v.commercial?.full_name).filter(Boolean))].join(', ')
        )}`
      : 'Aucune visite aujourd’hui.'
  }</p>
<table cellspacing="6"><tr>${tuile(visites.length, 'visites')}${tuile(nouveaux ?? 0, 'nouveaux commerces')}${tuile(precommandes.length, 'précommandes')}${tuile(plateaux, 'plateaux')}${tuile(palettes, 'palettes')}${tuile(avecAlerte.length, 'avec alerte')}</tr></table>
${
  visites.length
    ? `<table style="border-collapse:collapse;margin-top:16px;width:100%"><tr style="background:#f3f4f6">
<th ${td}>#</th><th ${td}>Heure</th><th ${td}>Commerce</th><th ${td}>Résultat</th><th ${td}>Quantités</th><th ${td}>Remarques</th><th ${td}>Alertes</th><th ${td}>Dossier</th></tr>${lignes}</table>`
    : ''
}
<p style="margin-top:16px"><a href="${URL_APP}/admin/visites?vue=carte">Voir la carte de la journée</a></p>
</div>`

  await envoyerMail(
    `Visites du ${jour} — ${visites.length} visite(s), ${precommandes.length} précommande(s)${
      avecAlerte.length ? `, ${avecAlerte.length} alerte(s)` : ''
    }`,
    html
  )
  return { visites: visites.length }
}

export async function envoyerMail(
  sujet: string,
  html: string,
  pieces: { filename: string; content: Buffer; contentType: string }[] = []
) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp-auth.mailprotect.be',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
  })
  await transport.sendMail({
    from: `"Adala Visites" <${env('SMTP_USER')}>`,
    to: process.env.RECAP_DESTINATAIRE ?? 'order@adalacola.com',
    subject: sujet,
    html,
    attachments: pieces,
  })
}

interface LigneListe {
  id: string
  resultat: string
  plateaux: number | null
  palettes: number | null
  heure_serveur: string
  date_relance: string | null
  remarques: string[] | null
  commentaire: string | null
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
  reseau_social: string | null
  adresse_livraison: string | null
  adresse_facturation: string | null
  numero_entreprise: string | null
  numero_tva: string | null
  type_commerce: string | null
  drive_dossier_id: string | null
  commerce: { nom: string; adresse: string | null; commune: string | null; type: string } | null
  commercial: { full_name: string } | null
}

/**
 * Liste de visites choisie (sélection ou filtre), envoyée à order@adalacola.com.
 * `commercialId` : limite aux visites de cette commerciale.
 */
export async function envoyerListe(
  db: SupabaseClient,
  ids: string[],
  titre: string,
  commercialId: string | null
): Promise<{ visites: number }> {
  let requete = db
    .from('visites')
    .select(
      'id, resultat, plateaux, palettes, heure_serveur, date_relance, remarques, commentaire, contact_nom, contact_fonction, contact_telephone, contact_email, reseau_social, adresse_livraison, adresse_facturation, numero_tva, numero_entreprise, type_commerce, drive_dossier_id, commerce:commerces(nom, adresse, commune, type), commercial:profiles(full_name)'
    )
    .in('id', ids)
  if (commercialId) requete = requete.eq('commercial_id', commercialId)
  const { data, error } = await requete.order('heure_serveur', { ascending: false })
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Aucune visite à envoyer.')
  const visites = (data as unknown as LigneListe[]) ?? []

  const td = 'style="border:1px solid #e5e7eb;padding:6px 8px;font-size:13px;vertical-align:top"'
  const lignes = visites
    .map(
      (v, i) => `<tr>
<td ${td}>${i + 1}</td>
<td ${td}>${dateBxl(v.heure_serveur)}<br><span style="color:#6b7280">${heureBxl(v.heure_serveur)}</span></td>
<td ${td}><b>${echapper(v.commerce?.nom)}</b><br><span style="color:#6b7280">${echapper(
        [v.commerce?.adresse, v.commerce?.commune].filter(Boolean).join(', ')
      )}<br>${echapper(LABEL_TYPE[v.type_commerce ?? v.commerce?.type ?? 'autre'])}</span></td>
<td ${td}>${echapper([v.contact_nom, v.contact_fonction].filter(Boolean).join(' · '))}${
        v.contact_telephone ? `<br>${echapper(v.contact_telephone)}` : ''
      }${v.contact_email ? `<br>${echapper(v.contact_email)}` : ''}${v.reseau_social ? `<br>${echapper(v.reseau_social)}` : ''}${
        v.adresse_livraison ? `<br><b>Livraison :</b> ${echapper(v.adresse_livraison)}` : ''
      }${v.adresse_facturation ? `<br><b>Facturation :</b> ${echapper(v.adresse_facturation)}` : ''}${
        v.numero_entreprise ? `<br><b>N° d'entreprise :</b> ${echapper(v.numero_entreprise)}` : ''
      }${v.numero_tva ? `<br><b>TVA :</b> ${echapper(v.numero_tva)}` : ''
      }</td>
<td ${td}>${echapper(LABEL_RESULTAT[v.resultat])}${
        v.resultat === 'precommande' ? `<br><b>${v.plateaux ?? 0} plat. de 24 · ${v.palettes ?? 0} pal.</b>` : ''
      }</td>
<td ${td}>${v.date_relance ? dateBxl(`${v.date_relance}T12:00:00Z`) : ''}</td>
<td ${td}>${echapper([...(v.remarques ?? []), v.commentaire].filter(Boolean).join(' · '))}</td>
<td ${td}>${v.drive_dossier_id ? `<a href="https://drive.google.com/drive/folders/${v.drive_dossier_id}">Drive</a> · ` : ''}<a href="${URL_APP}/admin/visites/${v.id}">App</a></td>
</tr>`
    )
    .join('')

  const plateaux = visites.reduce((s, v) => s + (v.plateaux ?? 0), 0)
  const palettes = visites.reduce((s, v) => s + (v.palettes ?? 0), 0)
  const html = `<div style="font-family:Arial,sans-serif;color:#111827;max-width:1000px">
<h2 style="color:#b83a2c;margin:0 0 4px">${echapper(titre)}</h2>
<p style="color:#6b7280;margin:0 0 16px">${visites.length} visite(s)${
    plateaux || palettes ? ` · total précommandé : ${plateaux} plateau(x) de 24, ${palettes} palette(s)` : ''
  }</p>
<table style="border-collapse:collapse;width:100%"><tr style="background:#f3f4f6">
<th ${td}>#</th><th ${td}>Date</th><th ${td}>Commerce</th><th ${td}>Contact client</th><th ${td}>Résultat</th><th ${td}>Relance</th><th ${td}>Remarques</th><th ${td}>Dossier</th></tr>${lignes}</table>
</div>`

  await envoyerMail(`${titre} — ${visites.length} visite(s)`, html)
  return { visites: visites.length }
}
