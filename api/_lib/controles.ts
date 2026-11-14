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
/** Plage des km de travail : de 6 h à 18 h (prolongée jusqu'au départ pointé s'il est plus tard). */
const HEURE_DEBUT_TRAVAIL = 6
const HEURE_FIN_TRAVAIL = 18

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
  km_quarts: number[] | null
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
    .select('vehicule_id, jour, km, points, premier_mouvement, dernier_mouvement, km_quarts')
    .gte('jour', jours[0])
    .lte('jour', jours[jours.length - 1])

  // Pointages du mois (arrivées et départs), lus par pages de 1000.
  const debutUnix = minuitBruxelles(jours[0])
  const finUnix = minuitBruxelles(jourSuivant(jours[jours.length - 1]))
  const pointages: { ouvrier_id: string; type: string; heure_appareil: string }[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from('pointages')
      .select('ouvrier_id, type, heure_appareil')
      .in('type', ['arrivee', 'depart'])
      .gte('heure_appareil', new Date(debutUnix * 1000).toISOString())
      .lt('heure_appareil', new Date(finUnix * 1000).toISOString())
      .order('heure_appareil')
      .range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(`Lecture des pointages : ${error.message}`)
    pointages.push(...((data ?? []) as typeof pointages))
    if (!data || data.length < 1000) break
  }
  const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU })
  const fmtHeure = new Intl.DateTimeFormat('en-GB', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  // Jours prestés par ouvrier, et heure (minutes depuis minuit) de son dernier départ ce jour-là.
  const pointe = new Set<string>()
  const dernierDepart = new Map<string, number>()
  for (const p of pointages) {
    const d = new Date(p.heure_appareil)
    const cle = `${p.ouvrier_id}|${fmtDate.format(d)}`
    if (p.type === 'arrivee') pointe.add(cle)
    else {
      const [h, m] = fmtHeure.format(d).split(':').map(Number)
      dernierDepart.set(cle, Math.max(dernierDepart.get(cle) ?? 0, h * 60 + m))
    }
  }

  const controles: Controle[] = []
  const moisDate = `${mois}-01`
  const repartition: { vehicule_id: string; jour: string; km_travail: number | null; km_hors_travail: number | null }[] = []

  for (const v of (vehicules ?? []) as Vehicule[]) {
    const parJour = new Map<string, KmJour>()
    for (const k of (kms ?? []) as KmJour[]) if (k.vehicule_id === v.id) parJour.set(k.jour, { ...k, km: Number(k.km) })
    const ajouter = (jour: string | null, type: string, gravite: Controle['gravite'], message: string) =>
      controles.push({ mois: moisDate, vehicule_id: v.id, jour, type, gravite, message })

    // 0. Km de travail / km hors travail.
    //    Travail = de 06:00 à 18:00, uniquement les jours où le chauffeur a pointé ;
    //    si son dernier départ est après 18:00, le travail va jusqu'à ce départ.
    //    Tout le reste (avant 6 h, après 18 h ou après le départ, jours non prestés) = hors travail.
    let horsMois = 0
    let horsJoursNonPrestes = 0
    let joursNonPrestesRoules = 0
    for (const j of jours) {
      const k = parJour.get(j)
      if (!k) continue
      if (!v.ouvrier_id || !k.km_quarts) {
        repartition.push({ vehicule_id: v.id, jour: j, km_travail: null, km_hors_travail: null })
        continue
      }
      const cle = `${v.ouvrier_id}|${j}`
      let travail = 0
      if (pointe.has(cle)) {
        const depart = dernierDepart.get(cle) ?? 0
        const finQuart = depart > HEURE_FIN_TRAVAIL * 60 ? Math.min(96, Math.ceil(depart / 15)) : HEURE_FIN_TRAVAIL * 4
        for (let q = HEURE_DEBUT_TRAVAIL * 4; q < finQuart; q++) travail += Number(k.km_quarts[q] ?? 0)
      } else if (k.km >= KM_ROULE) {
        joursNonPrestesRoules++
        horsJoursNonPrestes += k.km
      }
      travail = Math.min(k.km, Math.round(travail * 10) / 10)
      const hors = Math.round((k.km - travail) * 10) / 10
      horsMois += hors
      repartition.push({ vehicule_id: v.id, jour: j, km_travail: travail, km_hors_travail: hors })
    }
    if (v.ouvrier_id && horsMois >= KM_ROULE)
      ajouter(
        null,
        'km_hors_travail',
        'attention',
        `${Math.round(horsMois)} km hors travail ce mois-ci` +
          (joursNonPrestesRoules
            ? `, dont ${Math.round(horsJoursNonPrestes)} km sur ${joursNonPrestesRoules} jour(s) non presté(s).`
            : '.')
      )

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
        ajouter(j, 'samedi_sans_pointage', 'attention', `${k.km} km le ${fmtJour(j)} sans pointage du chauffeur.`)
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

  for (let i = 0; i < repartition.length; i += 500) {
    const { error } = await db
      .from('vehicules_km_jour')
      .upsert(repartition.slice(i, i + 500), { onConflict: 'vehicule_id,jour' })
    if (error) throw new Error(`Enregistrement km travail / hors travail : ${error.message}`)
  }

  await db.from('vehicules_controles').delete().eq('mois', moisDate)
  if (controles.length) {
    const { error } = await db.from('vehicules_controles').insert(controles)
    if (error) throw new Error(`Enregistrement des contrôles : ${error.message}`)
  }
  return controles
}
