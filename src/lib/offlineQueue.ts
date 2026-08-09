import { openDB, type DBSchema } from 'idb'
import type { TypePointage } from '../types/database'

/** Un pointage tel qu'il est stocké sur le téléphone avant synchro. */
export interface PointageEnAttente {
  client_uuid: string
  ouvrier_id: string
  chantier_id: string
  type: TypePointage
  heure_appareil: string
  latitude: number | null
  longitude: number | null
  precision_gps_m: number | null
  distance_chantier_m: number | null
  hors_zone: boolean
  justification: string | null
  statut: 'accepte' | 'hors_zone'
  modele_telephone: string | null
}

interface RenoKDB extends DBSchema {
  pointages_en_attente: {
    key: string // client_uuid
    value: PointageEnAttente
  }
}

const dbPromise = openDB<RenoKDB>('reno-k-checkin', 1, {
  upgrade(db) {
    db.createObjectStore('pointages_en_attente', { keyPath: 'client_uuid' })
  },
})

export async function ajouterALaFile(pointage: PointageEnAttente) {
  const db = await dbPromise
  await db.put('pointages_en_attente', pointage)
}

export async function listerFile(ouvrierId: string): Promise<PointageEnAttente[]> {
  const db = await dbPromise
  const tous = await db.getAll('pointages_en_attente')
  return tous.filter((p) => p.ouvrier_id === ouvrierId)
}

export async function retirerDeLaFile(clientUuid: string) {
  const db = await dbPromise
  await db.delete('pointages_en_attente', clientUuid)
}

export async function compterFile(ouvrierId: string): Promise<number> {
  const items = await listerFile(ouvrierId)
  return items.length
}
