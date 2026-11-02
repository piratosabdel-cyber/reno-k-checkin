import { useState, type ReactNode } from 'react'
import type { ResultatVisite } from '../../types/database'
import { FONCTIONS_CONTACT, REMARQUES_RAPIDES, RESULTATS, dansNJours } from '../../lib/visites'
import { tr, useLangue } from '../../lib/langue'

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
  numero_entreprise: string
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
  numero_entreprise: '',
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

const ICONES: Record<string, ReactNode> = {
  personne: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  telephone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  entreprise: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></>,
  facture: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h7M9 17h7" /></>,
  livraison: <><path d="M1 4h13v12H1zM14 8h4l3 4v4h-7" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="17.5" cy="18.5" r="2" /></>,
  reseau: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
}

/** Champ avec son icône à gauche, comme un formulaire d'inscription. */
function ChampIcone({
  icone,
  valeur,
  onValeur,
  lignes,
  ...props
}: {
  icone: keyof typeof ICONES
  valeur: string
  onValeur: (v: string) => void
  lignes?: number
  placeholder: string
  type?: string
  inputMode?: 'text' | 'tel' | 'email' | 'url'
  autoCapitalize?: string
}) {
  const classe = 'min-w-0 flex-1 bg-transparent px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none'
  const commun = { ...props, value: valeur, autoComplete: 'off', className: classe }
  return (
    <label className="flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-[#b83a2c] focus-within:ring-1 focus-within:ring-[#b83a2c]">
      <span className={`flex w-12 shrink-0 justify-center border-r border-slate-200 bg-slate-50 text-slate-600 ${lignes ? 'pt-3.5' : 'items-center'}`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {ICONES[icone]}
        </svg>
      </span>
      {lignes ? (
        <textarea {...commun} rows={lignes} className={`${classe} resize-none`} onChange={(e) => onValeur(e.target.value)} />
      ) : (
        <input {...commun} onChange={(e) => onValeur(e.target.value)} />
      )}
    </label>
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
          aria-label={`${tr('Retirer 1', '1 minder')} (${label})`}
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
          aria-label={`${tr('Ajouter 1', '1 meer')} (${label})`}
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

const RELANCES: { label: string; nl: string; jours: number }[] = [
  { label: '1 semaine', nl: '1 week', jours: 7 },
  { label: '2 semaines', nl: '2 weken', jours: 14 },
  { label: '1 mois', nl: '1 maand', jours: 30 },
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
  /** Proposée en un toucher comme adresse de facturation. */
  adresseCommerce?: string | null
}) {
  const { t, labelResultat, libelle } = useLangue()
  const [contactOuvert, setContactOuvert] = useState(!contactConnu)
  const [livraisonIdentique, setLivraisonIdentique] = useState(
    !details.adresse_livraison || details.adresse_livraison === details.adresse_facturation
  )
  const [unite, setUnite] = useState<'plateaux' | 'palettes'>(
    details.palettes > 0 && details.plateaux === 0 ? 'palettes' : 'plateaux'
  )
  // Quantité en cours de choix : elle n'entre dans la commande qu'une fois confirmée.
  const [saisie, setSaisie] = useState<number | null>(null)
  const quantite = saisie ?? details[unite]
  const dansCommande = details[unite] > 0
  const nomUnite = (u: 'plateaux' | 'palettes') =>
    u === 'plateaux' ? t('📦 Plateaux de 24', '📦 Trays van 24') : t('🚛 Palettes', '🚛 Paletten')

  function choisirUnite(u: 'plateaux' | 'palettes') {
    setUnite(u)
    setSaisie(null)
  }

  function mettreQuantite(u: 'plateaux' | 'palettes', n: number) {
    // Une quantité commandée, c'est une précommande.
    onChange({ ...details, [u]: n, ...(n > 0 ? { resultat: 'precommande' as const } : {}) })
  }
  const set =<K extends keyof DetailsVisite>(k: K, v: DetailsVisite[K]) => onChange({ ...details, [k]: v })

  function basculerRemarque(r: string) {
    set('remarques', details.remarques.includes(r) ? details.remarques.filter((x) => x !== r) : [...details.remarques, r])
  }

  const relanceChoisie = RELANCES.find((r) => dansNJours(r.jours) === details.date_relance)

  return (
    <>
      <Section titre={t('Résultat', 'Resultaat')}>
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
              {labelResultat(r.valeur)}
            </Puce>
          ))}
        </div>

      </Section>

      <Section titre={t('Commande', 'Bestelling')}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['plateaux', 'palettes'] as const).map((u) => (
              <Puce key={u} actif={unite === u} onClick={() => choisirUnite(u)}>
                {nomUnite(u)}
              </Puce>
            ))}
          </div>
          <Compteur
            label={unite === 'plateaux' ? t('Nombre de plateaux de 24', 'Aantal trays van 24') : t('Nombre de palettes', 'Aantal paletten')}
            valeur={quantite}
            onChange={setSaisie}
          />
          {(quantite > 0 || dansCommande) && (
            <button
              type="button"
              disabled={quantite === details[unite]}
              onClick={() => {
                mettreQuantite(unite, quantite)
                setSaisie(null)
              }}
              className={`min-h-14 w-full rounded-xl text-lg font-semibold active:scale-[0.99] ${
                quantite === details[unite]
                  ? 'border-2 border-emerald-200 bg-emerald-50 text-emerald-700'
                  : quantite === 0
                    ? 'border-2 border-red-200 bg-white text-red-700'
                    : 'bg-emerald-600 text-white'
              }`}
            >
              {quantite === details[unite]
                ? t('✓ Dans la commande', '✓ In de bestelling')
                : quantite === 0
                  ? t('Retirer de la commande', 'Uit de bestelling halen')
                  : dansCommande
                    ? t(`✓ Confirmer : ${quantite}`, `✓ Bevestigen: ${quantite}`)
                    : t(`✓ Ajouter à la commande : ${quantite}`, `✓ Toevoegen aan bestelling: ${quantite}`)}
            </button>
          )}

          {/* Récapitulatif : chaque produit commandé, modifiable. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-700">{t('Votre commande', 'Uw bestelling')}</p>
            {details.plateaux + details.palettes === 0 ? (
              <p className="text-sm text-slate-400">{t('Aucun produit pour l’instant.', 'Nog geen producten.')}</p>
            ) : (
              <ul className="space-y-2">
                {(['plateaux', 'palettes'] as const)
                  .filter((u) => details[u] > 0)
                  .map((u) => (
                    <li key={u} className="flex items-center gap-2 rounded-lg bg-white p-2 shadow-sm">
                      <span className="min-w-0 flex-1 text-base text-slate-800">{nomUnite(u)}</span>
                      <span className="w-12 text-right text-xl font-bold text-slate-900">{details[u]}</span>
                      <button
                        type="button"
                        onClick={() => choisirUnite(u)}
                        className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
                      >
                        {t('Modifier', 'Wijzigen')}
                      </button>
                      <button
                        type="button"
                        aria-label={t('Retirer', 'Verwijderen')}
                        onClick={() => {
                          mettreQuantite(u, 0)
                          if (u === unite) setSaisie(null)
                        }}
                        className="min-h-11 w-11 rounded-lg border border-slate-300 text-lg text-slate-500 active:bg-slate-100"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {t('Un produit ajouté passe la visite en « Précommande ».', 'Met een product wordt het bezoek een « Voorbestelling ».')}
          </p>
        </div>
      </Section>

      <Section titre={t('Relance', 'Opvolging')}>
        <div className="flex flex-wrap gap-2">
          <Puce actif={details.date_relance == null} onClick={() => set('date_relance', null)}>
            {t('Aucune', 'Geen')}
          </Puce>
          {RELANCES.map((r) => (
            <Puce
              key={r.jours}
              actif={relanceChoisie?.jours === r.jours}
              onClick={() => set('date_relance', dansNJours(r.jours))}
            >
              {t(r.label, r.nl)}
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

      <Section titre={t('Remarques', 'Opmerkingen')}>
        <div className="flex flex-wrap gap-2">
          {REMARQUES_RAPIDES.map((r) => (
            <Puce key={r} actif={details.remarques.includes(r)} onClick={() => basculerRemarque(r)}>
              {libelle(r)}
            </Puce>
          ))}
        </div>
        <textarea
          value={details.commentaire}
          onChange={(e) => set('commentaire', e.target.value)}
          rows={2}
          placeholder={t('Autre chose ? (micro 🎤 du clavier pour dicter)', 'Nog iets? (🎤 van het toetsenbord om te dicteren)')}
          className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
        />
      </Section>

      <Section titre={t('Contact client', 'Contact klant')}>
        {!contactOuvert ? (
          <button
            type="button"
            onClick={() => setContactOuvert(true)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left"
          >
            <span className="text-base text-slate-800">
              {details.contact_nom || t('Contact', 'Contact')}
              {details.contact_fonction && <span className="text-slate-500"> · {libelle(details.contact_fonction)}</span>}
              {details.contact_telephone && <span className="text-slate-500"> · {details.contact_telephone}</span>}
            </span>
            <span className="text-sm font-semibold text-[#b83a2c]">{t('Modifier', 'Wijzigen')}</span>
          </button>
        ) : (
          <div className="space-y-3">
            <ChampIcone icone="personne" valeur={details.contact_nom} onValeur={(v) => set('contact_nom', v)} placeholder={t('Nom du contact', 'Naam contactpersoon')} />
            <div className="flex flex-wrap gap-2">
              {FONCTIONS_CONTACT.map((f) => (
                <Puce
                  key={f}
                  actif={details.contact_fonction === f}
                  onClick={() => set('contact_fonction', details.contact_fonction === f ? '' : f)}
                >
                  {libelle(f)}
                </Puce>
              ))}
            </div>
            <ChampIcone icone="telephone" type="tel" inputMode="tel" valeur={details.contact_telephone} onValeur={(v) => set('contact_telephone', v)} placeholder={t('Téléphone', 'Telefoon')} />
            <ChampIcone icone="mail" type="email" inputMode="email" autoCapitalize="none" valeur={details.contact_email} onValeur={(v) => set('contact_email', v)} placeholder={t('E-mail', 'E-mail')} />

            <ChampIcone icone="entreprise" valeur={details.numero_entreprise} onValeur={(v) => set('numero_entreprise', v)} placeholder={t("N° d'entreprise (BCE)", 'Ondernemingsnummer (KBO)')} />
            <ChampIcone icone="facture" lignes={2} valeur={details.adresse_facturation} onValeur={(v) => onChange({ ...details, adresse_facturation: v, ...(livraisonIdentique ? { adresse_livraison: v } : {}) })} placeholder={t('Adresse de facturation', 'Facturatieadres')} />
            {adresseCommerce && !details.adresse_facturation && (
              <button
                type="button"
                onClick={() => onChange({ ...details, adresse_facturation: adresseCommerce, ...(livraisonIdentique ? { adresse_livraison: adresseCommerce } : {}) })}
                className="min-h-11 rounded-xl border-2 border-slate-200 px-4 text-sm font-medium text-slate-700"
              >
                📍 {t("Reprendre l'adresse du commerce", 'Adres van de zaak overnemen')}
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={livraisonIdentique}
              onClick={() => {
                // Identique : la livraison suit la facturation. Sinon, on repart d'un champ vide.
                setLivraisonIdentique(!livraisonIdentique)
                set('adresse_livraison', livraisonIdentique ? '' : details.adresse_facturation)
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-3 text-left"
            >
              <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${livraisonIdentique ? 'bg-[#b83a2c]' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${livraisonIdentique ? 'left-6' : 'left-1'}`} />
              </span>
              <span className="text-base text-slate-800">
                {t('Adresse de livraison identique à la facturation', 'Leveringsadres zelfde als facturatieadres')}
              </span>
            </button>
            {!livraisonIdentique && (
              <ChampIcone icone="livraison" lignes={2} valeur={details.adresse_livraison} onValeur={(v) => set('adresse_livraison', v)} placeholder={t('Adresse de livraison', 'Leveringsadres')} />
            )}
            <ChampIcone icone="reseau" inputMode="url" autoCapitalize="none" valeur={details.reseau_social} onValeur={(v) => set('reseau_social', v)} placeholder={t('Réseaux sociaux (Instagram, Facebook…)', 'Sociale media (Instagram, Facebook…)')} />
          </div>
        )}
      </Section>
    </>
  )
}
