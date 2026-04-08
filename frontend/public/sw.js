/* global importScripts, workbox */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js')

if (workbox) {
  workbox.core.clientsClaim()
  workbox.core.skipWaiting()

  workbox.routing.registerRoute(
    ({ request }) => ['script', 'style', 'image', 'font'].includes(request.destination),
    new workbox.strategies.CacheFirst({
      cacheName: 'static-v1'
    })
  )

  workbox.routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/api/'),
    new workbox.strategies.NetworkFirst({
      cacheName: 'api-v1'
    })
  )
}
