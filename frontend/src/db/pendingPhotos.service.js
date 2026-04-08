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

export async function markPhotoFailed(localId) {
  await db.table('pending_photos').update(localId, {
    status: 'failed'
  })
}
