import { beforeEach, describe, expect, it } from 'vitest'

import db from '@/db/indexedDb'
import {
  addToQueue,
  getFailedCount,
  getPending,
  markDone,
  markFailed,
  reconcileLocalId,
  retryFailed
} from '@/db/syncQueue.service'

async function resetTables() {
  await db.table('sync_queue').clear()
  await db.operations.clear()
  await db.movements.clear()
}

describe('syncQueue.service', () => {
  beforeEach(resetTables)

  it('addToQueue сохраняет тип, payload (с зафиксированным nurseryId) и статус pending', async () => {
    await addToQueue('create_operation', { plantId: 'p1', nurseryId: 'n1', type: 'note' })

    const pending = await getPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].type).toBe('create_operation')
    expect(pending[0].payload.nurseryId).toBe('n1')
    expect(pending[0].status).toBe('pending')
    expect(pending[0].retries).toBe(0)
  })

  it('addToQueue отвергает неизвестный тип', async () => {
    await expect(addToQueue('bogus_type', {})).rejects.toThrow(/Unsupported sync queue type/)
  })

  it('getPending возвращает только pending, отсортированные по timestamp', async () => {
    await addToQueue('create_operation', { plantId: 'a' })
    await addToQueue('create_movement', { plantId: 'b' })

    const pending = await getPending()
    expect(pending.map((item) => item.payload.plantId)).toEqual(['a', 'b'])
  })

  it('markFailed инкрементит retries и переводит в failed после 3 попыток', async () => {
    await addToQueue('delete_operation', { id: 'x', plantId: 'p' })
    const [item] = await getPending()

    await markFailed(item.id)
    await markFailed(item.id)
    expect(await getFailedCount()).toBe(0)

    await markFailed(item.id)
    expect(await getFailedCount()).toBe(1)
    expect(await getPending()).toHaveLength(0)

    await retryFailed()
    expect(await getFailedCount()).toBe(0)
    expect(await getPending()).toHaveLength(1)
  })

  it('markDone удаляет элемент из очереди', async () => {
    await addToQueue('create_operation', { plantId: 'p' })
    const [item] = await getPending()

    await markDone(item.id)
    expect(await getPending()).toHaveLength(0)
  })

  describe('reconcileLocalId (F8)', () => {
    it('заменяет локальную запись серверной в доменной таблице', async () => {
      await db.operations.put({ id: 'local_1', plant_id: 'p', type: 'note', _pending: true })

      await reconcileLocalId('operations', 'local_1', { id: 'srv_1', plant_id: 'p', type: 'note' })

      expect(await db.operations.get('local_1')).toBeUndefined()
      expect(await db.operations.get('srv_1')).toMatchObject({ id: 'srv_1', plant_id: 'p' })
    })

    it('переписывает local_ id в payload последующих элементов очереди', async () => {
      await db.operations.put({ id: 'local_2', plant_id: 'p', type: 'note' })
      await addToQueue('update_operation', { id: 'local_2', plantId: 'p', nurseryId: 'n', notes: 'upd' })
      await addToQueue('attach_photo', { operationId: 'local_2', plantId: 'p', nurseryId: 'n', localId: 'photo_1' })

      await reconcileLocalId('operations', 'local_2', { id: 'srv_2', plant_id: 'p', type: 'note' })

      const pending = await getPending()
      const update = pending.find((item) => item.type === 'update_operation')
      const photo = pending.find((item) => item.type === 'attach_photo')
      expect(update.payload.id).toBe('srv_2')
      expect(photo.payload.operationId).toBe('srv_2')
      // localId самой фотографии не трогается — это id другой сущности.
      expect(photo.payload.localId).toBe('photo_1')
    })

    it('ничего не делает, если серверная запись без id', async () => {
      await addToQueue('update_operation', { id: 'local_3', plantId: 'p' })

      await reconcileLocalId('operations', 'local_3', null)

      const [item] = await getPending()
      expect(item.payload.id).toBe('local_3')
    })
  })
})
