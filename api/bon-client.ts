import { envoyerBonClient, preparerBonClient } from './_lib/bon.js'
import { roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur.js'

// Bon de commande à faire signer à distance (quantités changées, client
// absent) : « preparer » fabrique le PDF et renvoie un lien ; « envoyer »
// l'envoie par e-mail au client ou note qu'il est parti par WhatsApp.
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
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    id?: unknown
    action?: unknown
    canal?: unknown
    email?: unknown
  }
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) {
    res.status(400).json({ error: 'Visite manquante.' })
    return
  }
  const commercialId = appelant.role === 'commercial' ? appelant.id : null
  try {
    if (body.action === 'preparer') {
      const { numero, url } = await preparerBonClient(supabaseAdmin(), id, commercialId)
      res.status(200).json({ numero, url })
      return
    }
    const canal = body.canal === 'email' || body.canal === 'whatsapp' || body.canal === 'partage' ? body.canal : null
    if (!canal) {
      res.status(400).json({ error: 'Canal inconnu.' })
      return
    }
    const email = typeof body.email === 'string' ? body.email.trim() : null
    res.status(200).json(await envoyerBonClient(supabaseAdmin(), id, commercialId, canal, email))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
