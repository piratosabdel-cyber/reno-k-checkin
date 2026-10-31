import { archiverEnAttente } from './_lib/drive'
import { roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur'

// Appelée par la tablette juste après l'envoi d'une visite : copie les
// nouvelles visites dans Google Drive. La tâche du soir rattrape les oublis.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }
  const appelant = await roleAppelant(req)
  if (!appelant || !['commercial', 'admin'].includes(appelant.role)) {
    res.status(401).json({ error: 'Non autorisé.' })
    return
  }
  try {
    res.status(200).json(await archiverEnAttente(supabaseAdmin()))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
