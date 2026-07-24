import { beforeEach, describe, expect, it, vi } from 'vitest'

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
import { addToQueue, getFailedCount, getPending } from '@/db/syncQueue.service'
import http from '@/services/http'

async function resetTables() {
  await db.table('sync_queue').clear()
  await db.operations.clear()
  await db.movements.clear()
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
})
