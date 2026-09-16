import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet'
import { divIcon, type LeafletEvent, type Marker as LeafletMarker } from 'leaflet'
import 'leaflet/dist/leaflet.css'

const CENTRE_BELGIQUE: [number, number] = [50.85, 4.35]

const ICONE_CHANTIER = divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,0.6);cursor:grab;"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

interface Proposition {
  id: number
  libelle: string
  lat: number
  lng: number
}

async function geocoder(adresse: string): Promise<Proposition[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', adresse)
  url.searchParams.set('countrycodes', 'be')
  url.searchParams.set('limit', '5')
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Service de recherche indisponible')
  const data: { place_id: number; display_name: string; lat: string; lon: string }[] = await res.json()
  return data.map((r) => ({ id: r.place_id, libelle: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
}

function RecentrerSur({ position }: { position: [number, number] | null }) {
  const map = useMap()
  const cle = position ? `${position[0]},${position[1]}` : ''
  useEffect(() => {
    if (!cle) return
    const [lat, lng] = cle.split(',').map(Number)
    map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
  }, [map, cle])
  return null
}

function ClicSurCarte({ onClic }: { onClic: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClic(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function ChantierLocationPicker({
  adresse,
  latitude,
  longitude,
  rayonMetres,
  onChange,
}: {
  adresse: string
  latitude: string
  longitude: string
  rayonMetres: number
  onChange: (lat: number, lng: number) => void
}) {
  const [propositions, setPropositions] = useState<Proposition[]>([])
  const [recherche, setRecherche] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const lat = Number(latitude)
  const lng = Number(longitude)
  const position: [number, number] | null = latitude && longitude && !isNaN(lat) && !isNaN(lng) ? [lat, lng] : null

  async function chercher() {
    if (!adresse.trim()) {
      setErreur("Tape d'abord l'adresse du chantier ci-dessus.")
      return
    }
    setRecherche(true)
    setErreur(null)
    setPropositions([])
    try {
      const resultats = await geocoder(adresse)
      if (resultats.length === 0) {
        setErreur('Aucune adresse trouvée. Essaie avec "rue numéro, commune" ou place le point à la main sur la carte.')
      } else {
        setPropositions(resultats)
        if (resultats.length === 1) onChange(resultats[0].lat, resultats[0].lng)
      }
    } catch {
      setErreur('Recherche impossible pour le moment. Tu peux placer le point à la main sur la carte.')
    } finally {
      setRecherche(false)
    }
  }

  function choisir(p: Proposition) {
    onChange(p.lat, p.lng)
    setPropositions([])
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={chercher}
          disabled={recherche}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {recherche ? 'Recherche...' : '🔍 Chercher l\'adresse sur la carte'}
        </button>
        <span className="text-xs text-slate-500">
          Puis clique sur la carte ou fais glisser le point orange pour corriger l'emplacement exact.
        </span>
      </div>

      {erreur && <p className="text-sm text-amber-700">{erreur}</p>}

      {propositions.length > 1 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50">
          <p className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
            Plusieurs adresses correspondent — choisis la bonne :
          </p>
          <ul>
            {propositions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choisir(p)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-orange-50"
                >
                  {p.libelle}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <MapContainer center={position ?? CENTRE_BELGIQUE} zoom={position ? 16 : 9} style={{ height: '320px', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <RecentrerSur position={position} />
          <ClicSurCarte onClic={onChange} />
          {position && (
            <>
              <Marker
                position={position}
                icon={ICONE_CHANTIER}
                draggable
                eventHandlers={{
                  dragend: (e: LeafletEvent) => {
                    const ll = (e.target as LeafletMarker).getLatLng()
                    onChange(ll.lat, ll.lng)
                  },
                }}
              />
              <Circle
                center={position}
                radius={rayonMetres}
                pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.1 }}
              />
            </>
          )}
        </MapContainer>
      </div>
      {!position && (
        <p className="text-xs text-slate-400">Aucun point placé : cherche l'adresse ou clique directement sur la carte.</p>
      )}
    </div>
  )
}
