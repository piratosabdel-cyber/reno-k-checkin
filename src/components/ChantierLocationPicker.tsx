import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet'
import { divIcon, latLngBounds, type LeafletEvent, type Marker as LeafletMarker } from 'leaflet'
import 'leaflet/dist/leaflet.css'

const CENTRE_BELGIQUE: [number, number] = [50.85, 4.35]

const ICONE_CHANTIER = divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,0.6);cursor:grab;"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

type Precision = 'exacte' | 'rue' | 'zone'

interface Resultat {
  id: number
  libelle: string
  lat: number
  lng: number
  precision: Precision
  bbox: [[number, number], [number, number]] // [[sud, ouest], [nord, est]]
}

interface ReponseNominatim {
  place_id: number
  display_name: string
  lat: string
  lon: string
  addresstype?: string
  boundingbox: [string, string, string, string] // sud, nord, ouest, est
  address?: { house_number?: string; road?: string }
}

function classer(r: ReponseNominatim): Precision {
  if (r.address?.house_number) return 'exacte'
  if (r.addresstype === 'road') return 'rue'
  return 'zone'
}

async function geocoder(adresse: string): Promise<Resultat[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', adresse)
  url.searchParams.set('countrycodes', 'be')
  url.searchParams.set('limit', '5')
  url.searchParams.set('addressdetails', '1')
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Service de recherche indisponible')
  const data: ReponseNominatim[] = await res.json()
  return data.map((r) => {
    const [s, n, o, e] = r.boundingbox.map(Number)
    return {
      id: r.place_id,
      libelle: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      precision: classer(r),
      bbox: [
        [s, o],
        [n, e],
      ],
    }
  })
}

function Recentrer({ position, zone }: { position: [number, number] | null; zone: Resultat | null }) {
  const map = useMap()
  const clePosition = position ? `${position[0]},${position[1]}` : ''
  useEffect(() => {
    if (!clePosition) return
    const [lat, lng] = clePosition.split(',').map(Number)
    map.flyTo([lat, lng], Math.max(map.getZoom(), 17), { duration: 0.6 })
  }, [map, clePosition])
  useEffect(() => {
    if (zone) map.fitBounds(latLngBounds(zone.bbox), { padding: [20, 20], maxZoom: 17 })
  }, [map, zone])
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
  confirmee,
  declencheurRecherche,
  onChange,
  onConfirmer,
}: {
  adresse: string
  latitude: string
  longitude: string
  rayonMetres: number
  confirmee: boolean
  declencheurRecherche: number
  onChange: (lat: number, lng: number) => void
  onConfirmer: () => void
}) {
  const [propositions, setPropositions] = useState<Resultat[]>([])
  const [zone, setZone] = useState<Resultat | null>(null)
  const [recherche, setRecherche] = useState(false)
  const [message, setMessage] = useState<{ texte: string; ton: 'info' | 'alerte' } | null>(null)

  const lat = Number(latitude)
  const lng = Number(longitude)
  const position: [number, number] | null = latitude && longitude && !isNaN(lat) && !isNaN(lng) ? [lat, lng] : null

  useEffect(() => {
    if (declencheurRecherche > 0) chercher()
  }, [declencheurRecherche]) // eslint-disable-line react-hooks/exhaustive-deps

  async function chercher() {
    if (!adresse.trim()) {
      setMessage({ texte: "Tape d'abord l'adresse du chantier ci-dessus.", ton: 'alerte' })
      return
    }
    setRecherche(true)
    setMessage(null)
    setPropositions([])
    setZone(null)
    try {
      const resultats = await geocoder(adresse)
      const exactes = resultats.filter((r) => r.precision === 'exacte')

      if (exactes.length === 1) {
        onChange(exactes[0].lat, exactes[0].lng)
        setMessage({ texte: 'Adresse trouvée. Vérifie le point orange, ajuste-le si besoin, puis confirme.', ton: 'info' })
      } else if (exactes.length > 1) {
        setPropositions(exactes)
      } else if (resultats.length === 0) {
        setMessage({
          texte:
            "Adresse introuvable : aucun point placé. Vérifie l'orthographe de la rue et de la commune, ou tape seulement la commune pour afficher la zone et placer le point à la main.",
          ton: 'alerte',
        })
      } else {
        const approx = resultats[0]
        setZone(approx)
        setMessage({
          texte:
            approx.precision === 'rue'
              ? "Rue trouvée mais pas ce numéro : aucun point placé. La carte est centrée sur la rue — zoome et clique sur la bonne maison."
              : "Rue non reconnue : aucun point placé. La carte est centrée sur la commune — zoome et clique sur l'emplacement exact, ou corrige l'adresse.",
          ton: 'alerte',
        })
      }
    } catch {
      setMessage({ texte: 'Recherche impossible pour le moment. Tu peux placer le point à la main sur la carte.', ton: 'alerte' })
    } finally {
      setRecherche(false)
    }
  }

  function choisir(r: Resultat) {
    onChange(r.lat, r.lng)
    setPropositions([])
    setMessage({ texte: 'Vérifie le point orange, ajuste-le si besoin, puis confirme.', ton: 'info' })
  }

  function placer(lat: number, lng: number) {
    setZone(null)
    onChange(lat, lng)
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
          {recherche ? 'Recherche...' : "🔍 Chercher l'adresse sur la carte"}
        </button>
        {position && !confirmee && (
          <button
            type="button"
            onClick={onConfirmer}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            ✓ Confirmer cet emplacement
          </button>
        )}
        {position && confirmee && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
            ✓ Emplacement confirmé
          </span>
        )}
        <span className="text-xs text-slate-500">
          Clique sur la carte ou fais glisser le point orange pour corriger l'emplacement exact, puis confirme.
        </span>
      </div>

      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.ton === 'alerte' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {message.ton === 'alerte' ? '⚠ ' : ''}
          {message.texte}
        </p>
      )}

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
        <MapContainer center={position ?? CENTRE_BELGIQUE} zoom={position ? 17 : 9} style={{ height: '320px', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recentrer position={position} zone={zone} />
          <ClicSurCarte onClic={placer} />
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
      {!position && !message && (
        <p className="text-xs text-slate-400">Aucun point placé : cherche l'adresse ou clique directement sur la carte.</p>
      )}
    </div>
  )
}
