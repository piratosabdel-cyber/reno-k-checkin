import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Utilitaires partagés par les fonctions serveur (le préfixe « _ » empêche
// Vercel d'exposer ce dossier comme une route).

export interface VercelRequest {
  method?: string
  url?: string
  query?: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
  body: unknown
}

export interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): void
  send(body: string): void
  setHeader(name: string, value: string): void
  redirect(url: string): void
}

export function env(nom: string): string {
  const v = process.env[nom]
  if (!v) throw new Error(`Variable d'environnement manquante : ${nom}`)
  return v
}

/** Client Supabase avec la clé service_role (jamais envoyé au navigateur). */
export function supabaseAdmin(): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function jeton(req: VercelRequest): string | null {
  const h = req.headers.authorization
  return typeof h === 'string' ? h.replace(/^Bearer\s+/i, '') : null
}

/** Rôle de l'utilisateur connecté qui appelle la fonction (null si non connecté). */
export async function roleAppelant(req: VercelRequest): Promise<{ id: string; role: string } | null> {
  const token = jeton(req)
  if (!token) return null
  const admin = supabaseAdmin()
  const {
    data: { user },
  } = await admin.auth.getUser(token)
  if (!user) return null
  const { data } = await admin.from('profiles').select('role, active').eq('id', user.id).single()
  if (!data?.active) return null
  return { id: user.id, role: data.role as string }
}

function egal(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Appel venant du planificateur Vercel (ou d'une personne qui connaît CRON_SECRET). */
export function estCron(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET
  const token = jeton(req)
  return !!secret && !!token && egal(token, secret)
}

export function signer(valeur: string): string {
  return createHmac('sha256', env('CRON_SECRET')).update(valeur).digest('hex')
}

export function verifierSignature(valeur: string, signature: string): boolean {
  return egal(signer(valeur), signature)
}

export function echapper(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const URL_APP = process.env.APP_URL ?? 'https://visites.adalacola.com'
