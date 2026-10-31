// Service worker minimal : permet d'ouvrir l'app sans réseau (visites hors
// connexion). Les pages passent TOUJOURS d'abord par le réseau, pour que la
// mise à jour automatique continue de fonctionner ; le cache ne sert qu'en
// secours. Les appels à Supabase et à /api ne sont jamais interceptés.
const CACHE = 'app-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Pages : réseau d'abord, copie de secours de index.html.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copie = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copie))
          return res
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Fichiers de l'app (noms uniques à chaque version) et icônes : cache d'abord.
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (enCache) =>
          enCache ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copie = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copie))
            }
            return res
          })
      )
    )
  }
})
