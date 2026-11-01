import { useState, type ReactNode } from 'react'
import type { ResultatVisite } from '../../types/database'
import { FONCTIONS_CONTACT, REMARQUES_RAPIDES, RESULTATS, dansNJours } from '../../lib/visites'

export interface DetailsVisite {
  resultat: ResultatVisite | null
  plateaux: number
  palettes: number
  date_relance: string | null
  remarques: string[]
  commentaire: string
  contact_nom: string
  contact_fonction: string
  contact_telephone: string
  contact_email: string
  reseau_social: string
  adresse_livraison: string
  adresse_facturation: string
  numero_tva: string
}

/** Tout ce qui décrit le client (et se reprend d'une visite à l'autre). */
export const INFOS_CLIENT_VIDES = {
  contact_nom: '',
  contact_fonction: '',
  contact_telephone: '',
  contact_email: '',
  reseau_social: '',
  adresse_livraison: '',
  adresse_facturation: '',
  numero_tva: '',
}

export const DETAILS_VIDES: DetailsVisite = {
  resultat: null,
  plateaux: 0,
  palettes: 0,
  date_relance: null,
  remarques: [],
  commentaire: '',
  ...INFOS_CLIENT_VIDES,
}

/** « Rue 1, 1730 Asse » sans répéter la commune déjà présente dans l'adresse. */
export function adresseComplete(c: { adresse: string | null; commune: string | null } | null): string | null {
  if (!c) return null
  const adresse = c.adresse ?? ''
  if (c.commune && !adresse.toLowerCase().includes(c.commune.toLowerCase()))
    return [adresse, c.commune].filter(Boolean).join(', ')
  return adresse || c.commune || null
}

export function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{titre}</h2>
      {children}
    </section>
  )
}

export function Puce({
  actif,
  onClick,
  children,
  couleurActive = 'bg-[#b83a2c] text-white border-[#b83a2c]',
}: {
  actif: boolean
  onClick: () => void
  children: ReactNode
  couleurActive?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 rounded-xl border-2 px-4 py-2 text-base font-medium transition active:scale-[0.97] ${
        actif ? couleurActive : 'border-slate-200 bg-white text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function Compteur({ label, valeur, onChange }: { label: string; valeur: number; onChange: (n: number) => void }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 p-3">
      <p className="mb-2 font-medium text-slate-700">{label}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Retirer 1 (${label})`}
          onClick={() => onChange(Math.max(0, valeur - 1))}
          className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 text-3xl font-bold text-slate-700 active:bg-slate-200"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={valeur}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-14 w-0 min-w-0 flex-1 rounded-xl border border-slate-300 text-center text-2xl font-bold"
        />
        <button
          type="button"
          aria-label={`Ajouter 1 (${label})`}
          onClick={() => onChange(valeur + 1)}
          className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 text-3xl font-bold text-slate-700 active:bg-slate-200"
        >
          +
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[1, 2, 5, 10].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-11 rounded-xl border font-semibold active:bg-slate-100 ${
              valeur === n ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

const RELANCES: { label: string; jours: number }[] = [
  { label: '1 semaine', jours: 7 },
  { label: '2 semaines', jours: 14 },
  { label: '1 mois', jours: 30 },
]

/** Résultat, quantités, relance, remarques et contact : tout se fait au toucher. */
export default function ChampsVisite({
  details,
  onChange,
  contactConnu,
  adresseCommerce,
}: {
  details: DetailsVisite
  onChange: (d: DetailsVisite) => void
  /** Contact déjà connu du commerce : affiché replié pour ne pas le retaper. */
  contactConnu?: boolean
  /** Proposée en un toucher comme adresse de livraison. */
  adresseCommerce?: string | null
}) {
  const [contactOuvert, setContactOuvert] = useState(!contactConnu)
  const [unite, setUnite] = useState<'plateaux' | 'palettes'>(
    details.palettes > 0 && details.plateaux === 0 ? 'palettes' : 'plateaux'
  )
  const set =<K extends keyof DetailsVisite>(k: K, v: DetailsVisite[K]) => onChange({ ...details, [k]: v })

  function basculerRemarque(r: string) {
    set('remarques', details.remarques.includes(r) ? details.remarques.filter((x) => x !== r) : [...details.remarques, r])
  }

  const relanceChoisie = RELANCES.find((r) => dansNJours(r.jours) === details.date_relance)

  return (
    <>
      <Section titre="Résultat">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {RESULTATS.map((r) => (
            <Puce
              key={r.valeur}
              actif={details.resultat === r.valeur}
              couleurActive={r.couleur}
              onClick={() =>
                // Pas de quantité sans précommande.
                onChange(
                  r.valeur === 'precommande'
                    ? { ...details, resultat: r.valeur }
                    : { ...details, resultat: r.valeur, plateaux: 0, palettes: 0 }
                )
              }
            >
              {r.label}
            </Puce>
          ))}
        </div>

      </Section>

      <Section titre="Commande">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['plateaux', 'palettes'] as const).map((u) => (
              <Puce
                key={u}
                actif={unite === u}
                onClick={() => {
                  if (u === unite) return
                  // On commande soit en plateaux, soit en palettes : la quantité suit l'unité choisie.
                  setUnite(u)
                  onChange({ ...details, [u]: details[unite], [unite]: 0 })
                }}
              >
                {u === 'plateaux' ? '📦 Plateaux de 24' : '🚛 Palettes'}
              </Puce>
            ))}
          </div>
          <Compteur
            label={unite === 'plateaux' ? 'Nombre de plateaux de 24' : 'Nombre de palettes'}
            valeur={details[unite]}
            // Une quantité commandée, c'est une précommande.
            onChange={(n) =>
              onChange({ ...details, [unite]: n, ...(n > 0 ? { resultat: 'precommande' as const } : {}) })
            }
          />
          <p className="text-xs text-slate-400">Une quantité indiquée passe la visite en « Précommande ».</p>
        </div>
      </Section>

      <Section titre="Relance">
        <div className="flex flex-wrap gap-2">
          <Puce actif={details.date_relance == null} onClick={() => set('date_relance', null)}>
            Aucune
          </Puce>
          {RELANCES.map((r) => (
            <Puce
              key={r.jours}
              actif={relanceChoisie?.jours === r.jours}
              onClick={() => set('date_relance', dansNJours(r.jours))}
            >
              {r.label}
            </Puce>
          ))}
          <input
            type="date"
            value={details.date_relance ?? ''}
            min={dansNJours(1)}
            onChange={(e) => set('date_relance', e.target.value || null)}
            className="min-h-12 rounded-xl border-2 border-slate-200 px-3 text-base text-slate-700"
          />
        </div>
      </Section>

      <Section titre="Remarques">
        <div className="flex flex-wrap gap-2">
          {REMARQUES_RAPIDES.map((r) => (
            <Puce key={r} actif={details.remarques.includes(r)} onClick={() => basculerRemarque(r)}>
              {r}
            </Puce>
          ))}
        </div>
        <textarea
          value={details.commentaire}
          onChange={(e) => set('commentaire', e.target.value)}
          rows={2}
          placeholder="Autre chose ? (micro 🎤 du clavier pour dicter)"
          className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
        />
      </Section>

      <Section titre="Contact client">
        {!contactOuvert ? (
          <button
            type="button"
            onClick={() => setContactOuvert(true)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left"
          >
            <span className="text-base text-slate-800">
              {details.contact_nom || 'Contact'}
              {details.contact_fonction && <span className="text-slate-500"> · {details.contact_fonction}</span>}
              {details.contact_telephone && <span className="text-slate-500"> · {details.contact_telephone}</span>}
            </span>
            <span className="text-sm font-semibold text-[#b83a2c]">Modifier</span>
          </button>
        ) : (
          <div className="space-y-3">
            <input
              value={details.contact_nom}
              onChange={(e) => set('contact_nom', e.target.value)}
              placeholder="Nom"
              autoComplete="off"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            <div className="flex flex-wrap gap-2">
              {FONCTIONS_CONTACT.map((f) => (
                <Puce
                  key={f}
                  actif={details.contact_fonction === f}
                  onClick={() => set('contact_fonction', details.contact_fonction === f ? '' : f)}
                >
                  {f}
                </Puce>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="tel"
                inputMode="tel"
                value={details.contact_telephone}
                onChange={(e) => set('contact_telephone', e.target.value)}
                placeholder="Téléphone (facultatif)"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
              <input
                type="email"
                inputMode="email"
                value={details.contact_email}
                onChange={(e) => set('contact_email', e.target.value)}
                placeholder="E-mail (facultatif)"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              />
            </div>
            <input
              inputMode="url"
              autoCapitalize="none"
              value={details.reseau_social}
              onChange={(e) => set('reseau_social', e.target.value)}
              placeholder="Réseau social : Instagram, Facebook… (facultatif)"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
            />

            <p className="pt-2 text-sm font-semibold text-slate-600">🚚 Adresse de livraison</p>
            {adresseCommerce && details.adresse_livraison !== adresseCommerce && (
              <button
                type="button"
                onClick={() => set('adresse_livraison', adresseCommerce)}
                className="min-h-11 rounded-xl border-2 border-slate-200 px-4 text-sm font-medium text-slate-700"
              >
                📍 Même adresse que le commerce
              </button>
            )}
            <textarea
              value={details.adresse_livraison}
              onChange={(e) => set('adresse_livraison', e.target.value)}
              rows={2}
              placeholder="Rue, numéro, code postal, commune"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
            />

            <p className="pt-2 text-sm font-semibold text-slate-600">🧾 Facturation</p>
            {details.adresse_livraison && details.adresse_facturation !== details.adresse_livraison && (
              <button
                type="button"
                onClick={() => set('adresse_facturation', details.adresse_livraison)}
                className="min-h-11 rounded-xl border-2 border-slate-200 px-4 text-sm font-medium text-slate-700"
              >
                Même adresse que la livraison
              </button>
            )}
            <textarea
              value={details.adresse_facturation}
              onChange={(e) => set('adresse_facturation', e.target.value)}
              rows={2}
              placeholder="Adresse de facturation (société, rue, numéro, code postal, commune)"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
            <input
              value={details.numero_tva}
              onChange={(e) => set('numero_tva', e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="N° de TVA (ex. BE0123.456.789)"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
            />
          </div>
        )}
      </Section>
    </>
  )
}
