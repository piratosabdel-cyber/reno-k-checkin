import { retirerVisiteDuDrive } from './_lib/drive.js'
import { roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur.js'

// Suppression d'une visite par l'admin, ou par la commerciale pour ses propres
// visites des 7 derniers jours : la visite, ses alertes et sa photo sont
// effacées ; le dossier Drive part à la corbeille.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }
  const appelant = await roleAppelant(req)
  if (!appelant || !['admin', 'commercial'].includes(appelant.role)) {
    res.status(403).json({ error: 'Non autorisé.' })
    return
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { id?: unknown }
  if (typeof body?.id !== 'string') {
    res.status(400).json({ error: 'Visite manquante.' })
    return
  }

  const db = supabaseAdmin()
  const { data: v } = await db
    .from('visites')
    .select('id, commerce_id, commercial_id, heure_serveur, photo_path, drive_dossier_id')
    .eq('id', body.id)
    .maybeSingle()
  if (!v) {
    res.status(404).json({ error: 'Visite introuvable.' })
    return
  }
  if (
    appelant.role === 'commercial' &&
    (v.commercial_id !== appelant.id || Date.now() - new Date(v.heure_serveur as string).getTime() > 7 * 24 * 3600000)
  ) {
    res.status(403).json({ error: 'Cette visite ne peut plus être effacée.' })
    return
  }

  const { error } = await db.from('visites').delete().eq('id', v.id)
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  if (v.photo_path) await db.storage.from('visites-photos').remove([v.photo_path as string])

  // La visite est déjà effacée : un souci côté Drive ne doit pas faire échouer la demande.
  let drive: string | null = null
  try {
    await retirerVisiteDuDrive(db, v.drive_dossier_id as string | null, v.commerce_id as string)
  } catch (e) {
    drive = e instanceof Error ? e.message : String(e)
  }
  res.status(200).json({ ok: true, drive })
}
