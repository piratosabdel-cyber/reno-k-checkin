import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Commerce, StatutCommerce, TypeCommerce, VisiteAvecRelations } from '../../types/database'
import { BADGE_RESULTAT, LABEL_RESULTAT, LABEL_STATUT, LABEL_TYPE, TYPES_COMMERCE } from '../../lib/visites'
import { SELECT_VISITE, dateCourte, heure, liensPhotos, lienCarte, lienDrive } from '../../lib/visitesAdmin'
import VisitesMap from '../../components/visites/VisitesMap'

export default function AdminCommerceFichePage() {
  const { id } = useParams()
  const [c, setC] = useState<Commerce | null>(null)
  const [visites, setVisites] = useState<VisiteAvecRelations[]>([])
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [edition, setEdition] = useState<Commerce | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger() {
    const [{ data: commerce }, { data: vs }] = await Promise.all([
      supabase.from('commerces').select('*').eq('id', id!).single(),
      supabase.from('visites').select(SELECT_VISITE).eq('commerce_id', id!).order('heure_appareil', { ascending: false }),
    ])
    setC(commerce as Commerce | null)
    const liste = (vs as unknown as VisiteAvecRelations[]) ?? []
    setVisites(liste)
    setPhotos(await liensPhotos(liste.map((v) => v.photo_path)))
  }

  useEffect(() => {
    charger()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!edition) return
    const { error } = await supabase
      .from('commerces')
      .update({
        nom: edition.nom,
        adresse: edition.adresse,
        commune: edition.commune,
        type: edition.type,
        statut: edition.statut,
        contact_nom: edition.contact_nom,
        contact_fonction: edition.contact_fonction,
        contact_telephone: edition.contact_telephone,
        contact_email: edition.contact_email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', edition.id)
    if (error) {
      setErreur(error.message)
      return
    }
    setEdition(null)
    charger()
  }

  if (!c) return <p className="text-slate-400">Chargement…</p>

  const plateaux = visites.reduce((s, v) => s + (v.plateaux ?? 0), 0)
  const palettes = visites.reduce((s, v) => s + (v.palettes ?? 0), 0)
  const precommandes = visites.filter((v) => v.resultat === 'precommande')
  const champ = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'

  return (
    <div className="space-y-5">
      <Link to="/admin/commerces" className="text-sm text-slate-500 hover:underline">
        ← Commerces
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{c.nom}</h1>
          <p className="text-slate-500">
            {LABEL_TYPE[c.type]} · {LABEL_STATUT[c.statut]} · {c.adresse ?? c.commune ?? 'adresse inconnue'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lienDrive(c.drive_dossier_id) && (
            <a
              href={lienDrive(c.drive_dossier_id)!}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              📁 Dossier Drive
            </a>
          )}
          {lienCarte(c.latitude, c.longitude) && (
            <a
              href={lienCarte(c.latitude, c.longitude)!}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              📍 Google Maps
            </a>
          )}
          <button
            onClick={() => setEdition(edition ? null : c)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Modifier
          </button>
        </div>
      </div>

      {edition && (
        <form onSubmit={enregistrer} className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2">
          <input className={champ} value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} placeholder="Nom" required />
          <input className={champ} value={edition.adresse ?? ''} onChange={(e) => setEdition({ ...edition, adresse: e.target.value || null })} placeholder="Adresse" />
          <input className={champ} value={edition.commune ?? ''} onChange={(e) => setEdition({ ...edition, commune: e.target.value || null })} placeholder="Commune" />
          <select className={champ} value={edition.type} onChange={(e) => setEdition({ ...edition, type: e.target.value as TypeCommerce })}>
            {TYPES_COMMERCE.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.label}
              </option>
            ))}
          </select>
          <select className={champ} value={edition.statut} onChange={(e) => setEdition({ ...edition, statut: e.target.value as StatutCommerce })}>
            {(Object.keys(LABEL_STATUT) as StatutCommerce[]).map((s) => (
              <option key={s} value={s}>
                {LABEL_STATUT[s]}
              </option>
            ))}
          </select>
          <input className={champ} value={edition.contact_nom ?? ''} onChange={(e) => setEdition({ ...edition, contact_nom: e.target.value || null })} placeholder="Contact" />
          <input className={champ} value={edition.contact_fonction ?? ''} onChange={(e) => setEdition({ ...edition, contact_fonction: e.target.value || null })} placeholder="Fonction" />
          <input className={champ} value={edition.contact_telephone ?? ''} onChange={(e) => setEdition({ ...edition, contact_telephone: e.target.value || null })} placeholder="Téléphone" />
          <input className={champ} value={edition.contact_email ?? ''} onChange={(e) => setEdition({ ...edition, contact_email: e.target.value || null })} placeholder="E-mail" />
          {erreur && <p className="text-sm text-red-600 sm:col-span-2">{erreur}</p>}
          <button className="rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white sm:col-span-2">Enregistrer</button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-3xl font-bold">{visites.length}</p>
          <p className="text-sm text-slate-500">visites</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-3xl font-bold">{precommandes.length}</p>
          <p className="text-sm text-slate-500">précommandes</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-3xl font-bold">{plateaux}</p>
          <p className="text-sm text-slate-500">plateaux au total</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-3xl font-bold">{palettes}</p>
          <p className="text-sm text-slate-500">palettes au total</p>
        </div>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm text-sm">
        <h2 className="mb-2 font-semibold text-slate-900">Contact principal</h2>
        <p>
          {[c.contact_nom, c.contact_fonction].filter(Boolean).join(' · ') || '—'}
          {c.contact_telephone && (
            <>
              {' · '}
              <a href={`tel:${c.contact_telephone}`} className="text-orange-700">
                {c.contact_telephone}
              </a>
            </>
          )}
          {c.contact_email && (
            <>
              {' · '}
              <a href={`mailto:${c.contact_email}`} className="text-orange-700">
                {c.contact_email}
              </a>
            </>
          )}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Historique des visites</h2>
        {visites.length === 0 && <p className="text-sm text-slate-400">Aucune visite.</p>}
        {visites.map((v) => (
          <Link
            key={v.id}
            to={`/admin/visites/${v.id}`}
            className="flex gap-4 rounded-xl bg-white p-3 shadow-sm hover:bg-slate-50"
          >
            {photos[v.photo_path] ? (
              <img src={photos[v.photo_path]} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-20 w-20 shrink-0 rounded-lg bg-slate-200" />
            )}
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-900">
                {dateCourte(v.heure_serveur)} à {heure(v.heure_serveur)}{' '}
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_RESULTAT[v.resultat]}`}>
                  {LABEL_RESULTAT[v.resultat]}
                </span>
                {v.alertes.length > 0 && <span className="ml-2 text-xs text-amber-700">⚠ {v.alertes.length} alerte(s)</span>}
              </p>
              {v.resultat === 'precommande' && (
                <p className="text-slate-600">
                  {v.plateaux ?? 0} plateau(x) · {v.palettes ?? 0} palette(s)
                </p>
              )}
              {(v.remarques?.length > 0 || v.commentaire) && (
                <p className="truncate text-slate-500">{[...(v.remarques ?? []), v.commentaire].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </Link>
        ))}
      </section>

      {visites.length > 0 && <VisitesMap visites={visites} photos={photos} hauteur={320} />}
    </div>
  )
}
