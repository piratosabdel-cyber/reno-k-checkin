import { distanceMetres } from './geo'
import type { Chantier, Pointage } from '../types/database'

/** Bureau Reno-K — Z.5 Mollem 44, 1730 Asse. Sert de point de référence pour le forfait déplacement. */
export const BUREAU = { lat: 50.916299, lng: 4.21763 }

/**
 * Forfait déplacement "aller" payé pour un chantier donné, en fonction de sa
 * distance au bureau : 15 min si < 10 km, 30 min si >= 10 km. Retourne 0 si
 * le chantier n'a pas de coordonnées GPS renseignées (impossible à calculer).
 */
export function tempsDeplacementMs(chantier: Pick<Chantier, 'latitude' | 'longitude'> | undefined | null): number {
  if (!chantier?.latitude || !chantier?.longitude) return 0
  const distanceKm = distanceMetres(BUREAU.lat, BUREAU.lng, chantier.latitude, chantier.longitude) / 1000
  const minutes = distanceKm < 10 ? 15 : 30
  return minutes * 60000
}

export interface Creneau {
  ouvrier_id: string
  chantier_id: string
  debut: string
  fin: string
  dureeMs: number
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
