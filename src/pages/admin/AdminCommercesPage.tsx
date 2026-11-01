import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Commerce, StatutCommerce, TypeCommerce } from '../../types/database'
import { LABEL_STATUT, LABEL_TYPE, TYPES_COMMERCE } from '../../lib/visites'
import { telechargerCsv } from '../../lib/visitesAdmin'

interface Agregat {
  nb: number
  derniere: string | null
  plateaux: number
  palettes: number
}

const BADGE_STATUT: Record<StatutCommerce, string> = {
  prospect: 'bg-sky-100 text-sky-800',
  client: 'bg-emerald-100 text-emerald-800',
  refus: 'bg-red-100 text-red-800',
}

export default function AdminCommercesPage() {
  const [commerces, setCommerces] = useState<Commerce[]>([])
  const [agregats, setAgregats] = useState<Record<string, Agregat>>({})
  const [recherche, setRecherche] = useState('')
  const [type, setType] = useState<TypeCommerce | ''>('')
  const [statut, setStatut] = useState<StatutCommerce | ''>('')

  useEffect(() => {
    supabase
      .from('commerces')
      .select('*')
      .order('nom')
      .then(({ data }) => setCommerces((data as Commerce[]) ?? []))
    supabase
      .from('visites')
      .select('commerce_id, heure_appareil, plateaux, palettes')
      .limit(20000)
      .then(({ data }) => {
        const out: Record<string, Agregat> = {}
        for (const v of (data ?? []) as { commerce_id: string; heure_appareil: string; plateaux: number | null; palettes: number | null }[]) {
          const a = (out[v.commerce_id] ??= { nb: 0, derniere: null, plateaux: 0, palettes: 0 })
          a.nb++
          a.plateaux += v.plateaux ?? 0
          a.palettes += v.palettes ?? 0
          if (!a.derniere || v.heure_appareil > a.derniere) a.derniere = v.heure_appareil
        }
        setAgregats(out)
      })
  }, [])

  const filtres = useMemo(() => {
    const q = recherche.toLowerCase().trim()
    return commerces.filter(
      (c) =>
        (!type || c.type === type) &&
        (!statut || c.statut === statut) &&
        (!q || `${c.nom} ${c.commune ?? ''} ${c.adresse ?? ''} ${c.contact_nom ?? ''}`.toLowerCase().includes(q))
    )
  }, [commerces, recherche, type, statut])

  function exporter() {
    telechargerCsv(
      'commerces_adala.csv',
      ['Nom', 'Type', 'Statut', 'Adresse', 'Commune', 'Contact', 'Fonction', 'Téléphone', 'E-mail', 'Réseau social', 'Adresse de livraison', 'Adresse de facturation', 'N° de TVA', 'Visites', 'Dernière visite', 'Plateaux', 'Palettes'],
      filtres.map((c) => {
        const a = agregats[c.id]
        return [
          c.nom,
          LABEL_TYPE[c.type],
          LABEL_STATUT[c.statut],
          c.adresse,
          c.commune,
          c.contact_nom,
          c.contact_fonction,
          c.contact_telephone,
          c.contact_email,
          c.reseau_social,
          c.adresse_livraison,
          c.adresse_facturation,
          c.numero_tva,
          a?.nb ?? 0,
          a?.derniere ? new Date(a.derniere).toLocaleDateString('fr-BE') : '',
          a?.plateaux ?? 0,
          a?.palettes ?? 0,
        ]
      })
    )
  }

  const champ = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

  return (
    <div className="space-y-5">
      <Link to="/admin/visites" className="text-sm text-slate-500 hover:underline">
        ← Visites
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">Commerces ({filtres.length})</h1>

      <div className="flex flex-wrap gap-3 rounded-xl bg-white p-4 shadow-sm">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher (nom, commune, contact…)"
          className={`min-w-60 flex-1 ${champ}`}
        />
        <select value={type} onChange={(e) => setType(e.target.value as TypeCommerce | '')} className={champ}>
          <option value="">Tous les types</option>
          {TYPES_COMMERCE.map((t) => (
            <option key={t.valeur} value={t.valeur}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value as StatutCommerce | '')} className={champ}>
          <option value="">Tous les statuts</option>
          {(Object.keys(LABEL_STATUT) as StatutCommerce[]).map((s) => (
            <option key={s} value={s}>
              {LABEL_STATUT[s]}
            </option>
          ))}
        </select>
        <button onClick={exporter} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Export Excel (CSV)
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Commerce</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Statut</th>
              <th className="px-3 py-3">Visites</th>
              <th className="px-3 py-3">Dernière</th>
              <th className="px-3 py-3">Précommandes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtres.map((c) => {
              const a = agregats[c.id]
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3">
                    <Link to={`/admin/commerces/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {c.nom}
                    </Link>
                    <p className="text-xs text-slate-500">{c.adresse ?? c.commune}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{LABEL_TYPE[c.type]}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${BADGE_STATUT[c.statut]}`}>
                      {LABEL_STATUT[c.statut]}
                    </span>
                  </td>
                  <td className="px-3 py-3">{a?.nb ?? 0}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {a?.derniere ? new Date(a.derniere).toLocaleDateString('fr-BE') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {a && (a.plateaux || a.palettes) ? `${a.plateaux} plat. · ${a.palettes} pal.` : '—'}
                  </td>
                </tr>
              )
            })}
            {filtres.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  Aucun commerce.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
