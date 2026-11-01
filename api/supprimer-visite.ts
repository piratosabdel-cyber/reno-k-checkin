import { retirerVisiteDuDrive } from './_lib/drive.js'
import { roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur.js'

// Suppression d'une visite par l'admin : la visite, ses alertes et sa photo
// sont effacées ; le dossier Drive part à la corbeille.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }
  const appelant = await roleAppelant(req)
  if (appelant?.role !== 'admin') {
    res.status(403).json({ error: 'Réservé aux administrateurs.' })
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
    .select('id, commerce_id, photo_path, drive_dossier_id')
    .eq('id', body.id)
    .maybeSingle()
  if (!v) {
    res.status(404).json({ error: 'Visite introuvable.' })
    return
  }

  const { error } = await db.from('visites').delete().eq('id', v.id)
  if (error) {
    res.status(500).json({ error: error.message })
    return
  }
  await db.storage.from('visites-photos').remove([v.photo_path as string])

  // La visite est déjà effacée : un souci côté Drive ne doit pas faire échouer la demande.
  let drive: string | null = null
  try {
    await retirerVisiteDuDrive(db, v.drive_dossier_id as string | null, v.commerce_id as string)
  } catch (e) {
    drive = e instanceof Error ? e.message : String(e)
  }
  res.status(200).json({ ok: true, drive })
}
