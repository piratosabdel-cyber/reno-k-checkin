import { roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur'

// Création d'un compte commercial par l'admin. Le rôle est posé dans
// app_metadata (modifiable uniquement côté serveur) : personne ne peut se
// donner un rôle depuis le navigateur.
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

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
    email?: string
    password?: string
    fullName?: string
    role?: string
  }
  const role = body?.role === 'commercial' ? 'commercial' : 'ouvrier'
  if (!body?.email || !body.fullName || !body.password || body.password.length < 6) {
    res.status(400).json({ error: 'Nom, e-mail et mot de passe (6 caractères minimum) obligatoires.' })
    return
  }

  try {
    const { error } = await supabaseAdmin().auth.admin.createUser({
      email: body.email.trim(),
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.fullName.trim() },
      app_metadata: { role },
    })
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
