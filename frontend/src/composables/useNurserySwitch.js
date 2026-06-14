import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useSyncManager } from '@/composables/useSyncManager'
import { clearDomainTables } from '@/db/indexedDb'
import { getFailedCount, getPending } from '@/db/syncQueue.service'
import { useNurseryStore } from '@/stores/nursery.store'

export function useNurserySwitch() {
  const nurseryStore = useNurseryStore()
  const { isOnline } = useOnlineStatus()
  const { processQueue } = useSyncManager()

  async function hasUnsynced() {
    const pending = await getPending()
    const failed = await getFailedCount()
    return pending.length > 0 || failed > 0
  }

  async function ensureCanSwitch() {
    if (!isOnline.value) {
      return { ok: false, error: 'Переключение питомника недоступно офлайн.' }
    }

    if (await hasUnsynced()) {
      await processQueue() // попытка синхронизировать
      if (await hasUnsynced()) {
        return {
          ok: false,
          error: 'Есть несинхронизированные изменения. Дождитесь синхронизации и повторите.'
        }
      }
    }

    return { ok: true }
  }

  async function reloadInNewContext() {
    await clearDomainTables()
    globalThis.location.assign('/plants')
  }

  async function switchTo(nurseryId) {
    if (!nurseryId || nurseryId === nurseryStore.activeNurseryId) {
      return { ok: true }
    }

    const guard = await ensureCanSwitch()
    if (!guard.ok) {
      return guard
    }

    const result = await nurseryStore.switchNursery(nurseryId)
    if (!result.ok) {
      return result
    }

    await reloadInNewContext()
    return { ok: true }
  }

  return { switchTo, ensureCanSwitch }
}
