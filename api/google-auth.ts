import { ecrireReglage, SCOPE_DRIVE } from './_lib/drive.js'
import { echapper, env, signer, supabaseAdmin, verifierSignature, type VercelRequest, type VercelResponse } from './_lib/serveur.js'

// Connexion unique du Google Drive de order@adalacola.com.
//  1. L'admin ouvre /api/google-auth?cle=<CRON_SECRET>
//  2. Google demande l'accord, puis revient ici avec un code
//  3. Le jeton est gardé dans la base (table integrations, lisible
//     uniquement côté serveur). Plus rien à faire ensuite.

function page(res: VercelResponse, code: number, titre: string, texte: string) {
  res.status(code)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(
    `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;max-width:520px;margin:40px auto;padding:0 16px"><h1 style="color:#b83a2c">${echapper(titre)}</h1><p>${echapper(texte)}</p></body>`
  )
}

function param(req: VercelRequest, nom: string): string | null {
  const v = req.query?.[nom] ?? new URL(req.url ?? '/', 'http://x').searchParams.get(nom)
  return typeof v === 'string' ? v : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host
  const redirectUri = `https://${host}/api/google-auth`
  const code = param(req, 'code')

  try {
    if (!code) {
      const cle = param(req, 'cle')
      if (!cle || !verifierSignature(cle, signer(env('CRON_SECRET')))) {
        page(res, 401, 'Accès refusé', 'Lien de connexion invalide.')
        return
      }
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: env('GOOGLE_CLIENT_ID'),
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE_DRIVE,
        access_type: 'offline',
        prompt: 'consent',
        login_hint: 'order@adalacola.com',
        state: signer('google-auth'),
      }).toString()
      res.redirect(url.toString())
      return
    }

    if (!verifierSignature('google-auth', param(req, 'state') ?? '')) {
      page(res, 401, 'Accès refusé', 'Réponse de Google non reconnue. Recommence depuis le lien de connexion.')
      return
    }

    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const data = (await r.json()) as { refresh_token?: string; error_description?: string }
    if (!data.refresh_token) {
      page(res, 400, 'Connexion incomplète', data.error_description ?? 'Google n’a pas renvoyé de jeton. Recommence.')
      return
    }
    await ecrireReglage(supabaseAdmin(), 'google_refresh_token', data.refresh_token)
    page(res, 200, 'Google Drive connecté ✓', 'Les visites seront désormais rangées automatiquement dans le Drive de order@adalacola.com. Tu peux fermer cette page.')
  } catch (e) {
    page(res, 500, 'Erreur', e instanceof Error ? e.message : String(e))
  }
}
