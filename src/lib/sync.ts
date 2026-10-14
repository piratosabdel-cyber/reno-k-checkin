import { supabase } from './supabase'
import { ajouterALaFile, listerFile, retirerDeLaFile, type PointageEnAttente } from './offlineQueue'

/**
 * Une erreur renvoyée par le serveur (règle de sécurité, contrainte...) porte
 * un code Postgres/PostgREST. Une coupure réseau n'en a pas.
 */
export function estRefusServeur(error: { code?: string } | null): boolean {
  return !!error?.code
}

/** Traduit un refus du serveur en phrase compréhensible. */
export function raisonRefus(error: { code?: string; message?: string }): string {
  if (error.code === '42501') return 'refusé par une règle de sécurité (compte bloqué ?)'
  if (error.code === '23503') return 'chantier introuvable sur le serveur'
  if (error.code === '23514') return 'donnée refusée par la base'
  return `erreur serveur ${error.code ?? ''}`.trim()
}

/**
 * Signale à l'admin qu'un pointage a été refusé par le serveur (table
 * pointages_echecs). Best-effort : si ça échoue aussi, le pointage reste de
 * toute façon dans la file locale du téléphone.
 */
export async function signalerEchec(p: PointageEnAttente, error: { code?: string; message?: string }) {
  try {
    await supabase.from('pointages_echecs').upsert(
      {
        client_uuid: p.client_uuid,
        ouvrier_id: p.ouvrier_id,
        chantier_id: p.chantier_id,
        type: p.type,
        heure_appareil: p.heure_appareil,
        erreur_code: error.code ?? null,
        erreur_message: error.message ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_uuid' }
    )
  } catch {
    // ignoré
  }
}

/**
 * Envoie les pointages en attente d'un ouvrier vers Supabase.
 * Idempotent : si un pointage a déjà été envoyé (même client_uuid), l'erreur
 * de doublon (23505) est ignorée et le pointage est simplement retiré de la
 * file locale.
 * Un pointage refusé par le serveur reste dans la file (jamais perdu) et est
 * signalé à l'admin ; on passe quand même aux suivants pour qu'il ne bloque
 * pas toute la file.
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
    } else if (estRefusServeur(error)) {
      // Refus du serveur : on garde le pointage, on prévient l'admin, on continue.
      if (p.derniere_erreur !== raisonRefus(error)) {
        await ajouterALaFile({ ...p, derniere_erreur: raisonRefus(error) })
        await signalerEchec(p, error)
      }
    } else {
      // Erreur réseau : on arrête, on réessaiera plus tard.
      break
    }
  }

  const restants = (await listerFile(ouvrierId)).length
  return { envoyes, restants }
}

export type { PointageEnAttente }
