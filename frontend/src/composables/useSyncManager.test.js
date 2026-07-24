import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/http', () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() })
}))

import { useSyncManager } from '@/composables/useSyncManager'
import db from '@/db/indexedDb'
import { addToQueue, getFailedCount, getPending, retryFailed } from '@/db/syncQueue.service'
import http from '@/services/http'

async function resetTables() {
  await db.table('sync_queue').clear()
  await db.table('pending_photos').clear()
  await db.operations.clear()
  await db.movements.clear()
}

// Blob не переживает structuredClone в fake-indexeddb+jsdom (см. useSyncManager.photo.test.js),
// поэтому в F13-тестах blob хранится как Uint8Array, а FormData стабится no-op классом —
// сбой приходит именно из замоканного http.post, как в реальном транзиентном 500.
function seedPendingPhoto(status = 'pending') {
  return db.table('pending_photos').add({
    operation_id: 'srv_op',
    blob: new Uint8Array([1, 2, 3]),
    mime_type: 'image/webp',
    status,
    created_at: Date.now()
  })
}

function queueCreateOperation(overrides = {}) {
  return addToQueue('create_operation', {
    plantId: 'p1',
    nurseryId: 'n1',
    localId: 'local_1',
    clientRequestId: 'uuid-1',
    type: 'note',
    ...overrides
  })
}

describe('useSyncManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await resetTables()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('F1: параллельные processQueue не отправляют один элемент дважды', async () => {
    http.post.mockResolvedValue({ data: { id: 'srv_1', plant_id: 'p1', type: 'note' } })
    await queueCreateOperation()

    const { processQueue } = useSyncManager()
    await Promise.all([processQueue(), processQueue()])

    expect(http.post).toHaveBeenCalledTimes(1)
    expect(await getPending()).toHaveLength(0)
  })

  it('F7: запрос уходит в nurseryId из payload, а не из активного стора', async () => {
    http.post.mockResolvedValue({ data: { id: 'srv_1', plant_id: 'p1', type: 'note' } })
    await queueCreateOperation({ nurseryId: 'fixed-nursery' })

    const { processQueue } = useSyncManager()
    await processQueue()

    expect(http.post).toHaveBeenCalledWith(
      '/nurseries/fixed-nursery/plants/p1/operations',
      expect.objectContaining({ clientRequestId: 'uuid-1' })
    )
  })

  it('F8: create_operation заменяет local_ id серверным в Dexie и в очереди в том же прогоне', async () => {
    http.post.mockResolvedValue({ data: { id: 'srv_9', plant_id: 'p1', type: 'note' } })
    http.patch.mockResolvedValue({ data: {} })

    await db.operations.put({ id: 'local_9', plant_id: 'p1', type: 'note', _pending: true })
    await queueCreateOperation({ localId: 'local_9' })
    await addToQueue('update_operation', { id: 'local_9', plantId: 'p1', nurseryId: 'n1', notes: 'upd' })

    const { processQueue } = useSyncManager()
    await processQueue()

    expect(await db.operations.get('local_9')).toBeUndefined()
    expect(await db.operations.get('srv_9')).toMatchObject({ id: 'srv_9' })
    // update ушёл уже с серверным id, а не с local_9.
    expect(http.patch).toHaveBeenCalledWith(
      '/nurseries/n1/plants/p1/operations/srv_9',
      expect.any(Object)
    )
    expect(await getPending()).toHaveLength(0)
  })

  it('F2/F8: 404 на delete_* считается успехом (идемпотентное удаление), без ретраев', async () => {
    http.delete.mockRejectedValue({ response: { status: 404 } })
    await addToQueue('delete_operation', { id: 'op_1', plantId: 'p1', nurseryId: 'n1' })

    const { processQueue } = useSyncManager()
    await processQueue()

    expect(await getPending()).toHaveLength(0)
    expect(await getFailedCount()).toBe(0)
  })

  it('ошибка сети помечает элемент failed (в pending до 3 попыток)', async () => {
    http.post.mockRejectedValue({ response: { status: 500 } })
    await queueCreateOperation()

    const { processQueue } = useSyncManager()
    await processQueue()

    const pending = await getPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].retries).toBe(1)
  })

  it('F13: транзиентный сбой POST фото не теряет запись и не закрывает элемент markDone', async () => {
    vi.stubGlobal('FormData', class { append() {} })
    http.post.mockRejectedValue({ response: { status: 500 } })
    const localId = await seedPendingPhoto()
    await addToQueue('attach_photo', { operationId: 'srv_op', plantId: 'p1', nurseryId: 'n1', localId })

    const { processQueue } = useSyncManager()
    await processQueue()

    // Первый сбой: элемент очереди остаётся pending, фото НЕ помечено failed.
    let queue = await getPending()
    expect(queue).toHaveLength(1)
    expect(queue[0].retries).toBe(1)
    expect((await db.table('pending_photos').get(localId)).status).toBe('pending')

    // Следующий прогон: фото найдено, отправка повторена — элемент не «закрыт» markDone.
    await processQueue()
    queue = await getPending()
    expect(queue).toHaveLength(1)
    expect(queue[0].retries).toBe(2)
    expect(http.post).toHaveBeenCalledTimes(2)
    expect(await db.table('pending_photos').get(localId)).toBeDefined()
  })

  it('F13: фото помечается failed только при исчерпании ретраев элемента очереди', async () => {
    vi.stubGlobal('FormData', class { append() {} })
    http.post.mockRejectedValue({ response: { status: 500 } })
    const localId = await seedPendingPhoto()
    await addToQueue('attach_photo', { operationId: 'srv_op', plantId: 'p1', nurseryId: 'n1', localId })

    const { processQueue } = useSyncManager()
    await processQueue()
    await processQueue()
    expect((await db.table('pending_photos').get(localId)).status).toBe('pending')

    // Третий сбой переводит элемент очереди в failed — вместе с ним помечается и фото.
    await processQueue()
    expect(await getFailedCount()).toBe(1)
    expect((await db.table('pending_photos').get(localId)).status).toBe('failed')
  })

  it('F13: retryFailed возвращает в pending и элемент очереди, и зависшее фото', async () => {
    const localId = await seedPendingPhoto('failed')
    await db.table('sync_queue').add({
      type: 'attach_photo',
      payload: { operationId: 'srv_op', plantId: 'p1', nurseryId: 'n1', localId },
      timestamp: Date.now(),
      retries: 3,
      status: 'failed'
    })

    await retryFailed()

    const queue = await getPending()
    expect(queue).toHaveLength(1)
    expect(queue[0].retries).toBe(0)
    expect((await db.table('pending_photos').get(localId)).status).toBe('pending')
  })
})
