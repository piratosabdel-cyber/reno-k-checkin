// Libellés côté serveur (mêmes valeurs que src/lib/visites.ts).

export const LABEL_TYPE: Record<string, string> = {
  epicerie: 'Épicerie',
  superette: 'Supérette',
  night_shop: 'Night shop',
  snack: 'Snack',
  boucherie: 'Boucherie',
  restaurant: 'Restaurant',
  cafe_chicha: 'Café - chicha',
  catering: 'Catering',
  grossiste: 'Distributeur - grossiste',
  supermarche: 'Supermarché',
  autre: 'Autre',
}

export const LABEL_RESULTAT: Record<string, string> = {
  interesse: 'Intéressé',
  precommande: 'Précommande',
  echantillon: 'Échantillon déposé',
  a_revoir: 'À revoir',
  refus: 'Refus',
  absent: 'Absent - fermé',
}

export const LABEL_STATUT: Record<string, string> = {
  prospect: 'Prospect',
  client: 'Client',
  refus: 'Refus',
}

const FUSEAU = 'Europe/Brussels'

export function dateBxl(iso: string) {
  return new Date(iso).toLocaleDateString('fr-BE', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function heureBxl(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-BE', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit' })
}

/** « 2026-10-31 14h05 » en heure belge, pour nommer les dossiers (tri chronologique). */
export function horodatageDossier(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fr-BE', {
      timeZone: FUSEAU,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}h${parts.minute}`
}

/** Bornes [début, fin[ de la journée belge contenant `d`, en ISO UTC. */
export function journeeBxl(d = new Date()): [string, string] {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU }).format(d) // AAAA-MM-JJ
  // Décalage de Bruxelles à midi ce jour-là (+01:00 ou +02:00).
  const midi = new Date(`${jour}T12:00:00Z`)
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSEAU, hour: '2-digit', hour12: false }).format(midi))
  const decalage = h - 12
  const debut = new Date(`${jour}T00:00:00Z`)
  debut.setUTCHours(debut.getUTCHours() - decalage)
  const fin = new Date(debut)
  fin.setUTCDate(fin.getUTCDate() + 1)
  return [debut.toISOString(), fin.toISOString()]
}
