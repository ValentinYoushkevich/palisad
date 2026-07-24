import { getPendingPhotos, getPhotoById, markPhotoDone, markPhotoFailed } from '@/db/pendingPhotos.service'
import { getById, getFailedCount, getPending, markDone, markFailed, reconcileLocalId } from '@/db/syncQueue.service'
import http from '@/services/http'
import { useNurseryStore } from '@/stores/nursery.store'
import { photoFileName } from '@/utils/imageDownscale'
import { useToast } from 'primevue/usetoast'
import { ref } from 'vue'

export const syncStatus = ref('idle')
export const pendingCount = ref(0)
export const failedCount = ref(0)

// Мьютекс модульный и СИНХРОННЫЙ: выставляется до первого await, поэтому три инстанса
// useSyncManager (AppLayout, SyncStatusBadge, useNurserySwitch) и повторный вызов на
// событии online не прогоняют одну очередь параллельно и не шлют дубли на сервер (F1).
let isProcessing = false
let onlineListenerBound = false

async function processQueue(toast) {
  if (isProcessing) {
    return
  }

  isProcessing = true
  syncStatus.value = 'syncing'

  try {
    const items = await getPending()
    pendingCount.value = items.length

    const nonPhotos = items.filter((item) => item.type !== 'attach_photo')
    const photos = items.filter((item) => item.type === 'attach_photo')

    // Элементы перечитываются из БД перед отправкой: предыдущий в этом же прогоне create_*
    // мог заменить local_ id на серверный в их payload (F8), а снапшот из getPending —
    // устаревший.
    for (const queued of nonPhotos) {
      const item = await getById(queued.id)
      if (item) {
        await processItem(item, toast)
      }
    }

    for (const queued of photos) {
      const item = await getById(queued.id)
      if (item) {
        await processPhotoItem(item)
      }
    }
  } finally {
    isProcessing = false
    await updateCounts()
  }
}

export function useSyncManager() {
  const toast = useToast()

  // Один слушатель online на весь модуль, а не по одному на каждый инстанс composable:
  // иначе на reconnect processQueue вызывался бы столько раз, сколько живых инстансов (F1).
  if (!onlineListenerBound && typeof window !== 'undefined') {
    onlineListenerBound = true
    window.addEventListener('online', () => {
      processQueue(toast)
    })
  }

  return {
    processQueue: () => processQueue(toast),
    forceSync: () => processQueue(toast),
    syncStatus,
    pendingCount,
    failedCount
  }
}

async function processItem(item, toast) {
  const { type, payload } = item
  // nurseryId берётся из payload (зафиксирован при постановке в очередь), а не из активного
  // стора: иначе после переключения питомника очередь ушла бы в чужой питомник (F7).
  const nurseryId = payload.nurseryId || useNurseryStore().nurseryId

  try {
    if (type === 'create_operation') {
      const response = await http.post(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations`, payload)
      await reconcileLocalId('operations', payload.localId, response?.data)
    } else if (type === 'update_operation') {
      await http.patch(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.id}`, payload)
    } else if (type === 'delete_operation') {
      await http.delete(`/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.id}`)
    } else if (type === 'create_movement') {
      const response = await http.post(`/nurseries/${nurseryId}/plants/${payload.plantId}/movements`, payload)
      await reconcileLocalId('movements', payload.localId, response?.data)
    } else if (type === 'delete_movement') {
      await http.delete(`/nurseries/${nurseryId}/plants/${payload.plantId}/movements/${payload.id}`)
    }

    await markDone(item.id)
  } catch (error) {
    // Идемпотентное удаление: если записи на сервере уже нет (404), повторную доставку
    // delete_* считаем успехом, а не гоняем в ретраи до статуса failed (F2/F8).
    if (isAlreadyDeleted(type, error)) {
      await markDone(item.id)
      return
    }

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

function isAlreadyDeleted(type, error) {
  return (type === 'delete_operation' || type === 'delete_movement') && error?.response?.status === 404
}

async function processPhotoItem(item) {
  const { payload } = item
  const nurseryId = payload.nurseryId || useNurseryStore().nurseryId

  try {
    // F13: запись ищем по ключу НЕЗАВИСИМО от статуса. Раньше поиск шёл только среди
    // 'pending' — фото со статусом 'failed' при ещё живом элементе очереди «не находилось»,
    // элемент закрывался markDone ниже, и блоб терялся навсегда.
    let pending = await getPhotoById(payload.localId)

    if (!pending && payload.operationId) {
      const pendingPhotos = await getPendingPhotos()
      pending = pendingPhotos.find((photo) => photo.operation_id === payload.operationId)
    }

    if (!pending) {
      // Записи действительно нет (уже отправлена и удалена markPhotoDone) — только тогда
      // элемент очереди можно закрывать (F13).
      await markDone(item.id)
      return
    }

    // Мультипарт (поле `file`), а не JSON: Blob уже даунскейлен на этапе savePhoto. Раньше
    // здесь слался { url: pending.blob } — File сериализовался JSON-ом в {} и данные
    // терялись by design (F13). operationId уже реконсилен create_operation'ом на серверный
    // id (non-photo элементы прогоняются до фото), поэтому фото попадает в нужную операцию.
    const formData = new FormData()
    formData.append('file', pending.blob, photoFileName(pending.mime_type || pending.blob?.type))

    await http.post(
      `/nurseries/${nurseryId}/plants/${payload.plantId}/operations/${payload.operationId}/photos`,
      formData
    )

    await markPhotoDone(pending.localId)
    await markDone(item.id)
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Sync photo item failed', error)
    }

    await markFailed(item.id)

    // F13: фото помечаем failed только когда сам элемент очереди исчерпал ретраи и стал
    // 'failed'. Пока элемент pending, транзиентная ошибка не должна трогать статус фото —
    // иначе на следующем прогоне оно «не находилось» и терялось.
    const current = await getById(item.id)
    if (current?.status === 'failed' && payload?.localId !== undefined && payload?.localId !== null) {
      await markPhotoFailed(payload.localId)
    }
  }
}

async function updateCounts() {
  const items = await getPending()
  pendingCount.value = items.length
  failedCount.value = await getFailedCount()
  syncStatus.value = failedCount.value > 0 ? 'error' : 'idle'
}
