export interface AdresseProposee {
  adresse: string
  commune: string | null
}

/**
 * Adresse proposée à partir du GPS (OpenStreetMap / Nominatim, gratuit).
 * Renvoie null hors connexion ou si rien n'est trouvé : la commerciale tape
 * alors l'adresse elle-même.
 */
export async function adresseDepuisGps(lat: number, lng: number): Promise<AdresseProposee | null> {
  if (!navigator.onLine) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=fr&zoom=18&addressdetails=1`,
      { signal: ctrl.signal }
    )
    clearTimeout(t)
    if (!res.ok) return null
    const data = (await res.json()) as {
      address?: Record<string, string>
      display_name?: string
    }
    const a = data.address ?? {}
    const commune = a.town ?? a.village ?? a.city ?? a.municipality ?? null
    const rue = [a.road, a.house_number].filter(Boolean).join(' ')
    const adresse = [rue, [a.postcode, commune].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    return adresse ? { adresse, commune } : null
  } catch {
    return null
  }
}
