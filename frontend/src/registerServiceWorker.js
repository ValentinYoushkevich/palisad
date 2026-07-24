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

// F14: решаем, перезагружать ли страницу при смене контроллера SW.
// - Перезагружаем только если контроллер УЖЕ был (обновление активного SW): свежий SW после
//   skipWaiting+clients.claim перехватил клиента, старый бандл работал бы с новым кэшем.
// - Первую установку (контроллера не было) не перезагружаем — бандл и так свежий.
// - Guard alreadyReloading не даёт зациклить reload.
export function shouldReloadAfterControllerChange({ hadController, alreadyReloading }) {
  return Boolean(hadController) && !alreadyReloading
}

function bindControllerReload(debug) {
  // Снимок наличия контроллера ДО установки нового SW фиксируем один раз при регистрации.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let alreadyReloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    debugSwLog(debug, 'controllerchange')

    if (!shouldReloadAfterControllerChange({ hadController, alreadyReloading })) {
      return
    }

    alreadyReloading = true
    globalThis.location.reload()
  })
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

  bindControllerReload(debug)

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
