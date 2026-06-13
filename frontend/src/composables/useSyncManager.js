import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { getPendingPhotos, markPhotoDone, markPhotoFailed } from '@/db/pendingPhotos.service'
import { getById, getFailedCount, getPending, markDone, markFailed } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { useToast } from 'primevue/usetoast'
import { ref, watch } from 'vue'

export const syncStatus = ref('idle')
export const pendingCount = ref(0)
export const failedCount = ref(0)

export function useSyncManager() {
  const { isOnline } = useOnlineStatus()
  const toast = useToast()

  watch(isOnline, (online) => {
    if (online) {
      processQueue()
    }
  })

  async function processQueue() {
    if (syncStatus.value === 'syncing') {
      return
    }

    const items = await getPending()
    if (!items.length) {
      await updateCounts()
      return
    }

    syncStatus.value = 'syncing'
    pendingCount.value = items.length

    const nonPhotos = items.filter((item) => item.type !== 'attach_photo')
    const photos = items.filter((item) => item.type === 'attach_photo')

    for (const item of nonPhotos) {
      await processItem(item, toast)
    }

    for (const item of photos) {
      await processPhotoItem(item)
    }

    syncStatus.value = 'idle'
    await updateCounts()
  }

  async function forceSync() {
    await processQueue()
  }

  return {
    processQueue,
    forceSync,
    syncStatus,
    pendingCount,
    failedCount
  }
}

async function processItem(item, toast) {
  const nurseryStore = useNurseryStore()
  const nurseryId = nurseryStore.nurseryId
  const { type, payload } = item

  try {
    if (type === 'create_operation') {
      await http.post(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations`, payload)
    } else if (type === 'update_operation') {
      await http.patch(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.id}`, payload)
    } else if (type === 'delete_operation') {
      await http.delete(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.id}`)
    } else if (type === 'create_movement') {
      await http.post(`/nurseries/${nurseryId}/plants/${payload.plantId}/movements`, payload)
    } else if (type === 'delete_movement') {
      await http.delete(`/nurseries/${nurseryId}/plants/${payload.plantId}/movements/${payload.id}`)
    }

    await markDone(item.id)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Sync item failed', error)
    }

    await markFailed(item.id)

    const current = await getById(item.id)
    if (current?.status === 'failed') {
      toast.add({
        severity: 'warn',
        summary: 'Ошибка синхронизации',
        detail: 'Не удалось отправить запись после 3 попыток. Нажмите повтор для ручного запуска.',
        life: 8000
      })
    }
  }
}

async function processPhotoItem(item) {
  const nurseryStore = useNurseryStore()
  const nurseryId = nurseryStore.nurseryId
  const { payload } = item

  try {
    const pendingPhotos = await getPendingPhotos()
    const pending = pendingPhotos.find(
      (photo) => photo.localId === payload.localId || photo.operation_id === payload.operationId
    )

    if (!pending) {
      await markDone(item.id)
      return
    }

    await http.post(
      `/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.operationId}/photos`,
      { url: pending.blob }
    )

    await markPhotoDone(pending.localId)
    await markDone(item.id)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Sync photo item failed', error)
    }

    if (payload?.localId) {
      await markPhotoFailed(payload.localId)
    }
    await markFailed(item.id)
  }
}

async function updateCounts() {
  const items = await getPending()
  pendingCount.value = items.length
  failedCount.value = await getFailedCount()
  syncStatus.value = failedCount.value > 0 ? 'error' : 'idle'
}
