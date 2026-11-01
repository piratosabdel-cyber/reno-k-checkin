import type { ResultatVisite, StatutCommerce, TypeCommerce } from '../types/database'

export const TYPES_COMMERCE: { valeur: TypeCommerce; label: string; emoji: string }[] = [
  { valeur: 'epicerie', label: 'Épicerie', emoji: '🛒' },
  { valeur: 'superette', label: 'Supérette', emoji: '🏪' },
  { valeur: 'night_shop', label: 'Night shop', emoji: '🌙' },
  { valeur: 'snack', label: 'Snack', emoji: '🥙' },
  { valeur: 'boucherie', label: 'Boucherie', emoji: '🥩' },
  { valeur: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { valeur: 'cafe_chicha', label: 'Café / chicha', emoji: '☕' },
  { valeur: 'catering', label: 'Catering', emoji: '🍱' },
  { valeur: 'grossiste', label: 'Distributeur / grossiste', emoji: '🚚' },
  { valeur: 'supermarche', label: 'Supermarché', emoji: '🏬' },
  { valeur: 'autre', label: 'Autre', emoji: '📍' },
]

export const LABEL_TYPE: Record<TypeCommerce, string> = Object.fromEntries(
  TYPES_COMMERCE.map((t) => [t.valeur, t.label])
) as Record<TypeCommerce, string>

export const RESULTATS: { valeur: ResultatVisite; label: string; couleur: string }[] = [
  { valeur: 'precommande', label: 'Précommande', couleur: 'bg-emerald-600 text-white border-emerald-600' },
  { valeur: 'interesse', label: 'Intéressé', couleur: 'bg-sky-600 text-white border-sky-600' },
  { valeur: 'echantillon', label: 'Échantillon déposé', couleur: 'bg-violet-600 text-white border-violet-600' },
  { valeur: 'a_revoir', label: 'À revoir', couleur: 'bg-amber-500 text-white border-amber-500' },
  { valeur: 'refus', label: 'Refus', couleur: 'bg-red-600 text-white border-red-600' },
  { valeur: 'absent', label: 'Absent / fermé', couleur: 'bg-slate-600 text-white border-slate-600' },
]

export const LABEL_RESULTAT: Record<ResultatVisite, string> = Object.fromEntries(
  RESULTATS.map((r) => [r.valeur, r.label])
) as Record<ResultatVisite, string>

export const BADGE_RESULTAT: Record<ResultatVisite, string> = {
  precommande: 'bg-emerald-100 text-emerald-800',
  interesse: 'bg-sky-100 text-sky-800',
  echantillon: 'bg-violet-100 text-violet-800',
  a_revoir: 'bg-amber-100 text-amber-800',
  refus: 'bg-red-100 text-red-800',
  absent: 'bg-slate-200 text-slate-700',
}

export const LABEL_STATUT: Record<StatutCommerce, string> = {
  prospect: 'Prospect',
  client: 'Client',
  refus: 'Refus',
}

export const FONCTIONS_CONTACT = ['Gérant', 'Propriétaire', 'Employé', 'Responsable achats']

/** Phrases toutes faites à cocher au lieu de taper un commentaire. */
export const REMARQUES_RAPIDES = [
  'Prix trop élevé',
  'Veut un présentoir / frigo',
  'Veut goûter d’abord',
  'Rappeler le gérant',
  'Déjà un fournisseur cola',
  'Bon emplacement en vitrine',
  'Intéressé par les canettes',
  'Intéressé par les bouteilles PET',
  'Intéressé par le verre',
  'Paiement à la livraison',
]

export const LABEL_ALERTE: Record<string, string> = {
  sans_gps: 'Sans GPS',
  precision_gps: 'GPS imprécis',
  loin_commerce: 'Loin du commerce',
  deplacement_saisie: 'Déplacée pendant la saisie',
  visites_rapprochees: 'Visites trop rapprochées',
  horloge: 'Heure de la tablette décalée',
}

export const DISTANCE_RECONNAISSANCE_M = 150

/** « instagram.com/x » ou « @x » tapé à la main → lien cliquable. */
export function lienReseau(texte: string): string {
  const t = texte.trim()
  if (/^https?:\/\//i.test(t)) return t
  if (t.startsWith('@')) return `https://www.instagram.com/${t.slice(1)}`
  return `https://${t}`
}

export function dansNJours(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return dateLocale(d)
}

/** AAAA-MM-JJ dans le fuseau du téléphone (et pas en UTC). */
export function dateLocale(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function debutJour(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Lundi 00:00 de la semaine en cours. */
export function debutSemaine(d = new Date()): Date {
  const x = debutJour(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
