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

// F15: без ограничения роста хэшированные бандлы прошлых деплоев копятся в статик-кэше
// бессрочно (VERSION между деплоями не меняется, имена контентно-хэшированы → новые ключи).
// Ограничиваем число записей и обрезаем самые старые (keys() отдаёт в порядке добавления;
// свежие ассеты текущего билда попадают в конец, старые вытесняются первыми).
const MAX_ASSET_ENTRIES = 100

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
  // Подстраховка: если статик-кэш успел разрастись в прошлой версии SW — обрезаем на активации.
  await trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES)
  await self.clients.claim()
}

// Обрезает кэш до maxEntries, удаляя самые старые записи (по порядку добавления).
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  const excess = keys.length - maxEntries

  if (excess <= 0) {
    return
  }

  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i])
  }
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
    await cache.put(request, response.clone())
    // F15: держим статик-кэш в пределах лимита после каждого нового ассета.
    await trimCache(cacheName, MAX_ASSET_ENTRIES)
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
