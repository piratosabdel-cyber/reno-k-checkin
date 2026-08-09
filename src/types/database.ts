export type Role = 'admin' | 'ouvrier'
export type ChantierStatut = 'actif' | 'termine'
export type ModeHorsZone = 'bloquer' | 'justifier'
export type TypePointage = 'arrivee' | 'pause_debut' | 'pause_fin' | 'depart'
export type StatutPointage = 'accepte' | 'hors_zone' | 'corrige' | 'en_attente'

export interface Profile {
  id: string
  full_name: string
  role: Role
  phone: string | null
  email: string | null
  active: boolean
  created_at: string
}

export interface Chantier {
  id: string
  nom: string
  adresse: string
  client: string | null
  latitude: number | null
  longitude: number | null
  rayon_metres: number
  mode_hors_zone: ModeHorsZone
  date_debut: string | null
  date_fin: string | null
  statut: ChantierStatut
  created_at: string
}

export interface ChantierAssignment {
  id: string
  chantier_id: string
  ouvrier_id: string
  created_at: string
}

export interface Pointage {
  id: string
  client_uuid: string
  ouvrier_id: string
  chantier_id: string
  type: TypePointage
  heure_appareil: string
  heure_serveur: string
  latitude: number | null
  longitude: number | null
  precision_gps_m: number | null
  distance_chantier_m: number | null
  hors_zone: boolean
  justification: string | null
  statut: StatutPointage
  modele_telephone: string | null
  cree_hors_ligne: boolean
  created_at: string
}

export interface PointageWithRelations extends Pointage {
  ouvrier: Pick<Profile, 'id' | 'full_name'>
  chantier: Pick<Chantier, 'id' | 'nom'>
}

export interface ParametresApp {
  id: number
  app_active: boolean
  updated_at: string
}
