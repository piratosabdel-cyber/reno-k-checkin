/** Distance en mètres entre deux points GPS (formule de Haversine). */
export function distanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface GeoPosition {
  lat: number
  lng: number
  accuracy: number
}

export type GeoErreurCode = 'refus' | 'indisponible' | 'timeout' | 'non_supporte'

export class GeoErreur extends Error {
  code: GeoErreurCode
  constructor(code: GeoErreurCode) {
    super(code)
    this.code = code
  }
}

function demander(options: PositionOptions): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) =>
        reject(
          new GeoErreur(
            err.code === err.PERMISSION_DENIED ? 'refus' : err.code === err.TIMEOUT ? 'timeout' : 'indisponible'
          )
        ),
      options
    )
  })
}

/**
 * Position actuelle. Première tentative en haute précision ; si elle échoue
 * (hors refus explicite), seconde tentative moins précise qui accepte une
 * position récente du téléphone — beaucoup plus fiable en intérieur.
 */
export async function getCurrentPosition(): Promise<GeoPosition> {
  if (!navigator.geolocation) throw new GeoErreur('non_supporte')
  try {
    return await demander({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  } catch (e) {
    if (e instanceof GeoErreur && e.code === 'refus') throw e
    return demander({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 })
  }
}

const estIphone = () => /iPhone|iPad/i.test(navigator.userAgent)

/** Explication lisible + marche à suivre pour l'ouvrier. */
export function messageGeoErreur(e: unknown): string {
  const code = e instanceof GeoErreur ? e.code : 'indisponible'
  switch (code) {
    case 'refus':
      return estIphone()
        ? "La localisation est refusée pour cette appli. Sur iPhone : Réglages → Confidentialité et sécurité → Service de localisation → Safari (ou Chrome) → « Lorsque l'app est active » + « Position exacte ». Si l'appli est installée sur l'écran d'accueil, supprime l'icône et réinstalle-la pour qu'elle redemande l'autorisation."
        : "La localisation est refusée pour cette appli. Sur Android : appuie sur le cadenas à côté de l'adresse → Autorisations → Position → Autoriser, puis recharge."
    case 'timeout':
      return "La recherche de position prend trop de temps. Sors à l'air libre ou approche-toi d'une fenêtre, puis réessaie."
    case 'non_supporte':
      return "Ce téléphone ou ce navigateur ne permet pas la localisation."
    default:
      return "Le téléphone n'arrive pas à déterminer ta position. Vérifie que la localisation est activée (Réglages → Confidentialité → Service de localisation), puis réessaie."
  }
}
