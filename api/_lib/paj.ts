import { env } from './serveur.js'

// Connexion à l'API officielle PAJ GPS (https://connect.paj-gps.de/api/documentation).
// Identifiants dans les variables d'environnement Vercel PAJ_EMAIL / PAJ_PASSWORD
// (un utilisateur du portail PAJ, idéalement réservé à cet usage).

const BASE = 'https://connect.paj-gps.de/api/v1'
export const FUSEAU = 'Europe/Brussels'

export interface PajDevice {
  id: number
  imei: string
  name: string
}

export interface PajPoint {
  lat: number
  lng: number
  dateunix: number
  speed: number
  accuracy?: number
}

export async function pajLogin(): Promise<string> {
  const r = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: env('PAJ_EMAIL'), password: env('PAJ_PASSWORD'), language: 'fr', timezone: FUSEAU }),
  })
  const j = (await r.json().catch(() => ({}))) as { success?: { token?: string }; error?: string }
  if (!r.ok || !j.success?.token) {
    throw new Error(`Connexion PAJ refusée (${r.status}) : vérifier PAJ_EMAIL / PAJ_PASSWORD. ${j.error ?? ''}`.trim())
  }
  return j.success.token
}

async function pajGet<T>(token: string, chemin: string): Promise<T> {
  let derniere: unknown
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await fetch(`${BASE}${chemin}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (!r.ok) throw new Error(`PAJ ${chemin} : HTTP ${r.status}`)
      return (await r.json()) as T
    } catch (e) {
      derniere = e
      await new Promise((ok) => setTimeout(ok, 1500 * (essai + 1)))
    }
  }
  throw derniere instanceof Error ? derniere : new Error(String(derniere))
}

export async function pajDevices(token: string): Promise<PajDevice[]> {
  const j = await pajGet<{ success?: PajDevice[] }>(token, '/device')
  return (j.success ?? []).map((d) => ({ id: d.id, imei: d.imei, name: d.name }))
}

export async function pajPoints(
  token: string,
  deviceId: number,
  debutUnix: number,
  finUnix: number
): Promise<{ points: PajPoint[]; distancePaj: number | null }> {
  const j = await pajGet<{ success?: PajPoint[]; distance?: number }>(
    token,
    `/trackerdata/${deviceId}/date_range?dateStart=${debutUnix}&dateEnd=${finUnix}&wifi=0`
  )
  return { points: j.success ?? [], distancePaj: typeof j.distance === 'number' ? j.distance : null }
}

// ---------------------------------------------------------------------------
// Dates en heure de Bruxelles (le serveur Vercel tourne en UTC).
// ---------------------------------------------------------------------------

/** Décalage (minutes) de Bruxelles par rapport à UTC à un instant donné. */
function decalageMin(instant: Date): number {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value)
  const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'))
  return Math.round((local - instant.getTime()) / 60000)
}

/** Minuit (heure de Bruxelles) du jour "YYYY-MM-DD", en secondes Unix. */
export function minuitBruxelles(jour: string): number {
  const [a, m, j] = jour.split('-').map(Number)
  const approx = new Date(Date.UTC(a, m - 1, j, 0, 0))
  return Math.floor((approx.getTime() - decalageMin(approx) * 60000) / 1000)
}

export function jourSuivant(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j + 1)).toISOString().slice(0, 10)
}

export function aujourdhuiBruxelles(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU }).format(new Date())
}

export function heureBruxelles(unix: number): string {
  return new Intl.DateTimeFormat('fr-BE', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(unix * 1000)
  )
}

// ---------------------------------------------------------------------------
// Kilomètres d'une journée à partir des points GPS.
// ---------------------------------------------------------------------------

function distanceM(a: PajPoint, b: PajPoint): number {
  const R = 6371000
  const r = (x: number) => (x * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface ResumeJour {
  km: number
  points: number
  premier: PajPoint | null
  dernier: PajPoint | null
}

/**
 * Somme des segments GPS, en écartant le bruit à l'arrêt (petits sauts de
 * position quand la vitesse est nulle) et les sauts impossibles (> 180 km/h).
 */
export function resumerJour(brut: PajPoint[]): ResumeJour {
  const pts = brut
    .filter((p) => p.lat && p.lng && (!p.accuracy || p.accuracy < 100))
    .sort((a, b) => a.dateunix - b.dateunix)
  let m = 0
  let premier: PajPoint | null = null
  let dernier: PajPoint | null = null
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const d = distanceM(a, b)
    const dt = Math.max(1, b.dateunix - a.dateunix)
    if ((d / dt) * 3.6 > 180) continue
    if (d < 30) continue
    if (a.speed === 0 && b.speed === 0 && d < 150) continue
    m += d
    if (!premier) premier = a
    dernier = b
  }
  return { km: Math.round(m / 100) / 10, points: pts.length, premier, dernier }
}
