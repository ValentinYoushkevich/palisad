import {
  ALLOWED_SYNC_QUEUE_TYPES,
  SYNC_QUEUE_STATUSES
} from '@/constants/syncQueue.constants'
import { dbTables } from '@/db/indexedDb'

function getNowIso() {
  return new Date().toISOString()
}

function ensureValidType(type) {
  if (ALLOWED_SYNC_QUEUE_TYPES.includes(type)) {
    return
  }
  throw new Error(`Unsupported sync queue type: ${type}`)
}

export async function enqueueOfflineMutation({
  type,
  entityId = null,
  payload = {},
  priority = 0
}) {
  ensureValidType(type)

  const nowIso = getNowIso()
  const queueItem = {
    type,
    entityId,
    payload,
    priority,
    status: SYNC_QUEUE_STATUSES.PENDING,
    attempts: 0,
    createdAt: nowIso,
    updatedAt: nowIso
  }

  return dbTables.syncQueue.add(queueItem)
}

export async function getPendingSyncQueueItems() {
  return dbTables.syncQueue
    .where('status')
    .anyOf([
      SYNC_QUEUE_STATUSES.PENDING,
      SYNC_QUEUE_STATUSES.FAILED
    ])
    .sortBy('createdAt')
}

export async function markSyncQueueItemProcessing(id) {
  return dbTables.syncQueue.update(id, {
    status: SYNC_QUEUE_STATUSES.PROCESSING,
    updatedAt: getNowIso()
  })
}

export async function markSyncQueueItemDone(id) {
  return dbTables.syncQueue.update(id, {
    status: SYNC_QUEUE_STATUSES.DONE,
    updatedAt: getNowIso()
  })
}

export async function markSyncQueueItemFailed(id, errorMessage = '') {
  const queueItem = await dbTables.syncQueue.get(id)

  if (!queueItem) {
    return 0
  }

  return dbTables.syncQueue.update(id, {
    status: SYNC_QUEUE_STATUSES.FAILED,
    attempts: (queueItem.attempts || 0) + 1,
    lastError: errorMessage,
    updatedAt: getNowIso()
  })
}
