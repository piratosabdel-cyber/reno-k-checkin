import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Chantier, PointageWithRelations } from '../types/database'

const CENTRE_BELGIQUE: [number, number] = [50.85, 4.35]

function icone(couleur: string) {
  return divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${couleur};border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

const LABELS: Record<string, string> = {
  arrivee: 'Arrivée',
  pause_debut: 'Début de pause',
  pause_fin: 'Fin de pause',
  depart: 'Départ',
}

export default function PointagesMap({
  pointages,
  chantiers,
}: {
  pointages: PointageWithRelations[]
  chantiers: Chantier[]
}) {
  const pointsAvecGps = pointages.filter((p) => p.latitude != null && p.longitude != null)
  const chantiersAvecGps = chantiers.filter((c) => c.latitude != null && c.longitude != null)

  const centre: [number, number] =
    chantiersAvecGps.length > 0
      ? [chantiersAvecGps[0].latitude!, chantiersAvecGps[0].longitude!]
      : pointsAvecGps.length > 0
        ? [pointsAvecGps[0].latitude!, pointsAvecGps[0].longitude!]
        : CENTRE_BELGIQUE

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <MapContainer center={centre} zoom={12} style={{ height: '420px', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {chantiersAvecGps.map((c) => (
          <Circle
            key={c.id}
            center={[c.latitude!, c.longitude!]}
            radius={c.rayon_metres}
            pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.08 }}
          >
            <Popup>
              <strong>{c.nom}</strong>
              <br />
              Zone autorisée : {c.rayon_metres} m
            </Popup>
          </Circle>
        ))}

        {pointsAvecGps.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitude!, p.longitude!]}
            icon={icone(p.hors_zone ? '#d97706' : '#059669')}
          >
            <Popup>
              <strong>{p.ouvrier.full_name}</strong>
              <br />
              {LABELS[p.type] ?? p.type} — {p.chantier.nom}
              <br />
              {new Date(p.heure_appareil).toLocaleTimeString('fr-BE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {p.hors_zone && (
                <>
                  <br />
                  <span style={{ color: '#d97706' }}>Hors zone ({p.distance_chantier_m} m)</span>
                </>
              )}
              {p.precision_gps_m != null && (
                <>
                  <br />
                  Précision GPS : ±{Math.round(p.precision_gps_m)} m
                </>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {pointsAvecGps.length === 0 && (
        <p className="p-4 text-center text-sm text-slate-400">
          Aucun pointage géolocalisé pour le moment.
        </p>
      )}
    </div>
  )
}
