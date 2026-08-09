import { createClient } from '@supabase/supabase-js'

// Fonction serveur Vercel (jamais envoyée au navigateur) : c'est ici, et
// uniquement ici, que la clé service_role est utilisée — pour pouvoir
// changer le mot de passe d'un ouvrier à la demande d'un admin.

interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body: unknown
}

interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): void
}

function genererMotDePasse(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    res.status(500).json({ error: 'Configuration serveur incomplète (clé service_role manquante).' })
    return
  }

  const authHeader = req.headers.authorization
  const token = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : null
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' })
    return
  }

  // Vérifie qui appelle, avec la clé anon (pas de privilège particulier).
  const supabaseAsCaller = createClient(supabaseUrl, anonKey)
  const {
    data: { user: caller },
  } = await supabaseAsCaller.auth.getUser(token)

  if (!caller) {
    res.status(401).json({ error: 'Session invalide.' })
    return
  }

  const { data: callerProfile } = await supabaseAsCaller
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.role !== 'admin') {
    res.status(403).json({ error: 'Réservé aux administrateurs.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const ouvrierId = (body as { ouvrierId?: string })?.ouvrierId
  if (!ouvrierId) {
    res.status(400).json({ error: 'ouvrierId manquant.' })
    return
  }

  const nouveauMotDePasse = genererMotDePasse()

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await supabaseAdmin.auth.admin.updateUserById(ouvrierId, {
    password: nouveauMotDePasse,
  })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ password: nouveauMotDePasse })
}
