import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Polyline } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import type { VisiteAvecRelations } from '../../types/database'
import { BADGE_RESULTAT, LABEL_RESULTAT, LABEL_STATUT, LABEL_TYPE, lienReseau } from '../../lib/visites'
import { SELECT_VISITE, duree, heure, liensPhotos, lienCarte, lienDrive } from '../../lib/visitesAdmin'
import { appelServeur, demanderArchivageDrive } from '../../lib/visitesQueue'
import ChampsVisite, { DETAILS_VIDES, type DetailsVisite } from '../../components/visites/ChampsVisite'

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{children ?? '—'}</span>
    </div>
  )
}

export default function AdminVisiteFichePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [v, setV] = useState<VisiteAvecRelations | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [introuvable, setIntrouvable] = useState(false)
  const [edition, setEdition] = useState<DetailsVisite | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger() {
    const { data } = await supabase.from('visites').select(SELECT_VISITE).eq('id', id!).single()
    if (!data) {
      setIntrouvable(true)
      return
    }
    const visite = data as unknown as VisiteAvecRelations
    setV(visite)
    const liens = await liensPhotos([visite.photo_path])
    setPhoto(liens[visite.photo_path] ?? null)
  }

  useEffect(() => {
    charger()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (introuvable) return <p className="text-slate-500">Visite introuvable.</p>
  if (!v) return <p className="text-slate-400">Chargement…</p>

  function modifier() {
    if (!v) return
    setErreur(null)
    setEdition({
      ...DETAILS_VIDES,
      resultat: v.resultat,
      plateaux: v.plateaux ?? 0,
      palettes: v.palettes ?? 0,
      date_relance: v.date_relance,
      remarques: v.remarques ?? [],
      commentaire: v.commentaire ?? '',
      contact_nom: v.contact_nom ?? '',
      contact_fonction: v.contact_fonction ?? '',
      contact_telephone: v.contact_telephone ?? '',
      contact_email: v.contact_email ?? '',
      adresse_livraison: v.adresse_livraison ?? '',
      adresse_facturation: v.adresse_facturation ?? '',
      numero_entreprise: v.numero_entreprise ?? '',
      numero_tva: v.numero_tva ?? '',
      reseau_social: v.reseau_social ?? '',
    })
  }

  async function enregistrer() {
    if (!edition) return
    const d = edition
    if (d.resultat === 'precommande' && d.plateaux + d.palettes === 0) {
      setErreur('Indique le nombre de plateaux ou de palettes.')
      return
    }
    setOccupe(true)
    setErreur(null)
    const { error } = await supabase
      .from('visites')
      .update({
        resultat: d.resultat,
        plateaux: d.resultat === 'precommande' ? d.plateaux : null,
        palettes: d.resultat === 'precommande' ? d.palettes : null,
        date_relance: d.date_relance,
        remarques: d.remarques,
        commentaire: d.commentaire.trim() || null,
        contact_nom: d.contact_nom.trim() || null,
        contact_fonction: d.contact_fonction || null,
        contact_telephone: d.contact_telephone.trim() || null,
        contact_email: d.contact_email.trim() || null,
        adresse_livraison: d.adresse_livraison.trim() || null,
        adresse_facturation: d.adresse_facturation.trim() || null,
        numero_entreprise: d.numero_entreprise.trim() || null,
        numero_tva: d.numero_tva.trim() || null,
        reseau_social: d.reseau_social.trim() || null,
        a_completer: false,
        // Le rapport Drive sera refait avec les nouvelles infos.
        drive_archive_at: null,
      })
      .eq('id', id!)
    setOccupe(false)
    if (error) {
      setErreur(`Enregistrement refusé (${error.message}).`)
      return
    }
    demanderArchivageDrive()
    setEdition(null)
    charger()
  }

  async function effacer() {
    if (!v) return
    if (
      !window.confirm(
        `Effacer définitivement la visite chez ${v.commerce?.nom ?? 'ce commerce'} ?\n\nLa photo est effacée et le dossier Google Drive part à la corbeille. Impossible d'annuler dans l'app.`
      )
    )
      return
    setOccupe(true)
    const r = await appelServeur('/api/supprimer-visite', { id: v.id })
    setOccupe(false)
    if (r.erreur) {
      setErreur(r.erreur)
      return
    }
    navigate('/admin/visites', { replace: true })
  }

  const ouverture = v.lat_ouverture != null ? ([v.lat_ouverture, v.lng_ouverture!] as [number, number]) : null
  const envoi = v.lat_envoi != null ? ([v.lat_envoi, v.lng_envoi!] as [number, number]) : null
  const ref = v.commerce?.latitude != null ? ([v.commerce.latitude, v.commerce.longitude!] as [number, number]) : null
  const centre = envoi ?? ouverture ?? ref ?? ([50.85, 4.35] as [number, number])
  const date = new Date(v.heure_serveur).toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-5">
      <Link to="/admin/visites" className="text-sm text-slate-500 hover:underline">
        ← Visites
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            <Link to={`/admin/commerces/${v.commerce_id}`} className="hover:underline">
              {v.commerce?.nom}
            </Link>
          </h1>
          <p className="text-slate-500">
            {date} à {heure(v.heure_serveur)} · {v.commercial?.full_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${BADGE_RESULTAT[v.resultat]}`}>
            {LABEL_RESULTAT[v.resultat]}
          </span>
          {!edition && (
            <>
              <button
                onClick={modifier}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Modifier
              </button>
              <button
                onClick={effacer}
                disabled={occupe}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {occupe ? 'Suppression…' : 'Effacer'}
              </button>
            </>
          )}
        </div>
      </div>

      {erreur && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {erreur}
        </p>
      )}

      {edition && (
        <div className="space-y-3 rounded-xl border-2 border-slate-900 bg-slate-50 p-3">
          <p className="px-1 text-sm text-slate-600">
            Modification de la visite. La photo, l'heure et la position GPS ne changent pas.
          </p>
          <ChampsVisite details={edition} onChange={setEdition} contactConnu={!!edition.contact_nom} />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEdition(null)}
              disabled={occupe}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Annuler
            </button>
            <button
              onClick={enregistrer}
              disabled={occupe}
              className="rounded-lg bg-[#b83a2c] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {occupe ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {v.alertes.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="mb-1 font-semibold">Alertes</p>
          <ul className="list-inside list-disc">
            {v.alertes.map((a) => (
              <li key={a.code}>{a.detail}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {photo ? (
            <a href={photo} target="_blank" rel="noreferrer">
              <img src={photo} alt="Photo de la visite" className="w-full rounded-xl object-contain shadow-sm" />
            </a>
          ) : (
            <div className="flex h-60 items-center justify-center rounded-xl bg-slate-200 text-slate-500">
              Photo indisponible
            </div>
          )}

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold text-slate-900">Visite</h2>
            <Ligne label="Type de commerce">{LABEL_TYPE[v.type_commerce ?? v.commerce?.type ?? 'autre']}</Ligne>
            <Ligne label="Statut du commerce">{v.commerce ? LABEL_STATUT[v.commerce.statut] : null}</Ligne>
            {v.resultat === 'precommande' && (
              <Ligne label="Précommande">
                {v.plateaux ?? 0} plateau(x) de 24 · {v.palettes ?? 0} palette(s)
              </Ligne>
            )}
            <Ligne label="Relance">
              {v.date_relance ? new Date(`${v.date_relance}T12:00:00`).toLocaleDateString('fr-BE') : null}
            </Ligne>
            <Ligne label="Contact">
              {[v.contact_nom, v.contact_fonction].filter(Boolean).join(' · ') || null}
            </Ligne>
            <Ligne label="Téléphone">
              {v.contact_telephone && <a href={`tel:${v.contact_telephone}`}>{v.contact_telephone}</a>}
            </Ligne>
            <Ligne label="E-mail">
              {v.contact_email && <a href={`mailto:${v.contact_email}`}>{v.contact_email}</a>}
            </Ligne>
            <Ligne label="Réseau social">
              {v.reseau_social && (
                <a href={lienReseau(v.reseau_social)} target="_blank" rel="noreferrer">
                  {v.reseau_social}
                </a>
              )}
            </Ligne>
            <Ligne label="Adresse de livraison">{v.adresse_livraison}</Ligne>
            <Ligne label="Adresse de facturation">{v.adresse_facturation}</Ligne>
            <Ligne label="N° d'entreprise">{v.numero_entreprise}</Ligne>
            <Ligne label="N° de TVA">{v.numero_tva}</Ligne>
            {v.remarques?.length > 0 && <Ligne label="Remarques">{v.remarques.join(' · ')}</Ligne>}
            <Ligne label="Commentaire">{v.commentaire}</Ligne>
            {v.a_completer && <Ligne label="État">À compléter par la commerciale</Ligne>}
            {v.modifiee_le && (
              <Ligne label="Modifiée après coup">
                {new Date(v.modifiee_le).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}
              </Ligne>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <MapContainer center={centre} zoom={17} style={{ height: 320, width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {ref && (
                <Circle center={ref} radius={300} pathOptions={{ color: '#b83a2c', fillOpacity: 0.05 }}>
                  <Popup>Position de référence du commerce (zone 300 m)</Popup>
                </Circle>
              )}
              {ouverture && envoi && <Polyline positions={[ouverture, envoi]} pathOptions={{ color: '#475569', dashArray: '4 4' }} />}
              {ouverture && (
                <CircleMarker center={ouverture} radius={8} pathOptions={{ color: '#fff', fillColor: '#2563eb', fillOpacity: 1 }}>
                  <Popup>Ouverture du formulaire — {heure(v.heure_ouverture)}</Popup>
                </CircleMarker>
              )}
              {envoi && (
                <CircleMarker center={envoi} radius={8} pathOptions={{ color: '#fff', fillColor: '#b83a2c', fillOpacity: 1 }}>
                  <Popup>Envoi — {heure(v.heure_appareil)}</Popup>
                </CircleMarker>
              )}
            </MapContainer>
            <p className="px-4 py-2 text-xs text-slate-500">
              🔵 ouverture du formulaire · 🔴 envoi · cercle : zone de 300 m autour du commerce
            </p>
          </div>

          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-semibold text-slate-900">Heures et position</h2>
            <Ligne label="Ouverture du formulaire (tablette)">{heure(v.heure_ouverture)}</Ligne>
            <Ligne label="Envoi (tablette)">{heure(v.heure_appareil)}</Ligne>
            <Ligne label="Reçue par le serveur (fait foi)">
              {new Date(v.heure_serveur).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}
            </Ligne>
            <Ligne label="Durée approximative">{duree(v)}</Ligne>
            <Ligne label="Photo prise à">{heure(v.photo_prise_a)}</Ligne>
            <Ligne label="Synchronisation">{v.synchro_differee ? 'En différé (hors connexion)' : 'Immédiate'}</Ligne>
            <Ligne label="Précision GPS">
              {[v.precision_ouverture_m, v.precision_envoi_m]
                .map((p) => (p != null ? `±${Math.round(p)} m` : '—'))
                .join(' / ')}
            </Ligne>
            <Ligne label="Adresse GPS">{v.adresse_gps}</Ligne>
            <Ligne label="Voir sur Google Maps">
              {lienCarte(v.lat_envoi ?? v.lat_ouverture, v.lng_envoi ?? v.lng_ouverture) && (
                <a
                  href={lienCarte(v.lat_envoi ?? v.lat_ouverture, v.lng_envoi ?? v.lng_ouverture)!}
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-700 underline"
                >
                  Ouvrir
                </a>
              )}
            </Ligne>
            <Ligne label="Appareil">{v.appareil_id?.slice(0, 8)}</Ligne>
            <Ligne label="Dossier Google Drive">
              {lienDrive(v.drive_dossier_id) ? (
                <a href={lienDrive(v.drive_dossier_id)!} target="_blank" rel="noreferrer" className="text-orange-700 underline">
                  Ouvrir
                </a>
              ) : v.drive_erreur ? (
                <span className="text-red-600">Erreur : {v.drive_erreur}</span>
              ) : (
                'pas encore archivé'
              )}
            </Ligne>
          </section>
        </div>
      </div>
    </div>
  )
}
