import type { SupabaseClient } from '@supabase/supabase-js'
import { FUSEAU, jourSuivant, minuitBruxelles } from './paj.js'

// Règles de contrôle mensuel des véhicules. Chaque règle produit des lignes
// dans vehicules_controles ; le mois est entièrement recalculé à chaque fois.

/** Seuils (km) : en dessous, on considère que le véhicule n'a pas vraiment roulé. */
const KM_ROULE = 10
const KM_SANS_POINTAGE = 20
const KM_JOURNEE_LONGUE = 250
const HEURE_TOT = '05:00'
const HEURE_TARD = '22:00'

interface Vehicule {
  id: string
  nom: string
  ouvrier_id: string | null
}

interface KmJour {
  vehicule_id: string
  jour: string
  km: number
  points: number
  premier_mouvement: string | null
  dernier_mouvement: string | null
}

export interface Controle {
  mois: string
  vehicule_id: string
  jour: string | null
  type: string
  gravite: 'info' | 'attention' | 'alerte'
  message: string
}

const fmtJour = (jour: string) =>
  new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${jour}T12:00:00Z`)
  )

const jourSemaine = (jour: string) => new Date(`${jour}T12:00:00Z`).getUTCDay() // 0 = dimanche

function joursDuMois(mois: string, jusqua: string): string[] {
  const out: string[] = []
  for (let j = `${mois}-01`; j.startsWith(mois) && j <= jusqua; j = jourSuivant(j)) out.push(j)
  return out
}

export async function calculerControles(
  db: SupabaseClient,
  mois: string, // "YYYY-MM"
  dernierJour: string // dernier jour synchronisé (inclus)
): Promise<Controle[]> {
  const jours = joursDuMois(mois, dernierJour)
  if (jours.length === 0) return []

  const { data: vehicules } = await db.from('vehicules').select('id, nom, ouvrier_id').eq('actif', true)
  const { data: kms } = await db
    .from('vehicules_km_jour')
    .select('vehicule_id, jour, km, points, premier_mouvement, dernier_mouvement')
    .gte('jour', jours[0])
    .lte('jour', jours[jours.length - 1])

  // Jours où chaque ouvrier a pointé une arrivée (heure de Bruxelles).
  const debutUnix = minuitBruxelles(jours[0])
  const finUnix = minuitBruxelles(jourSuivant(jours[jours.length - 1]))
  const { data: pointages } = await db
    .from('pointages')
    .select('ouvrier_id, heure_appareil')
    .eq('type', 'arrivee')
    .gte('heure_appareil', new Date(debutUnix * 1000).toISOString())
    .lt('heure_appareil', new Date(finUnix * 1000).toISOString())
  const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU })
  const pointe = new Set(
    (pointages ?? []).map((p) => `${p.ouvrier_id}|${fmtDate.format(new Date(p.heure_appareil as string))}`)
  )

  const controles: Controle[] = []
  const moisDate = `${mois}-01`

  for (const v of (vehicules ?? []) as Vehicule[]) {
    const parJour = new Map<string, KmJour>()
    for (const k of (kms ?? []) as KmJour[]) if (k.vehicule_id === v.id) parJour.set(k.jour, { ...k, km: Number(k.km) })
    const ajouter = (jour: string | null, type: string, gravite: Controle['gravite'], message: string) =>
      controles.push({ mois: moisDate, vehicule_id: v.id, jour, type, gravite, message })

    // 1. Traceur muet : aucune position reçue pendant 2 jours ou plus d'affilée.
    let debutSilence: string | null = null
    let finSilence: string | null = null
    const fermerSilence = () => {
      if (debutSilence && finSilence && debutSilence !== finSilence) {
        const tout = debutSilence === jours[0] && finSilence === jours[jours.length - 1]
        ajouter(
          debutSilence,
          'traceur_muet',
          'alerte',
          tout
            ? "Le traceur n'a envoyé aucune position de tout le mois : débranché, sans batterie ou retiré ?"
            : `Le traceur n'a envoyé aucune position du ${fmtJour(debutSilence)} au ${fmtJour(finSilence)}.`
        )
      }
      debutSilence = finSilence = null
    }
    for (const j of jours) {
      const k = parJour.get(j)
      if (!k || k.points === 0) {
        debutSilence ??= j
        finSilence = j
      } else fermerSilence()
    }
    fermerSilence()

    // Médiane des jours roulés, pour repérer les journées anormales.
    const roules = jours.map((j) => parJour.get(j)?.km ?? 0).filter((km) => km >= KM_ROULE).sort((a, b) => a - b)
    const mediane = roules.length ? roules[Math.floor(roules.length / 2)] : 0
    const seuilLong = Math.max(KM_JOURNEE_LONGUE, mediane * 2.5)

    for (const j of jours) {
      const k = parJour.get(j)
      if (!k || k.km < KM_ROULE) continue
      const js = jourSemaine(j)
      const aPointe = v.ouvrier_id ? pointe.has(`${v.ouvrier_id}|${j}`) : null

      // 2. Dimanche.
      if (js === 0) ajouter(j, 'dimanche', 'attention', `${k.km} km un dimanche (${fmtJour(j)}).`)
      // 3. Samedi sans pointage.
      else if (js === 6 && aPointe === false)
        ajouter(j, 'samedi_sans_pointage', 'attention', `${k.km} km le samedi ${fmtJour(j)} sans pointage du chauffeur.`)
      // 4. Jour de semaine : km sans pointage du chauffeur.
      else if (js !== 6 && aPointe === false && k.km >= KM_SANS_POINTAGE)
        ajouter(j, 'km_sans_pointage', 'attention', `${k.km} km le ${fmtJour(j)} alors que le chauffeur n'a pas pointé.`)

      // 5. Journée anormalement longue.
      if (k.km > seuilLong)
        ajouter(
          j,
          'journee_longue',
          'attention',
          `${k.km} km le ${fmtJour(j)} (habituellement ~${Math.round(mediane)} km/jour).`
        )

      // 6. Déplacements très tôt ou très tard.
      if ((k.premier_mouvement && k.premier_mouvement < HEURE_TOT) || (k.dernier_mouvement && k.dernier_mouvement > HEURE_TARD))
        ajouter(
          j,
          'horaire',
          'info',
          `Roule entre ${k.premier_mouvement} et ${k.dernier_mouvement} le ${fmtJour(j)} (avant ${HEURE_TOT} ou après ${HEURE_TARD}).`
        )
    }

    if (!v.ouvrier_id)
      ajouter(null, 'sans_chauffeur', 'info', "Aucun chauffeur lié à ce véhicule : le contrôle avec les pointages n'est pas fait.")
  }

  await db.from('vehicules_controles').delete().eq('mois', moisDate)
  if (controles.length) {
    const { error } = await db.from('vehicules_controles').insert(controles)
    if (error) throw new Error(`Enregistrement des contrôles : ${error.message}`)
  }
  return controles
}
