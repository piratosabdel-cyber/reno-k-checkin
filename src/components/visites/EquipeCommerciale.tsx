import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { generatePassword } from '../../lib/adminAuthClient'
import type { Profile } from '../../types/database'

async function appelerApi(chemin: string, body: unknown): Promise<{ ok: boolean; data: Record<string, string> }> {
  const { data: s } = await supabase.auth.getSession()
  const res = await fetch(chemin, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token}` },
    body: JSON.stringify(body),
  })
  const texte = await res.text()
  try {
    return { ok: res.ok, data: texte ? JSON.parse(texte) : {} }
  } catch {
    return { ok: false, data: { error: `Réponse inattendue du serveur (${res.status})` } }
  }
}

/** Comptes des commerciaux : création, blocage, nouveau mot de passe. */
export default function EquipeCommerciale() {
  const [commerciaux, setCommerciaux] = useState<Profile[]>([])
  const [form, setForm] = useState(false)
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState(generatePassword())
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [identifiants, setIdentifiants] = useState<{ email: string; password: string } | null>(null)
  const [recap, setRecap] = useState<string | null>(null)

  async function charger() {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'commercial').order('full_name')
    setCommerciaux((data as Profile[]) ?? [])
  }

  useEffect(() => {
    charger()
  }, [])

  async function creer(e: FormEvent) {
    e.preventDefault()
    setOccupe(true)
    setErreur(null)
    const { ok, data } = await appelerApi('/api/create-user', {
      email,
      password: motDePasse,
      fullName: nom,
      role: 'commercial',
    })
    setOccupe(false)
    if (!ok) {
      setErreur(data.error ?? 'Création impossible.')
      return
    }
    setIdentifiants({ email, password: motDePasse })
    setNom('')
    setEmail('')
    setMotDePasse(generatePassword())
    setForm(false)
    charger()
  }

  async function nouveauMotDePasse(p: Profile) {
    setErreur(null)
    const { ok, data } = await appelerApi('/api/reset-password', { ouvrierId: p.id })
    if (!ok) {
      setErreur(data.error ?? 'Réinitialisation impossible.')
      return
    }
    setIdentifiants({ email: p.email ?? '', password: data.password })
  }

  async function lancerRecap() {
    setRecap('Envoi en cours…')
    const { data: sess } = await supabase.auth.getSession()
    const res = await fetch('/api/recap-soir', { headers: { Authorization: `Bearer ${sess.session?.access_token}` } })
    const r = (await res.json().catch(() => ({}))) as {
      drive?: { archivees?: number; configure?: boolean; erreur?: string }
      email?: { visites?: number; erreur?: string }
      error?: string
    }
    if (!res.ok) {
      setRecap(r.error ?? `Erreur ${res.status}`)
      return
    }
    const drive = r.drive?.erreur
      ? `Drive : erreur (${r.drive.erreur})`
      : r.drive?.configure === false
        ? 'Drive : pas encore connecté'
        : `Drive : ${r.drive?.archivees ?? 0} visite(s) archivée(s)`
    const email = r.email?.erreur
      ? `e-mail : erreur (${r.email.erreur})`
      : `e-mail envoyé (${r.email?.visites ?? 0} visite(s))`
    setRecap(`${drive} · ${email}`)
  }

  async function basculer(p: Profile) {
    await supabase.from('profiles').update({ active: !p.active }).eq('id', p.id)
    charger()
  }

  return (
    <div className="space-y-4">
      {identifiants && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Identifiants à transmettre (affichés une seule fois) :</p>
          <p className="mt-1 font-mono">
            {identifiants.email} / {identifiants.password}
          </p>
          <p className="mt-1">Adresse de l'app : visites.adalacola.com</p>
          <button onClick={() => setIdentifiants(null)} className="mt-2 font-semibold underline">
            Fermer
          </button>
        </div>
      )}
      {erreur && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex-1 text-sm text-slate-600">
          Chaque soir vers 19 h, les visites sont rangées dans Google Drive et le récapitulatif part vers order@adalacola.com.
          {recap && <p className="mt-1 font-medium text-slate-900">{recap}</p>}
        </div>
        <button onClick={lancerRecap} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">
          Lancer maintenant
        </button>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="font-semibold text-slate-900">Commerciaux</h2>
          <button
            onClick={() => setForm(!form)}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
          >
            + Ajouter
          </button>
        </div>

        {form && (
          <form onSubmit={creer} className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
            <input
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom complet"
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
            <input
              required
              minLength={6}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 font-mono"
            />
            <button disabled={occupe} className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {occupe ? 'Création…' : 'Créer le compte'}
            </button>
          </form>
        )}

        <ul className="divide-y divide-slate-100">
          {commerciaux.length === 0 && <li className="p-4 text-sm text-slate-400">Aucun compte commercial.</li>}
          {commerciaux.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-slate-900">
                  {p.full_name}
                  {!p.active && <span className="ml-2 rounded bg-red-100 px-2 text-xs text-red-700">bloqué</span>}
                </p>
                <p className="text-sm text-slate-500">{p.email}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => nouveauMotDePasse(p)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  Nouveau mot de passe
                </button>
                <button onClick={() => basculer(p)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {p.active ? 'Bloquer' : 'Débloquer'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
