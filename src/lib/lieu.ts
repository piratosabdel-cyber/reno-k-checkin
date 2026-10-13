import { distanceMetres } from './geo'
import { DEPOTS } from './heures'
import type { Chantier } from '../types/database'

type ChantierGeo = Pick<Chantier, 'nom' | 'latitude' | 'longitude' | 'rayon_metres'>

const RAYON_DEPOT_M = 300

/** Nom d'un lieu connu (dépôt ou chantier) si la position en est proche, sinon null. */
export function lieuConnu(lat: number, lng: number, chantiers: ChantierGeo[]): string | null {
  for (const d of DEPOTS) {
    if (distanceMetres(lat, lng, d.lat, d.lng) <= RAYON_DEPOT_M) return d.nom
  }
  let meilleur: { nom: string; dist: number } | null = null
  for (const c of chantiers) {
    if (c.latitude == null || c.longitude == null) continue
    const dist = distanceMetres(lat, lng, c.latitude, c.longitude)
    if (dist <= c.rayon_metres && (!meilleur || dist < meilleur.dist)) meilleur = { nom: c.nom, dist }
  }
  return meilleur ? `Chantier ${meilleur.nom}` : null
}

function cle(lat: number, lng: number) {
  return `lieu:${lat.toFixed(4)},${lng.toFixed(4)}`
}

// Nominatim impose max 1 requête/seconde : les appels sont mis en file.
let file: Promise<unknown> = Promise.resolve()

/** Adresse lisible ("Rue 12, Commune") pour une position, via OpenStreetMap, avec cache local. */
export function adresseApprox(lat: number, lng: number): Promise<string> {
  const k = cle(lat, lng)
  try {
    const enCache = localStorage.getItem(k)
    if (enCache) return Promise.resolve(enCache)
  } catch {
    // stockage indisponible : on interroge quand même
  }

  const p = file.then(async () => {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('zoom', '18')
    url.searchParams.set('addressdetails', '1')
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error('reverse geocoding indisponible')
    const d: { display_name?: string; address?: Record<string, string> } = await res.json()
    const a = d.address ?? {}
    const rue = [a.road, a.house_number].filter(Boolean).join(' ')
    const commune = a.village || a.town || a.city || a.municipality || a.suburb || ''
    const libelle =
      [rue, commune].filter(Boolean).join(', ') || d.display_name?.split(',').slice(0, 2).join(',').trim() || ''
    if (!libelle) throw new Error('adresse introuvable')
    try {
      localStorage.setItem(k, libelle)
    } catch {
      // cache facultatif
    }
    await new Promise((r) => setTimeout(r, 1100))
    return libelle
  })
  file = p.catch(() => undefined)
  return p
}
