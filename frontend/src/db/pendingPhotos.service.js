import db from '@/db/indexedDb'

export async function savePhoto(operationId, file) {
  const localId = await db.table('pending_photos').add({
    operation_id: operationId,
    blob: file,
    mime_type: file.type,
    status: 'pending',
    created_at: Date.now()
  })

  return localId
}

export async function getPendingPhotos() {
  return db.table('pending_photos')
    .where('status')
    .equals('pending')
    .toArray()
}

export async function markPhotoDone(localId) {
  await db.table('pending_photos').delete(localId)
}

// F13: поиск по ключу независимо от статуса. Иначе фото со статусом 'failed' «не
// находилось» при живом элементе очереди, и элемент закрывался markDone с потерей блоба.
export async function getPhotoById(localId) {
  if (localId === null || localId === undefined) {
    return undefined
  }

  return db.table('pending_photos').get(localId)
}

export async function markPhotoFailed(localId) {
  await db.table('pending_photos').update(localId, {
    status: 'failed'
  })
}

// F13: при ручном повторе (retryFailed) зависшие фото возвращаются в pending вместе с
// элементами sync_queue — раньше failed-фото было нечем реанимировать.
export async function resetFailedPhotos() {
  await db.table('pending_photos')
    .where('status')
    .equals('failed')
    .modify({ status: 'pending' })
}
