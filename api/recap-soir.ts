import { archiverEnAttente } from './_lib/drive.js'
import { envoyerRecap } from './_lib/recap.js'
import { estCron, roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur.js'

// Tâche planifiée du soir (vercel.json > crons) : rattrape l'archivage Drive
// puis envoie le récapitulatif de la journée à order@adalacola.com.
// L'admin peut aussi la lancer à la main depuis l'app.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const appelant = estCron(req) ? null : await roleAppelant(req)
  if (!estCron(req) && appelant?.role !== 'admin') {
    res.status(401).json({ error: 'Non autorisé.' })
    return
  }

  const db = supabaseAdmin()
  const resultat: Record<string, unknown> = {}
  try {
    // Plusieurs passes pour vider la file même après une coupure prolongée.
    let total = 0
    for (let i = 0; i < 5; i++) {
      const r = await archiverEnAttente(db, 10)
      total += r.archivees
      resultat.drive = { ...r, archivees: total }
      if (!r.configure || r.archivees + r.erreurs < 10) break
    }
  } catch (e) {
    resultat.drive = { erreur: e instanceof Error ? e.message : String(e) }
  }
  try {
    resultat.email = await envoyerRecap(db)
  } catch (e) {
    resultat.email = { erreur: e instanceof Error ? e.message : String(e) }
  }
  res.status(200).json(resultat)
}
