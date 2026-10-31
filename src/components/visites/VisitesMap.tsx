import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet'
import { divIcon, latLngBounds } from 'leaflet'
import { Link } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import type { VisiteAvecRelations } from '../../types/database'
import { LABEL_RESULTAT } from '../../lib/visites'
import { heure } from '../../lib/visitesAdmin'

const CENTRE_BELGIQUE: [number, number] = [50.85, 4.35]

function iconeNumero(n: number, alerte: boolean) {
  const fond = alerte ? '#d97706' : '#b83a2c'
  return divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${fond};color:white;font:700 13px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.5)">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

/** Visites numérotées dans l'ordre chronologique ; clic = résumé + photo + lien fiche. */
export default function VisitesMap({
  visites,
  photos,
  hauteur = 460,
}: {
  visites: VisiteAvecRelations[]
  photos: Record<string, string>
  hauteur?: number
}) {
  const points = [...visites]
    .sort((a, b) => a.heure_appareil.localeCompare(b.heure_appareil))
    .map((v) => ({ v, lat: v.lat_envoi ?? v.lat_ouverture, lng: v.lng_envoi ?? v.lng_ouverture }))
    .filter((p): p is { v: VisiteAvecRelations; lat: number; lng: number } => p.lat != null && p.lng != null)

  const bounds = points.length > 1 ? latLngBounds(points.map((p) => [p.lat, p.lng])) : undefined
  const centre: [number, number] = points.length === 1 ? [points[0].lat, points[0].lng] : CENTRE_BELGIQUE

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <MapContainer
        key={points.map((p) => p.v.id).join(',')}
        center={centre}
        zoom={points.length === 1 ? 15 : 9}
        bounds={bounds}
        boundsOptions={{ padding: [40, 40] }}
        style={{ height: `${hauteur}px`, width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.length > 1 && (
          <Polyline
            positions={points.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#475569', weight: 2, dashArray: '6 6', opacity: 0.6 }}
          />
        )}
        {points.map(({ v, lat, lng }, i) => (
          <Marker key={v.id} position={[lat, lng]} icon={iconeNumero(i + 1, v.alertes.length > 0)}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <strong>
                  {i + 1}. {v.commerce?.nom}
                </strong>
                <br />
                {heure(v.heure_serveur)} — {LABEL_RESULTAT[v.resultat]}
                {v.plateaux ? ` · ${v.plateaux} plat.` : ''}
                {v.palettes ? ` · ${v.palettes} pal.` : ''}
                {v.alertes.length > 0 && (
                  <>
                    <br />
                    <span style={{ color: '#d97706' }}>⚠ {v.alertes.map((a) => a.detail).join(' · ')}</span>
                  </>
                )}
                {photos[v.photo_path] && (
                  <img
                    src={photos[v.photo_path]}
                    alt=""
                    style={{ marginTop: 6, width: 180, height: 120, objectFit: 'cover', borderRadius: 6 }}
                  />
                )}
                <br />
                <Link to={`/admin/visites/${v.id}`}>Ouvrir la fiche →</Link>
              </div>
            </Popup>
          </Marker>
        ))}
        {points.length === 1 && points[0].v.commerce?.latitude != null && (
          <Circle
            center={[points[0].v.commerce.latitude!, points[0].v.commerce.longitude!]}
            radius={300}
            pathOptions={{ color: '#b83a2c', fillOpacity: 0.05 }}
          />
        )}
      </MapContainer>
      {points.length === 0 && (
        <p className="p-4 text-center text-sm text-slate-400">Aucune visite géolocalisée.</p>
      )}
    </div>
  )
}
