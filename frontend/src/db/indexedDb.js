import Dexie from 'dexie'

export const db = new Dexie('PalisadDB')

db.version(1).stores({
  plants: 'id, nursery_id, nursery_species_id, location_id, container_id, qr_code, numeric_code, status, deleted_at',
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

// v2: справочник производственных стадий (этап 3 v2).
db.version(2).stores({
  production_stages: 'id, nursery_id, is_system, is_active'
})

// v3: локальные сессии инвентаризации (ФЭ5). Живут только до успешного синка — sync-менеджер
// удаляет запись после POST /inventory-sessions (или 409). Поля записи:
// {
//   localId (auto),           — первичный ключ (++)
//   nurseryId,                — питомник (фиксируется при старте, для маршрутизации синка)
//   locationId,               — корневая локация зоны инвентаризации
//   locationName?,            — имя зоны для офлайн-UI (сервер его не хранит)
//   startedAt,                — ISO datetime старта
//   completedAt?,             — ISO datetime завершения (появляется в completeSession)
//   clientRequestId?,         — uuid идемпотентности (появляется в completeSession)
//   status: 'scanning' | 'completed',
//   scans: [ { code, scannedAt } ]
// }
db.version(3).stores({
  inventory_sessions_local: '++localId, status, nurseryId'
})

export const dbTables = {
  plants: db.table('plants'),
  locations: db.table('locations'),
  species: db.table('species'),
  tags: db.table('tags'),
  movementTypes: db.table('movement_types'),
  containerTypes: db.table('container_types'),
  productionStages: db.table('production_stages'),
  operations: db.table('operations'),
  movements: db.table('movements'),
  pendingPhotos: db.table('pending_photos'),
  syncQueue: db.table('sync_queue'),
  inventorySessionsLocal: db.table('inventory_sessions_local')
}

export const DOMAIN_TABLES = [
  'plants',
  'locations',
  'species',
  'tags',
  'movement_types',
  'container_types',
  'production_stages',
  'operations',
  'movements',
  'pending_photos',
  'sync_queue',
  'inventory_sessions_local'
]

export async function clearDomainTables() {
  await Promise.all(DOMAIN_TABLES.map((name) => db.table(name).clear()))
}

export default db
