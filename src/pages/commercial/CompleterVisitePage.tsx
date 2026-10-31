import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { demanderArchivageDrive } from '../../lib/visitesQueue'
import type { Visite } from '../../types/database'
import AdalaHeader from '../../components/visites/AdalaHeader'
import ChampsVisite, { DETAILS_VIDES, type DetailsVisite } from '../../components/visites/ChampsVisite'

/** Complète une visite enregistrée en vitesse (GPS, heure et photo restent ceux de la visite). */
export default function CompleterVisitePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [nom, setNom] = useState('')
  const [details, setDetails] = useState<DetailsVisite | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    supabase
      .from('visites')
      .select('*, commerce:commerces(nom)')
      .eq('id', id!)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setErreur(navigator.onLine ? 'Visite introuvable.' : 'Connecte-toi à internet pour compléter cette visite.')
          return
        }
        const v = data as Visite & { commerce: { nom: string } }
        setNom(v.commerce.nom)
        setDetails({
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
        })
      })
  }, [id])

  async function enregistrer() {
    if (!details) return
    if (details.resultat === 'precommande' && details.plateaux + details.palettes === 0) {
      setErreur('Indique le nombre de plateaux ou de palettes.')
      return
    }
    setEnvoi(true)
    setErreur(null)
    const d = details
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
        a_completer: false,
      })
      .eq('id', id!)
    setEnvoi(false)
    if (error) {
      setErreur(navigator.onLine ? `Enregistrement refusé (${error.message}).` : 'Pas de connexion : réessaie dans un instant.')
      return
    }
    demanderArchivageDrive()
    navigate('/visites', { replace: true, state: { message: `Visite chez ${nom} complétée ✓` } })
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-32">
      <AdalaHeader
        titre={nom ? `Compléter : ${nom}` : 'Compléter la visite'}
        droite={
          <Link to="/visites" className="rounded-lg px-3 py-2 text-sm text-slate-300">
            Retour
          </Link>
        }
      />
      <main className="mx-auto max-w-3xl space-y-3 px-3 py-3">
        {details ? (
          <ChampsVisite details={details} onChange={setDetails} contactConnu={!!details.contact_nom} />
        ) : (
          !erreur && <p className="py-10 text-center text-slate-400">Chargement…</p>
        )}
      </main>
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-3 py-3">
        <div className="mx-auto max-w-3xl space-y-2">
          {erreur && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {erreur}
            </p>
          )}
          {details && (
            <button
              onClick={enregistrer}
              disabled={envoi}
              className="min-h-14 w-full rounded-xl bg-[#b83a2c] text-lg font-bold text-white disabled:opacity-50"
            >
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
