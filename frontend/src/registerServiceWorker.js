function debugSwLog(debugEnabled, message, payload) {
  if (!debugEnabled) {
    return
  }

  if (payload === undefined) {
    console.info(`[sw] ${message}`)
    return
  }

  console.info(`[sw] ${message}`, payload)
}

function bindUpdateLogs(registration, debug) {
  registration.addEventListener('updatefound', () => {
    debugSwLog(debug, 'updatefound')

    const nextWorker = registration.installing

    if (!nextWorker) {
      return
    }

    nextWorker.addEventListener('statechange', () => {
      debugSwLog(debug, 'worker state', {
        state: nextWorker.state
      })
    })
  })
}

export async function registerServiceWorker(options = {}) {
  const {
    enableInDev = false,
    debug = false
  } = options

  if (!('serviceWorker' in navigator)) {
    return
  }

  if (import.meta.env.DEV && !enableInDev) {
    const registrations = await navigator.serviceWorker.getRegistrations()

    for (const registration of registrations) {
      await registration.unregister()
    }

    debugSwLog(debug, 'Disabled in dev. Existing registrations removed.')
    return
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    debugSwLog(debug, 'controllerchange')
  })

  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error)
      return null
    })

    if (!registration) {
      return
    }

    debugSwLog(debug, 'registered', {
      scope: registration.scope
    })
    bindUpdateLogs(registration, debug)
  })
}
