import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { getCurrentPosition } from '../lib/geo'
import { adresseApprox } from '../lib/lieu'
import ChantierLocationPicker from './ChantierLocationPicker'

export default function ProposerChantierForm({
  ouvrierId,
  onEnvoye,
  onAnnuler,
}: {
  ouvrierId: string
  onEnvoye: () => void
  onAnnuler: () => void
}) {
  const [nom, setNom] = useState('')
  const [adresse, setAdresse] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [confirmee, setConfirmee] = useState(false)
  const [declencheur, setDeclencheur] = useState(0)
  const [gpsEnCours, setGpsEnCours] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function placer(lat: number, lng: number) {
    setLatitude(lat.toFixed(6))
    setLongitude(lng.toFixed(6))
    setConfirmee(false)
  }

  async function utiliserMaPosition() {
    setGpsEnCours(true)
    setErreur(null)
    try {
      const pos = await getCurrentPosition()
      placer(pos.lat, pos.lng)
      adresseApprox(pos.lat, pos.lng).then(setAdresse).catch(() => undefined)
    } catch {
      setErreur("Position GPS non disponible. Cherche l'adresse ou clique sur la carte.")
    } finally {
      setGpsEnCours(false)
    }
  }

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!latitude || !longitude) {
      setErreur("Place d'abord le point du chantier sur la carte.")
      return
    }
    if (!confirmee) {
      setErreur('Vérifie le point orange puis clique sur "Confirmer cet emplacement".')
      return
    }
    if (!navigator.onLine) {
      setErreur('Pas de connexion : réessaie quand tu auras du réseau.')
      return
    }
    setEnvoi(true)
    setErreur(null)
    const { error } = await supabase.from('chantiers').insert({
      nom: nom.trim(),
      adresse: adresse.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      rayon_metres: 300,
      statut: 'en_attente',
      propose_par: ouvrierId,
    })
    setEnvoi(false)
    if (error) {
      setErreur("Envoi impossible. Réessaie ou préviens ton responsable.")
      return
    }
    onEnvoye()
  }

  return (
    <form onSubmit={envoyer} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Proposer un nouveau chantier</h2>
        <p className="mt-1 text-sm text-slate-500">
          Il sera envoyé à l'administrateur. Tu pourras pointer dessus dès qu'il l'aura approuvé.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Nom du chantier</label>
        <input
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
          placeholder="ex. Famille Janssens — toiture"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Adresse</label>
        <input
          required
          value={adresse}
          onChange={(e) => {
            setAdresse(e.target.value)
            setConfirmee(false)
          }}
          onBlur={() => adresse.trim() && !confirmee && setDeclencheur((n) => n + 1)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
          placeholder="ex. Witteramsdal 93, Asse"
        />
      </div>

      <button
        type="button"
        onClick={utiliserMaPosition}
        disabled={gpsEnCours}
        className="w-full rounded-xl border border-orange-300 bg-orange-50 py-3 text-sm font-semibold text-orange-700 disabled:opacity-50"
      >
        {gpsEnCours ? 'Recherche GPS...' : '📍 Je suis sur place : utiliser ma position'}
      </button>

      <ChantierLocationPicker
        adresse={adresse}
        latitude={latitude}
        longitude={longitude}
        rayonMetres={300}
        confirmee={confirmee}
        declencheurRecherche={declencheur}
        onChange={placer}
        onAdresseTrouvee={setAdresse}
        onConfirmer={() => {
          setConfirmee(true)
          setErreur(null)
        }}
      />

      {erreur && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">⚠ {erreur}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onAnnuler}
          className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold text-slate-600"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={envoi}
          className="flex-1 rounded-xl bg-orange-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {envoi ? 'Envoi...' : confirmee ? 'Envoyer' : 'Envoyer (à confirmer)'}
        </button>
      </div>
    </form>
  )
}
