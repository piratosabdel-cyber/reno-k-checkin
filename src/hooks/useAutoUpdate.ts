import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const INTERVALLE_MS = 5 * 60000

function hashBundleCourant(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  return script?.src.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? null
}

async function hashBundleEnLigne(): Promise<string | null> {
  try {
    const res = await fetch('/index.html', { cache: 'no-store' })
    if (!res.ok) return null
    const html = await res.text()
    return html.match(/index-([A-Za-z0-9_-]+)\.js/)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Une appli web ouverte ne se met pas à jour toute seule : on compare le
 * bundle chargé à celui publié et on recharge la page dès qu'une nouvelle
 * version est en ligne (au retour sur l'appli, à chaque navigation, et
 * périodiquement).
 */
export function useAutoUpdate() {
  const location = useLocation()

  useEffect(() => {
    let enCours = false
    async function verifier() {
      if (enCours || !navigator.onLine || document.visibilityState === 'hidden') return
      enCours = true
      const courant = hashBundleCourant()
      const enLigne = await hashBundleEnLigne()
      enCours = false
      if (courant && enLigne && courant !== enLigne) window.location.reload()
    }

    verifier()
    const timer = setInterval(verifier, INTERVALLE_MS)
    document.addEventListener('visibilitychange', verifier)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', verifier)
    }
  }, [location.pathname])
}
