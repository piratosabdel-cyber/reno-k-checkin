export type Role = 'admin' | 'ouvrier' | 'commercial'
export type ChantierStatut = 'actif' | 'termine' | 'en_attente' | 'refuse'
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
  propose_par: string | null
  date_decision: string | null
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

// ---------------------------------------------------------------------------
// Module visites commerciales (Adala)
// ---------------------------------------------------------------------------

export type TypeCommerce =
  | 'epicerie'
  | 'superette'
  | 'night_shop'
  | 'snack'
  | 'boucherie'
  | 'restaurant'
  | 'cafe_chicha'
  | 'catering'
  | 'grossiste'
  | 'supermarche'
  | 'autre'

export type ResultatVisite = 'interesse' | 'precommande' | 'echantillon' | 'a_revoir' | 'refus' | 'absent'
export type StatutCommerce = 'prospect' | 'client' | 'refus'

export interface Commerce {
  id: string
  nom: string
  adresse: string | null
  commune: string | null
  type: TypeCommerce
  latitude: number | null
  longitude: number | null
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
  adresse_livraison: string | null
  adresse_facturation: string | null
  numero_entreprise: string | null
  numero_tva: string | null
  reseau_social: string | null
  statut: StatutCommerce
  cree_par: string | null
  drive_dossier_id: string | null
  created_at: string
  updated_at: string
}

export interface Visite {
  id: string
  client_uuid: string
  commercial_id: string
  commerce_id: string
  type_commerce: TypeCommerce | null
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
  adresse_livraison: string | null
  adresse_facturation: string | null
  numero_entreprise: string | null
  numero_tva: string | null
  reseau_social: string | null
  resultat: ResultatVisite
  plateaux: number | null
  palettes: number | null
  date_relance: string | null
  remarques: string[]
  commentaire: string | null
  a_completer: boolean
  lat_ouverture: number | null
  lng_ouverture: number | null
  precision_ouverture_m: number | null
  lat_envoi: number | null
  lng_envoi: number | null
  precision_envoi_m: number | null
  adresse_gps: string | null
  heure_ouverture: string | null
  heure_appareil: string
  heure_serveur: string
  photo_path: string
  photo_prise_a: string | null
  synchro_differee: boolean
  modifiee_le: string | null
  appareil_id: string | null
  modele_appareil: string | null
  drive_dossier_id: string | null
  drive_archive_at: string | null
  drive_erreur: string | null
  created_at: string
}

export interface VisiteAlerte {
  id: string
  visite_id: string
  code: string
  detail: string
  created_at: string
}

export interface VisiteAvecRelations extends Visite {
  commerce: Pick<Commerce, 'id' | 'nom' | 'commune' | 'type' | 'statut' | 'latitude' | 'longitude'>
  commercial: Pick<Profile, 'id' | 'full_name'>
  alertes: Pick<VisiteAlerte, 'code' | 'detail'>[]
}
