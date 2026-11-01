import { envoyerListe } from './_lib/recap.js'
import { roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur.js'

// La commerciale (ses visites) ou l'admin envoie à order@adalacola.com une
// liste de visites choisie : cochées, ou toutes celles du filtre affiché.
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

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { ids?: unknown; titre?: unknown }
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
  if (ids.length === 0 || ids.length > 500) {
    res.status(400).json({ error: 'Choisis entre 1 et 500 visites.' })
    return
  }
  const titre = typeof body.titre === 'string' && body.titre.trim() ? body.titre.trim().slice(0, 150) : 'Liste de visites Adala'

  try {
    res
      .status(200)
      .json(await envoyerListe(supabaseAdmin(), ids, titre, appelant.role === 'commercial' ? appelant.id : null))
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
