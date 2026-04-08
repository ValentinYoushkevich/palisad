import Dexie from 'dexie'

export const indexedDb = new Dexie('palisadOfflineDb')

indexedDb.version(1).stores({
  plants: 'id, updatedAt, syncedAt',
  locations: 'id, updatedAt',
  species: 'id, updatedAt',
  tags: 'id, updatedAt',
  movement_types: 'id, updatedAt',
  container_types: 'id, updatedAt',
  operations: 'id, plantId, updatedAt',
  movements: 'id, operationId, updatedAt',
  pending_photos: '++id, operationId, createdAt',
  sync_queue: '++id, type, status, createdAt, updatedAt, attempts'
})

export const dbTables = {
  plants: indexedDb.table('plants'),
  locations: indexedDb.table('locations'),
  species: indexedDb.table('species'),
  tags: indexedDb.table('tags'),
  movementTypes: indexedDb.table('movement_types'),
  containerTypes: indexedDb.table('container_types'),
  operations: indexedDb.table('operations'),
  movements: indexedDb.table('movements'),
  pendingPhotos: indexedDb.table('pending_photos'),
  syncQueue: indexedDb.table('sync_queue')
}
