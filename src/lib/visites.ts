import type { ResultatVisite, StatutCommerce, TypeCommerce } from '../types/database'

export const TYPES_COMMERCE: { valeur: TypeCommerce; label: string; nl: string; emoji: string }[] = [
  { valeur: 'epicerie', nl: 'Kruidenier', label: 'Épicerie', emoji: '🛒' },
  { valeur: 'superette', nl: 'Buurtwinkel', label: 'Supérette', emoji: '🏪' },
  { valeur: 'night_shop', nl: 'Nachtwinkel', label: 'Night shop', emoji: '🌙' },
  { valeur: 'snack', nl: 'Snackbar', label: 'Snack', emoji: '🥙' },
  { valeur: 'boucherie', nl: 'Slagerij', label: 'Boucherie', emoji: '🥩' },
  { valeur: 'restaurant', nl: 'Restaurant', label: 'Restaurant', emoji: '🍽️' },
  { valeur: 'cafe_chicha', nl: 'Café / shisha', label: 'Café / chicha', emoji: '☕' },
  { valeur: 'catering', nl: 'Catering', label: 'Catering', emoji: '🍱' },
  { valeur: 'grossiste', nl: 'Verdeler / groothandel', label: 'Distributeur / grossiste', emoji: '🚚' },
  { valeur: 'supermarche', nl: 'Supermarkt', label: 'Supermarché', emoji: '🏬' },
  { valeur: 'autre', nl: 'Andere', label: 'Autre', emoji: '📍' },
]

export const LABEL_TYPE: Record<TypeCommerce, string> = Object.fromEntries(
  TYPES_COMMERCE.map((t) => [t.valeur, t.label])
) as Record<TypeCommerce, string>

export const RESULTATS: { valeur: ResultatVisite; label: string; nl: string; couleur: string }[] = [
  { valeur: 'precommande', nl: 'Voorbestelling', label: 'Précommande', couleur: 'bg-emerald-600 text-white border-emerald-600' },
  { valeur: 'interesse', nl: 'Geïnteresseerd', label: 'Intéressé', couleur: 'bg-sky-600 text-white border-sky-600' },
  { valeur: 'echantillon', nl: 'Staal achtergelaten', label: 'Échantillon déposé', couleur: 'bg-violet-600 text-white border-violet-600' },
  { valeur: 'a_revoir', nl: 'Opnieuw bezoeken', label: 'À revoir', couleur: 'bg-amber-500 text-white border-amber-500' },
  { valeur: 'refus', nl: 'Weigering', label: 'Refus', couleur: 'bg-red-600 text-white border-red-600' },
  { valeur: 'absent', nl: 'Afwezig / gesloten', label: 'Absent / fermé', couleur: 'bg-slate-600 text-white border-slate-600' },
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

/** Libellés néerlandais (l'app commerciale peut être en NL). */
export const LABEL_TYPE_NL: Record<TypeCommerce, string> = Object.fromEntries(
  TYPES_COMMERCE.map((t) => [t.valeur, t.nl])
) as Record<TypeCommerce, string>

export const LABEL_RESULTAT_NL: Record<ResultatVisite, string> = Object.fromEntries(
  RESULTATS.map((r) => [r.valeur, r.nl])
) as Record<ResultatVisite, string>

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

/**
 * Les remarques et fonctions sont enregistrées en français (admin, mail,
 * Drive) ; seul l'affichage passe en néerlandais.
 */
export const NL: Record<string, string> = {
  Gérant: 'Zaakvoerder',
  Propriétaire: 'Eigenaar',
  Employé: 'Werknemer',
  'Responsable achats': 'Aankoopverantwoordelijke',
  'Prix trop élevé': 'Prijs te hoog',
  'Veut un présentoir / frigo': 'Wil een display / koelkast',
  'Veut goûter d’abord': 'Wil eerst proeven',
  'Rappeler le gérant': 'Zaakvoerder terugbellen',
  'Déjà un fournisseur cola': 'Heeft al een colaleverancier',
  'Bon emplacement en vitrine': 'Goede plaats in de etalage',
  'Intéressé par les canettes': 'Interesse in blikjes',
  'Intéressé par les bouteilles PET': 'Interesse in PET-flessen',
  'Intéressé par le verre': 'Interesse in glas',
  'Paiement à la livraison': 'Betaling bij levering',
}

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
