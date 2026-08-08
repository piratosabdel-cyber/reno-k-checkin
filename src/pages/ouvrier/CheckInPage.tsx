import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { distanceMetres, getCurrentPosition } from '../../lib/geo'
import type { Chantier, Pointage } from '../../types/database'

function formatDuree(startIso: string) {
  const ms = Date.now() - new Date(startIso).getTime()
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

export default function CheckInPage() {
  const { profile, signOut } = useAuth()
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [chantierId, setChantierId] = useState<string>('')
  const [openPointage, setOpenPointage] = useState<(Pointage & { chantier?: Chantier }) | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'warning' | 'info'; text: string } | null>(
    null
  )
  const [, forceTick] = useState(0)

  const loadData = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const [{ data: assigned }, { data: allActive }, { data: openRows }] = await Promise.all([
      supabase
        .from('chantier_assignments')
        .select('chantier:chantiers(*)')
        .eq('ouvrier_id', profile.id),
      supabase.from('chantiers').select('*').eq('statut', 'actif').order('nom'),
      supabase
        .from('pointages')
        .select('*, chantier:chantiers(*)')
        .eq('ouvrier_id', profile.id)
        .is('check_out_at', null)
        .limit(1),
    ])

    const assignedActive =
      (assigned
        ?.map((a) => a.chantier as unknown as Chantier)
        .filter((c) => c && c.statut === 'actif') as Chantier[]) ?? []

    const list = assignedActive.length > 0 ? assignedActive : (allActive ?? [])
    setChantiers(list)

    const open = openRows?.[0] as (Pointage & { chantier?: Chantier }) | undefined
    setOpenPointage(open ?? null)
    if (!open && list.length > 0) setChantierId(list[0].id)

    setLoading(false)
  }, [profile])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Rafraîchit le chrono affiché toutes les 30s pendant un pointage ouvert
  useEffect(() => {
    if (!openPointage) return
    const t = setInterval(() => forceTick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [openPointage])

  async function handleCheckIn() {
    if (!profile || !chantierId) return
    setWorking(true)
    setMessage(null)

    let lat: number | null = null
    let lng: number | null = null
    let distance: number | null = null

    try {
      const pos = await getCurrentPosition()
      lat = pos.lat
      lng = pos.lng
      const chantier = chantiers.find((c) => c.id === chantierId)
      if (chantier?.latitude != null && chantier?.longitude != null) {
        distance = Math.round(distanceMetres(lat, lng, chantier.latitude, chantier.longitude))
        if (distance > chantier.rayon_metres) {
          setMessage({
            type: 'warning',
            text: `Attention : tu sembles à ${distance} m du chantier. Le pointage a quand même été enregistré.`,
          })
        }
      }
    } catch {
      setMessage({
        type: 'warning',
        text: "Position GPS non disponible — pointage enregistré sans localisation.",
      })
    }

    const { data, error } = await supabase
      .from('pointages')
      .insert({
        ouvrier_id: profile.id,
        chantier_id: chantierId,
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_distance_m: distance,
      })
      .select('*, chantier:chantiers(*)')
      .single()

    setWorking(false)

    if (error) {
      setMessage({ type: 'error', text: "Erreur lors du check-in. Réessaie." })
      return
    }
    setOpenPointage(data as Pointage & { chantier?: Chantier })
  }

  async function handleCheckOut() {
    if (!openPointage) return
    setWorking(true)
    setMessage(null)

    let lat: number | null = null
    let lng: number | null = null
    try {
      const pos = await getCurrentPosition()
      lat = pos.lat
      lng = pos.lng
    } catch {
      // pas bloquant au check-out
    }

    const { error } = await supabase
      .from('pointages')
      .update({ check_out_at: new Date().toISOString(), check_out_lat: lat, check_out_lng: lng })
      .eq('id', openPointage.id)

    setWorking(false)

    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors du check-out. Réessaie.' })
      return
    }
    setOpenPointage(null)
    loadData()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Chargement...
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
        <div>
          <p className="text-sm text-slate-400">Reno-K</p>
          <p className="font-semibold">{profile?.full_name}</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 active:bg-slate-800"
        >
          Déconnexion
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-8">
        {openPointage ? (
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">
              En cours
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {openPointage.chantier?.nom ?? 'Chantier'}
            </h2>
            <p className="mt-2 text-slate-500">
              Arrivée à{' '}
              {new Date(openPointage.check_in_at).toLocaleTimeString('fr-BE', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              — {formatDuree(openPointage.check_in_at)}
            </p>

            <button
              onClick={handleCheckOut}
              disabled={working}
              className="mt-8 w-full rounded-2xl bg-red-600 py-6 text-2xl font-bold text-white shadow active:bg-red-700 disabled:opacity-50"
            >
              {working ? '...' : 'CHECK-OUT'}
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm">
            <label htmlFor="chantier" className="mb-2 block text-lg font-semibold text-slate-800">
              Chantier
            </label>
            <select
              id="chantier"
              value={chantierId}
              onChange={(e) => setChantierId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
            >
              {chantiers.length === 0 && <option value="">Aucun chantier actif</option>}
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>

            <button
              onClick={handleCheckIn}
              disabled={working || !chantierId}
              className="mt-6 w-full rounded-2xl bg-emerald-600 py-6 text-2xl font-bold text-white shadow active:bg-emerald-700 disabled:opacity-50"
            >
              {working ? '...' : 'CHECK-IN'}
            </button>
          </div>
        )}

        {message && (
          <p
            role="alert"
            className={`w-full max-w-md rounded-xl px-4 py-3 text-center text-sm ${
              message.type === 'error'
                ? 'bg-red-50 text-red-700'
                : message.type === 'warning'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-slate-50 text-slate-700'
            }`}
          >
            {message.text}
          </p>
        )}
      </main>
    </div>
  )
}
