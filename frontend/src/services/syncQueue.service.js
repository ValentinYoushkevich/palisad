import {
  addToQueue,
  getFailedCount,
  getPending,
  markDone,
  markFailed,
  retryFailed
} from '@/db/syncQueue.service'

// Backward-compatible API for earlier imports.
export async function enqueueOfflineMutation({
  type,
  entityId = null,
  payload = {},
  priority = 0
}) {
  await addToQueue(type, {
    entityId,
    priority,
    ...payload
  })
}

export async function getPendingSyncQueueItems() {
  return getPending()
}

export async function markSyncQueueItemProcessing(_id) {
  return
}

export async function markSyncQueueItemDone(id) {
  await markDone(id)
}

export async function markSyncQueueItemFailed(id) {
  await markFailed(id)
}

export {
  addToQueue, getFailedCount, getPending, markDone, markFailed, retryFailed
}
