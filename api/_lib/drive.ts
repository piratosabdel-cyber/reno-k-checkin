import type { SupabaseClient } from '@supabase/supabase-js'
import { echapper, env, URL_APP } from './serveur'
import { LABEL_RESULTAT, LABEL_STATUT, LABEL_TYPE, dateBxl, heureBxl, horodatageDossier } from './textes'

// Archivage des visites dans le Google Drive de order@adalacola.com :
//   Adala — Commerces / <Type> / <Commerce — Commune> / Fiche commerce
//                                                    / Visites / <date heure — résultat> / Rapport + photo.jpg
// L'app n'a accès qu'aux fichiers qu'elle a créés elle-même (droit « drive.file »).

const DRIVE = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const DOSSIER = 'application/vnd.google-apps.folder'
const GDOC = 'application/vnd.google-apps.document'

export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file'

async function lireReglage(db: SupabaseClient, cle: string): Promise<string | null> {
  const { data } = await db.from('integrations').select('valeur').eq('cle', cle).maybeSingle()
  return (data?.valeur as string | undefined) ?? null
}

export async function ecrireReglage(db: SupabaseClient, cle: string, valeur: string) {
  await db.from('integrations').upsert({ cle, valeur, updated_at: new Date().toISOString() })
}

export async function driveConfigure(db: SupabaseClient) {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && (await lireReglage(db, 'google_refresh_token')))
}

class Drive {
  private token: string
  constructor(token: string) {
    this.token = token
  }

  static async connecter(db: SupabaseClient): Promise<Drive> {
    const refresh = await lireReglage(db, 'google_refresh_token')
    if (!refresh) throw new Error('Google Drive pas encore connecté')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'),
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
    })
    const data = (await res.json()) as { access_token?: string; error?: string }
    if (!data.access_token) throw new Error(`Connexion Google refusée (${data.error ?? res.status}) — reconnecter Drive`)
    return new Drive(data.access_token)
  }

  private async appel<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${this.token}`, ...init.headers } })
    if (!res.ok) throw new Error(`Drive ${res.status} : ${(await res.text()).slice(0, 200)}`)
    return (await res.json()) as T
  }

  async dossier(nom: string, parent: string | null): Promise<string> {
    const r = await this.appel<{ id: string }>(`${DRIVE}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom, mimeType: DOSSIER, ...(parent ? { parents: [parent] } : {}) }),
    })
    return r.id
  }

  async renommer(id: string, nom: string) {
    await this.appel(`${DRIVE}/${id}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom }),
    })
  }

  /** Envoie un fichier. `versGoogleDoc` : le HTML est converti en document Google lisible et imprimable. */
  async envoyer(nom: string, parent: string, contenu: Buffer | string, mime: string, versGoogleDoc = false): Promise<string> {
    const limite = `adala${Date.now()}`
    const meta = { name: nom, parents: [parent], ...(versGoogleDoc ? { mimeType: GDOC } : {}) }
    const corps = Buffer.concat([
      Buffer.from(
        `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${limite}\r\nContent-Type: ${mime}\r\n\r\n`
      ),
      typeof contenu === 'string' ? Buffer.from(contenu, 'utf8') : contenu,
      Buffer.from(`\r\n--${limite}--`),
    ])
    const r = await this.appel<{ id: string }>(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
      body: corps,
    })
    return r.id
  }

  /** Remplace le contenu d'un document Google existant (même lien). */
  async remplacer(id: string, html: string) {
    await this.appel(`${UPLOAD}/${id}?uploadType=media&fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      body: html,
    })
  }

  async corbeille(id: string) {
    await this.appel(`${DRIVE}/${id}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    }).catch(() => undefined)
  }

  /** Met à jour un document Google ; s'il n'existe plus (supprimé à la main), le recrée. */
  async documentAJour(id: string | null, nom: string, parent: string, html: string): Promise<string> {
    if (id) {
      try {
        await this.remplacer(id, html)
        return id
      } catch {
        await this.corbeille(id)
      }
    }
    return this.envoyer(nom, parent, html, 'text/html', true)
  }
}

interface VisiteComplete {
  id: string
  commerce_id: string
  resultat: string
  plateaux: number | null
  palettes: number | null
  date_relance: string | null
  remarques: string[] | null
  commentaire: string | null
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
  type_commerce: string | null
  lat_envoi: number | null
  lng_envoi: number | null
  lat_ouverture: number | null
  lng_ouverture: number | null
  precision_envoi_m: number | null
  adresse_gps: string | null
  heure_serveur: string
  photo_path: string
  a_completer: boolean
  drive_dossier_id: string | null
  drive_rapport_id: string | null
  commercial: { full_name: string } | null
}

interface CommerceComplet {
  id: string
  nom: string
  adresse: string | null
  commune: string | null
  type: string
  statut: string
  latitude: number | null
  longitude: number | null
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
  drive_dossier_id: string | null
  drive_visites_dossier_id: string | null
  drive_fiche_id: string | null
}

const STYLE = `<style>body{font-family:Arial,sans-serif;font-size:11pt;color:#1f2937}h1{color:#b83a2c;font-size:20pt;margin:0 0 4pt}h2{font-size:13pt;color:#111827;margin:16pt 0 6pt}td,th{border:1px solid #d1d5db;padding:4pt 6pt;vertical-align:top;font-size:10pt}th{background:#f3f4f6;text-align:left}table{border-collapse:collapse;width:100%}.gris{color:#6b7280}</style>`

function ligne(label: string, valeur: unknown) {
  return valeur == null || valeur === '' ? '' : `<tr><th>${echapper(label)}</th><td>${valeur}</td></tr>`
}

function carte(lat: number | null, lng: number | null) {
  return lat != null && lng != null
    ? `<a href="https://www.google.com/maps?q=${lat},${lng}">${lat.toFixed(5)}, ${lng.toFixed(5)}</a>`
    : null
}

function quantites(v: VisiteComplete) {
  return v.resultat === 'precommande' ? `${v.plateaux ?? 0} plateau(x) de 24 · ${v.palettes ?? 0} palette(s)` : null
}

function rapportHtml(v: VisiteComplete, c: CommerceComplet, photoUrl: string | null) {
  const lat = v.lat_envoi ?? v.lat_ouverture
  const lng = v.lng_envoi ?? v.lng_ouverture
  return `<html><head><meta charset="utf-8">${STYLE}</head><body>
<h1>Rapport de visite — ${echapper(c.nom)}</h1>
<p class="gris">${dateBxl(v.heure_serveur)} à ${heureBxl(v.heure_serveur)} · ${echapper(v.commercial?.full_name)}${v.a_completer ? ' · <b>à compléter</b>' : ''}</p>
<h2>Visite</h2><table>
${ligne('Résultat', `<b>${echapper(LABEL_RESULTAT[v.resultat])}</b>`)}
${ligne('Précommande', quantites(v))}
${ligne('Relance', v.date_relance ? dateBxl(`${v.date_relance}T12:00:00Z`) : null)}
${ligne('Remarques', (v.remarques ?? []).map(echapper).join(' · '))}
${ligne('Commentaire', echapper(v.commentaire))}
</table>
<h2>Commerce</h2><table>
${ligne('Nom', echapper(c.nom))}
${ligne('Type', echapper(LABEL_TYPE[v.type_commerce ?? c.type]))}
${ligne('Adresse', echapper(c.adresse))}
${ligne('Commune', echapper(c.commune))}
${ligne('Statut', echapper(LABEL_STATUT[c.statut]))}
</table>
<h2>Personne rencontrée</h2><table>
${ligne('Nom', echapper(v.contact_nom))}
${ligne('Fonction', echapper(v.contact_fonction))}
${ligne('Téléphone', echapper(v.contact_telephone))}
${ligne('E-mail', echapper(v.contact_email))}
</table>
<h2>Localisation</h2><table>
${ligne('Adresse (GPS)', echapper(v.adresse_gps))}
${ligne('Position', carte(lat, lng))}
${ligne('Précision', v.precision_envoi_m != null ? `±${Math.round(v.precision_envoi_m)} m` : null)}
</table>
${photoUrl ? `<h2>Photo</h2><p><img src="${photoUrl}" width="480"></p>` : ''}
<p class="gris">Fiche complète dans l'app : <a href="${URL_APP}/admin/visites/${v.id}">${URL_APP}/admin/visites/${v.id}</a></p>
</body></html>`
}

function ficheHtml(c: CommerceComplet, visites: VisiteComplete[]) {
  const plateaux = visites.reduce((s, v) => s + (v.plateaux ?? 0), 0)
  const palettes = visites.reduce((s, v) => s + (v.palettes ?? 0), 0)
  const prochaine = visites.find((v) => v.date_relance)?.date_relance
  const lignes = visites
    .map(
      (v) => `<tr><td>${dateBxl(v.heure_serveur)} ${heureBxl(v.heure_serveur)}</td><td>${echapper(LABEL_RESULTAT[v.resultat])}</td><td>${
        quantites(v) ?? ''
      }</td><td>${echapper([...(v.remarques ?? []), v.commentaire].filter(Boolean).join(' · '))}</td><td>${
        v.drive_dossier_id ? `<a href="https://drive.google.com/drive/folders/${v.drive_dossier_id}">Ouvrir</a>` : ''
      }</td></tr>`
    )
    .join('')
  return `<html><head><meta charset="utf-8">${STYLE}</head><body>
<h1>${echapper(c.nom)}</h1>
<p class="gris">${echapper(LABEL_TYPE[c.type])} · ${echapper(LABEL_STATUT[c.statut])} · mise à jour le ${dateBxl(new Date().toISOString())}</p>
<h2>Coordonnées</h2><table>
${ligne('Adresse', echapper(c.adresse))}
${ligne('Commune', echapper(c.commune))}
${ligne('Position', carte(c.latitude, c.longitude))}
${ligne('Contact', echapper([c.contact_nom, c.contact_fonction].filter(Boolean).join(' · ')))}
${ligne('Téléphone', echapper(c.contact_telephone))}
${ligne('E-mail', echapper(c.contact_email))}
</table>
<h2>Résumé</h2><table>
${ligne('Visites', String(visites.length))}
${ligne('Précommandes', `${visites.filter((v) => v.resultat === 'precommande').length} — ${plateaux} plateau(x) · ${palettes} palette(s) au total`)}
${ligne('Dernière visite', visites[0] ? `${dateBxl(visites[0].heure_serveur)} — ${echapper(LABEL_RESULTAT[visites[0].resultat])}` : null)}
${ligne('Prochaine relance', prochaine ? dateBxl(`${prochaine}T12:00:00Z`) : null)}
</table>
<h2>Historique des visites</h2>
<table><tr><th>Date</th><th>Résultat</th><th>Quantités</th><th>Remarques</th><th>Dossier</th></tr>${lignes}</table>
<p class="gris">Fiche dans l'app : <a href="${URL_APP}/admin/commerces/${c.id}">${URL_APP}/admin/commerces/${c.id}</a></p>
</body></html>`
}

const SELECT_VISITE =
  'id, commerce_id, resultat, plateaux, palettes, date_relance, remarques, commentaire, contact_nom, contact_fonction, contact_telephone, contact_email, type_commerce, lat_envoi, lng_envoi, lat_ouverture, lng_ouverture, precision_envoi_m, adresse_gps, heure_serveur, photo_path, a_completer, drive_dossier_id, drive_rapport_id, commercial:profiles(full_name)'

async function dossierType(db: SupabaseClient, drive: Drive, type: string): Promise<string> {
  let racine = await lireReglage(db, 'drive_racine')
  if (!racine) {
    racine = await drive.dossier('Adala — Commerces', null)
    await ecrireReglage(db, 'drive_racine', racine)
  }
  const cle = `drive_type_${type}`
  let id = await lireReglage(db, cle)
  if (!id) {
    id = await drive.dossier(LABEL_TYPE[type] ?? 'Autre', racine)
    await ecrireReglage(db, cle, id)
  }
  return id
}

async function archiverVisite(db: SupabaseClient, drive: Drive, visiteId: string) {
  const { data: vData, error } = await db.from('visites').select(SELECT_VISITE).eq('id', visiteId).single()
  if (error || !vData) throw new Error('visite introuvable')
  const v = vData as unknown as VisiteComplete
  const { data: cData } = await db.from('commerces').select('*').eq('id', v.commerce_id).single()
  const c = cData as CommerceComplet

  // Dossier du commerce, rangé par type.
  if (!c.drive_dossier_id || !c.drive_visites_dossier_id) {
    const parent = await dossierType(db, drive, c.type)
    c.drive_dossier_id = await drive.dossier([c.nom, c.commune].filter(Boolean).join(' — '), parent)
    c.drive_visites_dossier_id = await drive.dossier('Visites', c.drive_dossier_id)
    await db
      .from('commerces')
      .update({ drive_dossier_id: c.drive_dossier_id, drive_visites_dossier_id: c.drive_visites_dossier_id })
      .eq('id', c.id)
  }

  // Lien temporaire vers la photo : Google l'intègre dans le rapport.
  const { data: signe } = await db.storage.from('visites-photos').createSignedUrl(v.photo_path, 600)
  const html = rapportHtml(v, c, signe?.signedUrl ?? null)
  const nomDossier = `${horodatageDossier(v.heure_serveur)} — ${LABEL_RESULTAT[v.resultat]}${v.a_completer ? ' (à compléter)' : ''}`

  if (!v.drive_dossier_id) {
    v.drive_dossier_id = await drive.dossier(nomDossier, c.drive_visites_dossier_id!)
    // Enregistré tout de suite : en cas d'échec plus loin, on réutilise ce dossier.
    await db.from('visites').update({ drive_dossier_id: v.drive_dossier_id }).eq('id', v.id)
  } else {
    // Visite complétée ensuite (ou archivage interrompu) : on renomme le dossier.
    await drive.renommer(v.drive_dossier_id, nomDossier)
  }
  if (!v.drive_rapport_id) {
    const { data: photo } = await db.storage.from('visites-photos').download(v.photo_path)
    if (photo) await drive.envoyer('photo.jpg', v.drive_dossier_id, Buffer.from(await photo.arrayBuffer()), 'image/jpeg')
  }
  v.drive_rapport_id = await drive.documentAJour(v.drive_rapport_id, 'Rapport de visite', v.drive_dossier_id, html)

  await db
    .from('visites')
    .update({
      drive_dossier_id: v.drive_dossier_id,
      drive_rapport_id: v.drive_rapport_id,
      drive_archive_at: new Date().toISOString(),
      drive_erreur: null,
    })
    .eq('id', v.id)

  // Fiche du commerce, régénérée avec tout l'historique.
  const { data: historique } = await db
    .from('visites')
    .select(SELECT_VISITE)
    .eq('commerce_id', c.id)
    .order('heure_serveur', { ascending: false })
  const { data: cFrais } = await db.from('commerces').select('*').eq('id', c.id).single()
  const ficheId = await drive.documentAJour(
    c.drive_fiche_id,
    `Fiche commerce — ${c.nom}`,
    c.drive_dossier_id!,
    ficheHtml(cFrais as CommerceComplet, (historique as unknown as VisiteComplete[]) ?? [])
  )
  if (ficheId !== c.drive_fiche_id) await db.from('commerces').update({ drive_fiche_id: ficheId }).eq('id', c.id)
}

/**
 * Archive les visites pas encore copiées dans Drive. Un verrou évite que deux
 * appels simultanés (tablette + tâche du soir) créent des dossiers en double.
 */
export async function archiverEnAttente(db: SupabaseClient, max = 10): Promise<{ archivees: number; erreurs: number; configure: boolean }> {
  if (!(await driveConfigure(db))) return { archivees: 0, erreurs: 0, configure: false }

  const { error: verrou } = await db.from('integrations').insert({ cle: 'drive_verrou', valeur: new Date().toISOString() })
  if (verrou) {
    const depuis = await lireReglage(db, 'drive_verrou')
    if (depuis && Date.now() - new Date(depuis).getTime() < 5 * 60000) return { archivees: 0, erreurs: 0, configure: true }
    await ecrireReglage(db, 'drive_verrou', new Date().toISOString())
  }

  let archivees = 0
  let erreurs = 0
  try {
    const { data } = await db
      .from('visites')
      .select('id')
      .is('drive_archive_at', null)
      // Les visites en erreur passent après les nouvelles, pour ne pas tout bloquer.
      .order('drive_erreur', { ascending: true, nullsFirst: true })
      .order('heure_serveur')
      .limit(max)
    if (!data?.length) return { archivees, erreurs, configure: true }
    const drive = await Drive.connecter(db)
    for (const { id } of data) {
      try {
        await archiverVisite(db, drive, id as string)
        archivees++
      } catch (e) {
        erreurs++
        await db
          .from('visites')
          .update({ drive_erreur: (e instanceof Error ? e.message : String(e)).slice(0, 300) })
          .eq('id', id)
      }
    }
  } finally {
    await db.from('integrations').delete().eq('cle', 'drive_verrou')
  }
  return { archivees, erreurs, configure: true }
}
