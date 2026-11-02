import { envoyerBon } from './_lib/bon.js'
import { roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur.js'

// Dès qu'un bon de commande signé arrive au serveur, la tablette appelle cette
// fonction : PDF fabriqué et envoyé tout de suite à order@adalacola.com.
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
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { id?: unknown; client_uuid?: unknown }
  const id = typeof body?.id === 'string' ? body.id : undefined
  const client_uuid = typeof body?.client_uuid === 'string' ? body.client_uuid : undefined
  if (!id && !client_uuid) {
    res.status(400).json({ error: 'Visite manquante.' })
    return
  }
  try {
    res
      .status(200)
      .json(await envoyerBon(supabaseAdmin(), { id, client_uuid }, appelant.role === 'commercial' ? appelant.id : null))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
