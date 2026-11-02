// Prix de vente Adala Cola, TVA 6 % incluse. Copie identique côté app : src/lib/prix.ts.
export const TAUX_TVA = 0.06

export const TARIF = {
  plateaux: { canettes: 24, prixCanette: 1.18 },
  palettes: { canettes: 2160, prixCanette: 0.89 },
} as const

const arrondi = (n: number) => Math.round(n * 100) / 100

/** Prix TVAC d'un plateau ou d'une palette. */
export const prixUnite = (u: keyof typeof TARIF) => arrondi(TARIF[u].canettes * TARIF[u].prixCanette)

export function totalCommande(plateaux: number, palettes: number) {
  const tvac = arrondi(plateaux * prixUnite('plateaux') + palettes * prixUnite('palettes'))
  const htva = arrondi(tvac / (1 + TAUX_TVA))
  return {
    canettes: plateaux * TARIF.plateaux.canettes + palettes * TARIF.palettes.canettes,
    htva,
    tva: arrondi(tvac - htva),
    tvac,
  }
}

/** 1922.4 → « 1.922,40 € » (sans espaces spéciaux, que la police du PDF ignore). */
export function euros(n: number) {
  const [entier, cents] = n.toFixed(2).split('.')
  return `${entier.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents} €`
}
