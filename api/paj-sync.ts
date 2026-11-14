import { roleAppelant, supabaseAdmin, type VercelRequest, type VercelResponse } from './_lib/serveur.js'
import {
  aujourdhuiBruxelles,
  heureBruxelles,
  jourSuivant,
  minuitBruxelles,
  pajDevices,
  pajLogin,
  pajPoints,
  resumerJour,
} from './_lib/paj.js'
import { calculerControles } from './_lib/controles.js'

// Synchronise les km GPS PAJ d'un mois puis recalcule les incohérences.
//  - à la demande : bouton « Lancer le contrôle » de la page admin Véhicules (POST, admin connecté) ;
//  - automatiquement : cron Vercel le 2 de chaque mois pour le mois précédent (GET + CRON_SECRET).
// Une relance reprend là où la précédente s'est arrêtée (jours déjà complets non retéléchargés).

const BUDGET_MS = 270_000 // marge sous la limite de 300 s de Vercel
const PARALLELE = 6

function moisPrecedent(): string {
  const [a, m] = aujourdhuiBruxelles().split('-').map(Number)
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const depart = Date.now()

  // --- Qui appelle ? -------------------------------------------------------
  const secret = process.env.CRON_SECRET
  const estCron = req.method === 'GET' && !!secret && req.headers.authorization === `Bearer ${secret}`
  let lancePar: string | null = null
  if (!estCron) {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Méthode non autorisée' })
      return
    }
    const appelant = await roleAppelant(req)
    if (appelant?.role !== 'admin') {
      res.status(403).json({ error: 'Réservé aux administrateurs.' })
      return
    }
    lancePar = appelant.id
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as { mois?: string }
  const mois = estCron ? moisPrecedent() : body.mois
  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) {
    res.status(400).json({ error: 'Mois attendu au format AAAA-MM.' })
    return
  }

  const db = supabaseAdmin()
  const { data: synchro } = await db
    .from('vehicules_synchros')
    .insert({ mois: `${mois}-01`, origine: estCron ? 'automatique' : 'manuel', lance_par: lancePar })
    .select('id')
    .single()
  const terminer = async (statut: 'ok' | 'erreur', message: string) => {
    if (synchro) await db.from('vehicules_synchros').update({ statut, message, fin: new Date().toISOString() }).eq('id', synchro.id)
  }

  try {
    // --- Jours à traiter : tout le mois, jusqu'à hier au plus tard ----------
    const hier = (() => {
      const t = aujourdhuiBruxelles()
      const [a, m, j] = t.split('-').map(Number)
      return new Date(Date.UTC(a, m - 1, j - 1)).toISOString().slice(0, 10)
    })()
    const jours: string[] = []
    for (let j = `${mois}-01`; j.startsWith(mois) && j <= hier; j = jourSuivant(j)) jours.push(j)
    if (jours.length === 0) {
      await terminer('erreur', 'Ce mois n’a pas encore commencé.')
      res.status(400).json({ error: 'Ce mois n’a pas encore commencé.' })
      return
    }

    // --- Connexion PAJ et liste des traceurs -------------------------------
    const token = await pajLogin()
    const devices = await pajDevices(token)
    if (devices.length) {
      await db.from('vehicules').upsert(
        devices.map((d) => ({ paj_device_id: d.id, paj_imei: d.imei, nom: d.name })),
        { onConflict: 'paj_device_id', ignoreDuplicates: true }
      )
    }
    const { data: vehicules } = await db.from('vehicules').select('id, paj_device_id').eq('actif', true)

    // Jours déjà complets (enregistrés après la fin de la journée) : on ne les retélécharge pas.
    const { data: deja } = await db
      .from('vehicules_km_jour')
      .select('vehicule_id, jour, maj_le, a_quarts:km_quarts')
      .gte('jour', jours[0])
      .lte('jour', jours[jours.length - 1])
    const complet = new Set(
      (deja ?? [])
        .filter(
          (d) =>
            d.a_quarts != null &&
            new Date(d.maj_le as string).getTime() / 1000 >= minuitBruxelles(jourSuivant(d.jour as string))
        )
        .map((d) => `${d.vehicule_id}|${d.jour}`)
    )

    const taches: { vehiculeId: string; deviceId: number; jour: string }[] = []
    for (const v of vehicules ?? [])
      for (const jour of jours)
        if (!complet.has(`${v.id}|${jour}`)) taches.push({ vehiculeId: v.id, deviceId: v.paj_device_id, jour })

    // --- Téléchargement + calcul, 6 en parallèle ----------------------------
    let faits = 0
    let interrompu = false
    const erreurs: string[] = []
    let i = 0
    const travailleur = async () => {
      while (i < taches.length) {
        if (Date.now() - depart > BUDGET_MS) {
          interrompu = true
          return
        }
        const t = taches[i++]
        try {
          const debut = minuitBruxelles(t.jour)
          const fin = minuitBruxelles(jourSuivant(t.jour)) - 1
          const { points, distancePaj } = await pajPoints(token, t.deviceId, debut, fin)
          const r = resumerJour(points)
          const { error } = await db.from('vehicules_km_jour').upsert({
            vehicule_id: t.vehiculeId,
            jour: t.jour,
            km: r.km,
            km_paj: distancePaj,
            points: r.points,
            km_quarts: r.kmQuarts,
            premier_mouvement: r.premier ? heureBruxelles(r.premier.dateunix) : null,
            dernier_mouvement: r.dernier ? heureBruxelles(r.dernier.dateunix) : null,
            depart_lat: r.premier?.lat ?? null,
            depart_lng: r.premier?.lng ?? null,
            arrivee_lat: r.dernier?.lat ?? null,
            arrivee_lng: r.dernier?.lng ?? null,
            maj_le: new Date().toISOString(),
          })
          if (error) throw new Error(error.message)
          faits++
        } catch (e) {
          erreurs.push(`${t.jour} : ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLELE }, travailleur))

    // --- Contrôles ---------------------------------------------------------
    const controles = await calculerControles(db, mois, jours[jours.length - 1])

    const message = interrompu
      ? `Partiel : ${faits} journées téléchargées sur ${taches.length}. Relancer pour terminer.`
      : `${faits} journées téléchargées, ${controles.length} points de contrôle.` +
        (erreurs.length ? ` ${erreurs.length} erreur(s) : ${erreurs.slice(0, 3).join(' ; ')}` : '')
    await terminer(interrompu || erreurs.length ? 'erreur' : 'ok', message)
    res.status(200).json({ ok: !interrompu, partiel: interrompu, message, controles: controles.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await terminer('erreur', message)
    res.status(500).json({ error: message })
  }
}
