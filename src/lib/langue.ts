import { useSyncExternalStore } from 'react'
import type { ResultatVisite, TypeCommerce } from '../types/database'
import { LABEL_RESULTAT, LABEL_RESULTAT_NL, LABEL_TYPE, LABEL_TYPE_NL, NL } from './visites'

/**
 * Langue de l'app commerciale Adala (FR / NL), mémorisée sur l'appareil.
 * Les textes restent écrits en français dans le code, avec le néerlandais à
 * côté : t('Nouvelle visite', 'Nieuw bezoek'). Ce qui est enregistré en base
 * (remarques, fonctions…) reste en français pour l'admin, le mail et Drive.
 */
export type Langue = 'fr' | 'nl'

const CLE = 'adala_langue'
const abonnes = new Set<() => void>()

function lire(): Langue {
  try {
    const v = localStorage.getItem(CLE)
    if (v === 'fr' || v === 'nl') return v
  } catch {
    // stockage indisponible (navigation privée) : on reste en français
  }
  return navigator.language?.toLowerCase().startsWith('nl') ? 'nl' : 'fr'
}

let courante: Langue = lire()

export function langueActuelle(): Langue {
  return courante
}

export function changerLangue(l: Langue) {
  courante = l
  try {
    localStorage.setItem(CLE, l)
  } catch {
    // tant pis : la langue vaut pour cette session
  }
  document.documentElement.lang = l
  abonnes.forEach((f) => f())
}

/** Traduit hors composant (messages d'erreur, file d'envoi…). */
export function tr(fr: string, nl: string): string {
  return courante === 'nl' ? nl : fr
}

export function useLangue() {
  const langue = useSyncExternalStore(
    (f) => {
      abonnes.add(f)
      return () => abonnes.delete(f)
    },
    () => courante
  )
  const nl = langue === 'nl'
  return {
    langue,
    changerLangue,
    t: (fr: string, nlTexte: string) => (nl ? nlTexte : fr),
    /** Pour toLocaleDateString / toLocaleString. */
    locale: nl ? 'nl-BE' : 'fr-BE',
    labelType: (v: TypeCommerce) => (nl ? LABEL_TYPE_NL : LABEL_TYPE)[v],
    labelResultat: (r: ResultatVisite) => (nl ? LABEL_RESULTAT_NL : LABEL_RESULTAT)[r],
    /** Remarque ou fonction enregistrée en français. */
    libelle: (fr: string) => (nl ? (NL[fr] ?? fr) : fr),
  }
}
