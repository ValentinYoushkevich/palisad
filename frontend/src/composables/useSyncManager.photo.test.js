import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

// pending_photos мокаем: в связке fake-indexeddb+jsdom Blob не переживает structuredClone
// (jsdom-Blob → {}, а jsdom-FormData не принимает Node-Blob) — это ограничение окружения, не
// логики. Отдаём свежий jsdom-Blob, который корректно кладётся в FormData. В браузере один
// realm, Blob хранится и отдаётся Dexie нормально.
const photosState = vi.hoisted(() => ({ list: [] }))
vi.mock('@/db/pendingPhotos.service', () => ({
  getPendingPhotos: vi.fn(async () => photosState.list),
  savePhoto: vi.fn(),
  markPhotoDone: vi.fn(),
  markPhotoFailed: vi.fn()
}))

import { useSyncManager } from '@/composables/useSyncManager'
import db from '@/db/indexedDb'
import { markPhotoDone, markPhotoFailed } from '@/db/pendingPhotos.service'
import { addToQueue, getPending } from '@/db/syncQueue.service'
import http from '@/services/http'

function pendingPhoto() {
  return {
    localId: 'ph1',
    operation_id: 'srv_op',
    blob: new Blob([new Uint8Array(20)], { type: 'image/webp' }),
    mime_type: 'image/webp',
    status: 'pending'
  }
}

describe('useSyncManager photo sync (F13)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    photosState.list = [pendingPhoto()]
    await db.table('sync_queue').clear()
    await db.operations.clear()
  })

  it('processPhotoItem шлёт FormData (поле file), а не {url}, и помечает done', async () => {
    http.post.mockResolvedValue({ data: { id: 'ph_1' } })
    await addToQueue('attach_photo', { operationId: 'srv_op', plantId: 'p1', nurseryId: 'n1', localId: 'ph1' })

    const { processQueue } = useSyncManager()
    await processQueue()

    expect(http.post).toHaveBeenCalledTimes(1)
    const [url, body] = http.post.mock.calls[0]
    expect(url).toBe('/nurseries/n1/plants/p1/operations/srv_op/photos')
    expect(body).toBeInstanceOf(FormData)
    // Blob дошёл как файл, а не сериализовался JSON-ом в {} (главный баг F13).
    expect(body.get('file')).toBeInstanceOf(Blob)
    expect(markPhotoDone).toHaveBeenCalledWith('ph1')
    expect(await getPending()).toHaveLength(0)
  })

  it('reconcile local→server operationId доводит фото до правильной операции', async () => {
    http.post.mockImplementation(async (url) => {
      if (url.endsWith('/operations')) {
        return { data: { id: 'srv_op', plant_id: 'p1', type: 'note' } }
      }
      return { data: { id: 'ph_1' } }
    })

    await db.operations.put({ id: 'local_op', plant_id: 'p1', type: 'note', _pending: true })
    // Порядок: сначала create_operation (реконсилит local_op→srv_op в очереди), затем фото.
    await addToQueue('create_operation', {
      plantId: 'p1', nurseryId: 'n1', localId: 'local_op', clientRequestId: 'uuid', type: 'note'
    })
    await addToQueue('attach_photo', { operationId: 'local_op', plantId: 'p1', nurseryId: 'n1', localId: 'ph1' })

    const { processQueue } = useSyncManager()
    await processQueue()

    const photoCall = http.post.mock.calls.find(([url]) => url.includes('/photos'))
    expect(photoCall[0]).toBe('/nurseries/n1/plants/p1/operations/srv_op/photos')
    expect(await getPending()).toHaveLength(0)
  })

  it('ошибка загрузки помечает pending_photo failed и элемент очереди', async () => {
    http.post.mockRejectedValue({ response: { status: 500 } })
    await addToQueue('attach_photo', { operationId: 'srv_op', plantId: 'p1', nurseryId: 'n1', localId: 'ph1' })

    const { processQueue } = useSyncManager()
    await processQueue()

    expect(markPhotoFailed).toHaveBeenCalledWith('ph1')
    const queue = await getPending()
    expect(queue).toHaveLength(1)
    expect(queue[0].retries).toBe(1)
  })
})
