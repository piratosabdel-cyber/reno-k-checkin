import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function KillSwitchButton() {
  const [appActive, setAppActive] = useState<boolean | null>(null)
  const [armed, setArmed] = useState(false)
  const [working, setWorking] = useState(false)
  const armTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase
      .from('parametres_app')
      .select('app_active')
      .eq('id', 1)
      .single()
      .then(({ data }) => setAppActive(data?.app_active ?? true))
  }, [])

  useEffect(() => () => {
    if (armTimeout.current) clearTimeout(armTimeout.current)
  }, [])

  async function basculer(nouvelEtat: boolean) {
    setWorking(true)
    const { error } = await supabase
      .from('parametres_app')
      .update({ app_active: nouvelEtat, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setWorking(false)
    if (!error) setAppActive(nouvelEtat)
    setArmed(false)
  }

  function handleClick() {
    if (appActive === null || working) return

    // Réactiver : action peu risquée, un seul clic suffit.
    if (!appActive) {
      basculer(true)
      return
    }

    // Désactiver : nécessite un deuxième clic de confirmation (dans les 4s).
    if (!armed) {
      setArmed(true)
      armTimeout.current = setTimeout(() => setArmed(false), 4000)
      return
    }
    if (armTimeout.current) clearTimeout(armTimeout.current)
    basculer(false)
  }

  if (appActive === null) return null

  if (!appActive) {
    return (
      <button
        onClick={handleClick}
        disabled={working}
        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {working ? '...' : '🔓 Réactiver l\'app'}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={working}
      className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
        armed
          ? 'bg-red-600 text-white'
          : 'border border-red-500 text-red-400 hover:bg-red-950'
      }`}
    >
      {working ? '...' : armed ? 'Confirmer ? (coupe pour tous)' : '🔒 Désactiver l\'app'}
    </button>
  )
}
