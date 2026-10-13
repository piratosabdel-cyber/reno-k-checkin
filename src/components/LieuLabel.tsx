import { useEffect, useState } from 'react'
import { adresseApprox, lieuConnu } from '../lib/lieu'
import type { Chantier } from '../types/database'

/** Affiche où se trouve une position : dépôt, chantier connu, ou adresse approximative. */
export default function LieuLabel({
  lat,
  lng,
  chantiers,
}: {
  lat: number
  lng: number
  chantiers: Pick<Chantier, 'nom' | 'latitude' | 'longitude' | 'rayon_metres'>[]
}) {
  const connu = lieuConnu(lat, lng, chantiers)
  const [adresse, setAdresse] = useState<string | null>(null)
  const [echec, setEchec] = useState(false)

  useEffect(() => {
    if (connu) return
    let actif = true
    adresseApprox(lat, lng)
      .then((a) => actif && setAdresse(a))
      .catch(() => actif && setEchec(true))
    return () => {
      actif = false
    }
  }, [lat, lng, connu])

  if (connu) return <>{connu}</>
  if (adresse) return <>{adresse}</>
  if (echec) return <>adresse inconnue</>
  return <span className="text-slate-400">…</span>
}
