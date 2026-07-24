import { ALLOWED_SYNC_QUEUE_TYPES } from '@/constants/syncQueue.constants'
import db from '@/db/indexedDb'

function ensureValidType(type) {
  if (ALLOWED_SYNC_QUEUE_TYPES.includes(type)) {
    return
  }

  throw new Error(`Unsupported sync queue type: ${type}`)
}

export async function addToQueue(type, payload) {
  ensureValidType(type)

  await db.table('sync_queue').add({
    type,
    payload,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending'
  })
}

export async function getPending() {
  return db.table('sync_queue')
    .where('status')
    .equals('pending')
    .sortBy('timestamp')
}

export async function getById(id) {
  return db.table('sync_queue').get(id)
}

export async function markFailed(id) {
  const item = await db.table('sync_queue').get(id)

  if (!item) {
    return
  }

  await db.table('sync_queue').update(id, {
    retries: (item.retries || 0) + 1,
    status: (item.retries || 0) + 1 >= 3 ? 'failed' : 'pending'
  })
}

export async function markDone(id) {
  await db.table('sync_queue').delete(id)
}

export async function getFailedCount() {
  return db.table('sync_queue')
    .where('status')
    .equals('failed')
    .count()
}

export async function retryFailed() {
  await db.table('sync_queue')
    .where('status')
    .equals('failed')
    .modify({
      status: 'pending',
      retries: 0
    })
}

// После успешной синхронизации create_* заменяет локальный (local_...) id на серверный:
// обновляет доменную таблицу (operations/movements) и переписывает ссылки на этот id в
// остальных ещё не отправленных элементах очереди (update/delete/attach_photo), чтобы они
// ушли с реальным id. Без этого офлайн-запись дублируется при следующем просмотре, а
// PATCH/DELETE по local_-id гарантированно падает 404 (F8).
export async function reconcileLocalId(table, localId, serverRecord) {
  if (!localId || !serverRecord?.id || localId === serverRecord.id) {
    return
  }

  await db.table(table).delete(localId)
  await db.table(table).put(serverRecord)

  const items = await db.table('sync_queue')
    .where('status')
    .anyOf('pending', 'failed')
    .toArray()

  for (const item of items) {
    const payload = item.payload || {}
    let changed = false

    if (payload.id === localId) {
      payload.id = serverRecord.id
      changed = true
    }

    if (payload.operationId === localId) {
      payload.operationId = serverRecord.id
      changed = true
    }

    if (changed) {
      await db.table('sync_queue').update(item.id, { payload })
    }
  }
}
