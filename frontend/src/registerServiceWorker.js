export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js')
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Service worker registration failed', error)
      }
    }
  })
}
