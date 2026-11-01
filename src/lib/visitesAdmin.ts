import { supabase } from './supabase'
import { LABEL_RESULTAT, LABEL_TYPE } from './visites'
import type { VisiteAvecRelations } from '../types/database'

export const SELECT_VISITE =
  '*, commerce:commerces(id, nom, commune, type, statut, latitude, longitude), commercial:profiles(id, full_name), alertes:visites_alertes(code, detail)'

/** Liens temporaires (1 h) vers les photos privées. */
export async function liensPhotos(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data } = await supabase.storage.from('visites-photos').createSignedUrls(paths, 3600)
  const out: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
}

export function heure(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })
}

export function dateCourte(iso: string) {
  return new Date(iso).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Durée approximative de la visite : ouverture du formulaire → envoi. */
export function duree(v: Pick<VisiteAvecRelations, 'heure_ouverture' | 'heure_appareil'>): string {
  if (!v.heure_ouverture) return '—'
  const min = Math.round((new Date(v.heure_appareil).getTime() - new Date(v.heure_ouverture).getTime()) / 60000)
  if (min < 1) return '< 1 min'
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

export function lienDrive(id: string | null) {
  return id ? `https://drive.google.com/drive/folders/${id}` : null
}

export function lienCarte(lat: number | null, lng: number | null) {
  return lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null
}

export function telechargerCsv(nomFichier: string, header: string[], lignes: (string | number | null)[][]) {
  const csv = [header, ...lignes]
    .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}

export function exporterVisites(visites: VisiteAvecRelations[], nomFichier: string) {
  telechargerCsv(
    nomFichier,
    [
      'Date',
      'Heure serveur',
      'Ouverture formulaire',
      'Envoi (tablette)',
      'Durée',
      'Commerciale',
      'Commerce',
      'Commune',
      'Type',
      'Résultat',
      'Plateaux',
      'Palettes',
      'Relance',
      'Contact',
      'Fonction',
      'Téléphone',
      'E-mail',
      'Remarques',
      'Commentaire',
      'Latitude',
      'Longitude',
      'Précision (m)',
      'Adresse GPS',
      'Différée',
      'Alertes',
    ],
    visites.map((v) => [
      new Date(v.heure_serveur).toLocaleDateString('fr-BE'),
      heure(v.heure_serveur),
      heure(v.heure_ouverture),
      heure(v.heure_appareil),
      duree(v),
      v.commercial?.full_name ?? '',
      v.commerce?.nom ?? '',
      v.commerce?.commune ?? '',
      LABEL_TYPE[v.type_commerce ?? v.commerce?.type ?? 'autre'],
      LABEL_RESULTAT[v.resultat],
      v.plateaux,
      v.palettes,
      v.date_relance,
      v.contact_nom,
      v.contact_fonction,
      v.contact_telephone,
      v.contact_email,
      (v.remarques ?? []).join(' / '),
      v.commentaire,
      v.lat_envoi ?? v.lat_ouverture,
      v.lng_envoi ?? v.lng_ouverture,
      v.precision_envoi_m != null ? Math.round(v.precision_envoi_m) : null,
      v.adresse_gps,
      v.synchro_differee ? 'oui' : 'non',
      v.alertes.map((a) => a.detail).join(' / '),
    ])
  )
}
