import Dexie from 'dexie'

export const db = new Dexie('PalisadDB')

db.version(1).stores({
  plants: 'id, nursery_id, species_id, location_id, container_id, qr_code, numeric_code, status, deleted_at',
  locations: 'id, nursery_id, parent_id, type',
  species: 'id, nursery_id, gbif_id',
  tags: 'id, nursery_id, is_active',
  movement_types: 'id, nursery_id, is_system, is_active',
  container_types: 'id, nursery_id, is_system, is_active, container_kind',
  operations: 'id, plant_id, type, deleted_at',
  movements: 'id, plant_id, type_id',
  pending_photos: '++localId, operation_id, status',
  sync_queue: '++id, type, status, timestamp'
})

export const dbTables = {
  plants: db.table('plants'),
  locations: db.table('locations'),
  species: db.table('species'),
  tags: db.table('tags'),
  movementTypes: db.table('movement_types'),
  containerTypes: db.table('container_types'),
  operations: db.table('operations'),
  movements: db.table('movements'),
  pendingPhotos: db.table('pending_photos'),
  syncQueue: db.table('sync_queue')
}

export default db
