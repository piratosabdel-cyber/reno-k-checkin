import { distanceMetres } from './geo'
import type { Chantier, Pointage } from '../types/database'

/** Dépôts Reno-K servant de points de référence pour le forfait déplacement. */
export const DEPOTS = [
  { nom: 'Dépôt Mollem', adresse: 'Z.5 Mollem 44, 1730 Asse', lat: 50.916299, lng: 4.21763 },
  { nom: 'Dépôt Ternat', adresse: 'Overnelleweg 15, 1740 Ternat', lat: 50.8848254, lng: 4.1531558 },
]

/** En deçà de cette distance d'un dépôt, le chantier est "local" : aucun forfait déplacement. */
export const RAYON_LOCAL_KM = 8
/** Jusqu'à cette distance du dépôt le plus proche : 15 min ; au-delà : 30 min. */
export const RAYON_COURT_KM = 20

/** Distance (km) entre un chantier et le dépôt le plus proche. */
export function distanceDepotKm(chantier: Pick<Chantier, 'latitude' | 'longitude'>): number {
  return Math.min(...DEPOTS.map((d) => distanceMetres(d.lat, d.lng, chantier.latitude!, chantier.longitude!))) / 1000
}

/**
 * Forfait déplacement "aller" payé pour un chantier donné, selon sa distance
 * au dépôt le plus proche : 0 si <= 8 km (local), 15 min si <= 20 km, 30 min
 * au-delà. Retourne 0 si le chantier n'a pas de coordonnées GPS (impossible
 * à calculer).
 */
export function tempsDeplacementMs(chantier: Pick<Chantier, 'latitude' | 'longitude'> | undefined | null): number {
  if (!chantier?.latitude || !chantier?.longitude) return 0
  const distanceKm = distanceDepotKm(chantier)
  if (distanceKm <= RAYON_LOCAL_KM) return 0
  const minutes = distanceKm <= RAYON_COURT_KM ? 15 : 30
  return minutes * 60000
}

export interface Creneau {
  ouvrier_id: string
  chantier_id: string
  debut: string
  fin: string
  dureeMs: number
  /** Le check-in (arrivée) de ce créneau était-il hors de la zone autorisée du chantier ? */
  arriveeHorsZone: boolean
  /** Le check-out (départ) de ce créneau était-il hors de la zone autorisée du chantier ? */
  departHorsZone: boolean
  arriveePosition: { lat: number; lng: number } | null
  departPosition: { lat: number; lng: number } | null
  arriveeDistanceM: number | null
  departDistanceM: number | null
}

function positionDe(p: Pointage): { lat: number; lng: number } | null {
  return p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null
}

/**
 * Calcule les créneaux travaillés (arrivée → départ, pauses déduites) à
 * partir des pointages TRIÉS PAR HEURE d'un seul ouvrier. Un "arrivée" sans
 * "départ" correspondant (journée en cours) n'est pas compté — on ne compte
 * que les créneaux terminés.
 *
 * Si l'ouvrier enchaîne un deuxième chantier le même jour (départ du
 * chantier A suivi d'une arrivée sur le chantier B, sans pause entre les
 * deux), le temps de trajet entre les deux n'est PAS déduit : les heures
 * sont considérées payées en continu, et ce temps est ajouté au créneau du
 * chantier B (celui qui suit).
 */
export function calculerCreneaux(pointagesTries: Pointage[]): Creneau[] {
  const creneaux: Creneau[] = []
  let arrivee: Pointage | null = null
  let pauseDebut: Pointage | null = null
  let pauseMs = 0

  for (const p of pointagesTries) {
    if (p.type === 'arrivee') {
      arrivee = p
      pauseMs = 0
      pauseDebut = null
    } else if (p.type === 'pause_debut' && arrivee) {
      pauseDebut = p
    } else if (p.type === 'pause_fin' && pauseDebut) {
      pauseMs += new Date(p.heure_appareil).getTime() - new Date(pauseDebut.heure_appareil).getTime()
      pauseDebut = null
    } else if (p.type === 'depart' && arrivee) {
      const dureeMs =
        new Date(p.heure_appareil).getTime() - new Date(arrivee.heure_appareil).getTime() - pauseMs
      creneaux.push({
        ouvrier_id: arrivee.ouvrier_id,
        chantier_id: arrivee.chantier_id,
        debut: arrivee.heure_appareil,
        fin: p.heure_appareil,
        dureeMs: Math.max(0, dureeMs),
        arriveeHorsZone: arrivee.hors_zone,
        departHorsZone: p.hors_zone,
        arriveePosition: positionDe(arrivee),
        departPosition: positionDe(p),
        arriveeDistanceM: arrivee.distance_chantier_m,
        departDistanceM: p.distance_chantier_m,
      })
      arrivee = null
      pauseMs = 0
    }
  }

  // Trajet entre deux chantiers le même jour = payé, ajouté au créneau suivant.
  for (let i = 1; i < creneaux.length; i++) {
    const finPrecedente = new Date(creneaux[i - 1].fin)
    const debutSuivant = new Date(creneaux[i].debut)
    const memeJour = finPrecedente.toDateString() === debutSuivant.toDateString()
    if (memeJour) {
      const transitMs = debutSuivant.getTime() - finPrecedente.getTime()
      if (transitMs > 0) creneaux[i].dureeMs += transitMs
    }
  }

  return creneaux
}

const PAUSE_MIDI_MS = 30 * 60000

export interface DeductionPauseMidi {
  jour: string // toDateString()
  deductionMs: number
}

/**
 * Calcule la déduction de pause midi (30 min/jour travaillé, sauf le
 * samedi où elle est payée) SANS la retirer d'un chantier en particulier —
 * elle est retournée à part pour être affichée comme une ligne séparée
 * ("Pause de midi") plutôt que cachée dans les heures d'un chantier au
 * hasard. Plafonnée au total réellement travaillé ce jour-là (jamais de
 * déduction négative).
 */
export function calculerDeductionsPauseMidi(creneaux: Creneau[]): DeductionPauseMidi[] {
  const totalBrutParJour = new Map<string, number>()
  for (const c of creneaux) {
    const jour = new Date(c.debut).toDateString()
    totalBrutParJour.set(jour, (totalBrutParJour.get(jour) ?? 0) + c.dureeMs)
  }

  const deductions: DeductionPauseMidi[] = []
  for (const [jour, totalBrutMs] of totalBrutParJour) {
    const jourSemaine = new Date(jour).getDay() // 0=dimanche ... 6=samedi
    if (jourSemaine === 6) continue // samedi : pause midi payée, pas de déduction

    const deductionMs = Math.min(PAUSE_MIDI_MS, totalBrutMs)
    if (deductionMs > 0) deductions.push({ jour, deductionMs })
  }

  return deductions.sort((a, b) => new Date(a.jour).getTime() - new Date(b.jour).getTime())
}

export function formatHeures(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

export interface CreneauAvecDeplacement extends Creneau {
  deplacementMs: number
}

export interface ResumeOuvrier {
  ouvrierId: string
  nom: string
  totalTravailBrutMs: number
  totalPauseMs: number
  totalDeplacementMs: number
  creneaux: CreneauAvecDeplacement[]
  deductions: DeductionPauseMidi[]
  /** Arrivées jamais suivies d'un départ (hors journée en cours aujourd'hui) : non comptées. */
  arriveesSansDepart: Pointage[]
}

export function arriveesSansDepart(pointagesTries: Pointage[]): Pointage[] {
  const manquants: Pointage[] = []
  let ouverte: Pointage | null = null
  for (const p of pointagesTries) {
    if (p.type === 'arrivee') {
      if (ouverte) manquants.push(ouverte)
      ouverte = p
    } else if (p.type === 'depart') {
      ouverte = null
    }
  }
  if (ouverte && new Date(ouverte.heure_appareil).toDateString() !== new Date().toDateString()) {
    manquants.push(ouverte)
  }
  return manquants
}

/**
 * Construit le résumé complet d'un ouvrier (créneaux + déplacement + pause
 * midi) pour une période donnée. Logique centralisée ici pour que la page
 * "Heures" et la fiche PDF individuelle affichent toujours les mêmes
 * chiffres.
 */
export function construireResumeOuvrier(
  ouvrierId: string,
  nom: string,
  pointagesTries: Pointage[],
  chantiersMap: Map<string, Pick<Chantier, 'latitude' | 'longitude'>>
): ResumeOuvrier {
  const creneauxBruts = calculerCreneaux(pointagesTries)

  // Le forfait déplacement (depuis le bureau) ne s'applique qu'à la toute
  // première arrivée de chaque jour, hors-zone ou pas — un seul "slot" par
  // jour. Si cette première arrivée est hors zone, le forfait du jour est
  // simplement perdu (pas de forfait), il ne se reporte pas sur une
  // arrivée suivante.
  const joursAvecForfait = new Set<string>()
  const creneaux: CreneauAvecDeplacement[] = creneauxBruts.map((c) => {
    const jour = new Date(c.debut).toDateString()
    const premierDuJour = !joursAvecForfait.has(jour)
    joursAvecForfait.add(jour)
    const deplacementMs =
      premierDuJour && !c.arriveeHorsZone ? tempsDeplacementMs(chantiersMap.get(c.chantier_id)) : 0
    return { ...c, deplacementMs }
  })

  const deductions = calculerDeductionsPauseMidi(creneauxBruts)
  const totalTravailBrutMs = creneaux.reduce((s, c) => s + c.dureeMs, 0)
  const totalPauseMs = deductions.reduce((s, d) => s + d.deductionMs, 0)
  const totalDeplacementMs = creneaux.reduce((s, c) => s + c.deplacementMs, 0)

  return {
    ouvrierId,
    nom,
    totalTravailBrutMs,
    totalPauseMs,
    totalDeplacementMs,
    creneaux,
    deductions,
    arriveesSansDepart: arriveesSansDepart(pointagesTries),
  }
}
