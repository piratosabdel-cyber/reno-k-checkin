export type Role = 'admin' | 'ouvrier'
export type ChantierStatut = 'actif' | 'termine'

export interface Profile {
  id: string
  full_name: string
  role: Role
  phone: string | null
  active: boolean
  created_at: string
}

export interface Chantier {
  id: string
  nom: string
  adresse: string
  latitude: number | null
  longitude: number | null
  rayon_metres: number
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
  ouvrier_id: string
  chantier_id: string
  check_in_at: string
  check_in_lat: number | null
  check_in_lng: number | null
  check_in_distance_m: number | null
  check_out_at: string | null
  check_out_lat: number | null
  check_out_lng: number | null
  created_at: string
}

export interface PointageWithRelations extends Pointage {
  ouvrier: Pick<Profile, 'id' | 'full_name'>
  chantier: Pick<Chantier, 'id' | 'nom'>
}
