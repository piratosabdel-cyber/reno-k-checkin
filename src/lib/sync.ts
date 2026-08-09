import { supabase } from './supabase'
import { listerFile, retirerDeLaFile, type PointageEnAttente } from './offlineQueue'

/**
 * Envoie les pointages en attente d'un ouvrier vers Supabase.
 * Idempotent : si un pointage a déjà été envoyé (même client_uuid), l'erreur
 * de doublon (23505) est ignorée et le pointage est simplement retiré de la
 * file locale.
 */
export async function synchroniser(ouvrierId: string): Promise<{ envoyes: number; restants: number }> {
  const file = await listerFile(ouvrierId)
  let envoyes = 0

  for (const p of file) {
    const { error } = await supabase.from('pointages').insert({
      client_uuid: p.client_uuid,
      ouvrier_id: p.ouvrier_id,
      chantier_id: p.chantier_id,
      type: p.type,
      heure_appareil: p.heure_appareil,
      latitude: p.latitude,
      longitude: p.longitude,
      precision_gps_m: p.precision_gps_m,
      distance_chantier_m: p.distance_chantier_m,
      hors_zone: p.hors_zone,
      justification: p.justification,
      statut: p.statut,
      modele_telephone: p.modele_telephone,
      cree_hors_ligne: true,
    })

    // 23505 = violation de contrainte "unique" (déjà synchronisé une fois) : pas grave, on nettoie juste la file.
    if (!error || error.code === '23505') {
      await retirerDeLaFile(p.client_uuid)
      envoyes++
    } else {
      // Erreur réseau ou autre : on arrête, on réessaiera plus tard.
      break
    }
  }

  const restants = (await listerFile(ouvrierId)).length
  return { envoyes, restants }
}

export type { PointageEnAttente }
