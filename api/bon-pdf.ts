import { supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur.js'

// Lien court envoyé au client par WhatsApp : visites.adalacola.com/b/<code>.
// Ouvre le dernier bon à signer de la visite (lien de stockage de 10 min).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = typeof req.query?.c === 'string' ? req.query.c : ''
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(code)) {
    res.status(404).send('Lien introuvable.')
    return
  }
  const db = supabaseAdmin()
  const { data: v } = await db
    .from('visites')
    .select('client_uuid, commercial_id, bon_version')
    .eq('bon_client_code', code)
    .maybeSingle()
  if (!v) {
    res.status(404).send('Ce bon de commande n’existe plus.')
    return
  }
  const chemin = `${v.commercial_id}/${v.client_uuid}-bon-a-signer-v${v.bon_version}.pdf`
  const { data: lien } = await db.storage.from('visites-photos').createSignedUrl(chemin, 600)
  if (!lien?.signedUrl) {
    res.status(404).send('Ce bon de commande n’est plus disponible.')
    return
  }
  res.redirect(lien.signedUrl)
}
