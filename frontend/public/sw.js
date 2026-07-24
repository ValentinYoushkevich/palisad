/* Palisad service worker — офлайн app shell без внешних зависимостей (F3).

   Раньше SW тянул Workbox с CDN (без сети не устанавливался вовсе) и кэшировал только
   script/style/image/font, не обрабатывая навигацию и без precache-манифеста — после
   перезапуска браузера офлайн index.html было взять неоткуда, и приложение не
   открывалось. Теперь всё локально:
   - install: precache app shell (index.html);
   - навигация: network-first со свежим index.html, офлайн-фолбэк на кэш;
   - хэшированные ассеты (js/css/шрифты/картинки): cache-first (имена контентно-хэшированы);
   - /api/: network-first с кэш-фолбэком;
   - при смене VERSION старые кэши (в т.ч. Workbox static-v1/api-v1) удаляются. */

const VERSION = 'v1'
const APP_SHELL_CACHE = `palisad-shell-${VERSION}`
const ASSET_CACHE = `palisad-assets-${VERSION}`
const API_CACHE = `palisad-api-${VERSION}`
const KNOWN_CACHES = new Set([APP_SHELL_CACHE, ASSET_CACHE, API_CACHE])

const APP_SHELL_URLS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupOldCaches())
})

async function precacheAppShell() {
  const cache = await caches.open(APP_SHELL_CACHE)
  await cache.addAll(APP_SHELL_URLS)
  await self.skipWaiting()
}

async function cleanupOldCaches() {
  const keys = await caches.keys()
  await Promise.all(
    keys.filter((key) => !KNOWN_CACHES.has(key)).map((key) => caches.delete(key))
  )
  await self.clients.claim()
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE))
    return
  }

  event.respondWith(cacheFirst(request, ASSET_CACHE))
})

// Навигация: свежий index.html из сети (и обновляем кэш), при офлайне — из app shell.
async function handleNavigation(request) {
  try {
    const response = await fetch(request)
    const cache = await caches.open(APP_SHELL_CACHE)
    cache.put('/index.html', response.clone())
    return response
  } catch (error) {
    const cache = await caches.open(APP_SHELL_CACHE)
    const cached = (await cache.match('/index.html')) || (await cache.match('/'))
    if (cached) {
      return cached
    }
    throw error
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) {
    return cached
  }

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }
    throw error
  }
}
