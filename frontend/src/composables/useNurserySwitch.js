import { useNurseryStore } from '@/stores/nursery.store'

// Офлайн-гард и очистка Dexie добавляются в задаче MultiNurseryOffline.md
// (меняются тела ensureCanSwitch и reloadInNewContext).
export function useNurserySwitch() {
  const nurseryStore = useNurseryStore()

  async function ensureCanSwitch() {
    return { ok: true }
  }

  async function reloadInNewContext() {
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
