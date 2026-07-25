import db from '@/config/knex.js';

// Репозиторий сессий инвентаризации (§ «Инвентаризация», Э1). Все функции принимают
// последним аргументом executor = db, чтобы композиться в транзакции (создание сессии
// и её строк — одной trx). Методы чтения возвращают camelCase (маппинг snake→camel),
// как export.repository.js; методы записи возвращают сырую вставленную строку.

// snake→camel для строки inventory_sessions (+ location_name из join). location_id
// NOT NULL и защищён составным FK → соответствующая локация всегда существует, поэтому
// location_name всегда присутствует (без защитного `?? null`).
function mapSession(row) {
  return {
    id: row.id,
    nurseryId: row.nursery_id,
    locationId: row.location_id,
    locationName: row.location_name,
    userId: row.user_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    clientRequestId: row.client_request_id,
    matchedCount: row.matched_count,
    missingCount: row.missing_count,
    foreignCount: row.foreign_count,
    unknownCount: row.unknown_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// snake→camel для строки inventory_items с подтянутыми подписями растения. Для строк
// без растения (unknown) left-join'ы дают SQL NULL → соответствующие поля равны null.
function mapItem(row) {
  return {
    itemId: row.item_id,
    category: row.category,
    plantId: row.plant_id,
    rawCode: row.raw_code,
    scannedAt: row.scanned_at,
    appliedMovementId: row.applied_movement_id,
    createdAt: row.created_at,
    qrCode: row.qr_code,
    numericCode: row.numeric_code,
    scientificName: row.scientific_name,
    speciesName: row.species_name,
    stageName: row.stage_name,
    currentLocationName: row.current_location_name,
  };
}

// Идемпотентность повторной доставки (F2): ищем ранее созданную сессию по паре
// (nursery_id, client_request_id), чтобы повтор запроса вернул ту же запись. Возвращает
// сырую строку (внутренний лукап replay), как movement.repository.findByClientRequestId.
export function findByClientRequestId(nurseryId, clientRequestId, executor = db) {
  return executor('inventory_sessions')
    .where({ nursery_id: nurseryId, client_request_id: clientRequestId })
    .first();
}

// Вставка сессии. data — snake_case колонки. Возвращает сырую вставленную строку.
export function createSession(data, executor = db) {
  return executor('inventory_sessions')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

// Батч-вставка строк сверки. Пустой массив — no-op (без запроса к БД). Возвращает
// вставленные строки.
export function createItems(rows, executor = db) {
  if (rows.length === 0) {
    return Promise.resolve([]);
  }
  return executor('inventory_items').insert(rows).returning('*');
}

// Сессия по id в пределах питомника, с именем корневой локации. undefined, если не
// найдена (в т.ч. чужой питомник — тенант-изоляция чтения).
export function findSessionById(nurseryId, id, executor = db) {
  return executor('inventory_sessions')
    .leftJoin('locations', 'inventory_sessions.location_id', 'locations.id')
    .where('inventory_sessions.nursery_id', nurseryId)
    .where('inventory_sessions.id', id)
    .select('inventory_sessions.*', 'locations.name as location_name')
    .first()
    .then((row) => (row ? mapSession(row) : undefined));
}

// Все строки сверки сессии с подписями растения: QR/числовой код, научное имя
// (species_catalog.scientific_name через nursery_species.species_catalog_id), локальное
// имя (nursery_species.display_name_ru), стадия (production_stages.name) и ТЕКУЩАЯ
// локация растения (locations.name). Для unknown-строк plant_id NULL → все подписи null.
export function findItemsBySession(sessionId, executor = db) {
  return executor('inventory_items')
    .leftJoin('plants', 'inventory_items.plant_id', 'plants.id')
    .leftJoin('nursery_species', 'plants.nursery_species_id', 'nursery_species.id')
    .leftJoin('species_catalog', 'nursery_species.species_catalog_id', 'species_catalog.id')
    .leftJoin('production_stages', 'plants.stage_id', 'production_stages.id')
    .leftJoin('locations', 'plants.location_id', 'locations.id')
    .where('inventory_items.session_id', sessionId)
    .select(
      'inventory_items.id as item_id',
      'inventory_items.category',
      'inventory_items.plant_id',
      'inventory_items.raw_code',
      'inventory_items.scanned_at',
      'inventory_items.applied_movement_id',
      'inventory_items.created_at',
      'plants.qr_code',
      'plants.numeric_code',
      'species_catalog.scientific_name as scientific_name',
      'nursery_species.display_name_ru as species_name',
      'production_stages.name as stage_name',
      'locations.name as current_location_name'
    )
    .orderBy('inventory_items.created_at', 'asc')
    .orderBy('inventory_items.id', 'asc')
    .then((rows) => rows.map(mapItem));
}

// Проставляет applied_movement_id строке сверки — аудит применения расхождения (Э3):
// связывает строку с созданным движением и служит идемпотентным маркером «уже применено».
// Executor=trx (пишется внутри транзакции применения). У inventory_items нет updated_at.
export function setItemAppliedMovement(itemId, movementId, executor = db) {
  return executor('inventory_items')
    .where({ id: itemId })
    .update({ applied_movement_id: movementId });
}

// Пагинированная история сессий питомника (свежие сверху). Стабильный ORDER BY
// (completed_at DESC + id) даёт устойчивые границы страниц.
export function listSessions(nurseryId, { limit, offset } = {}, executor = db) {
  const query = executor('inventory_sessions')
    .leftJoin('locations', 'inventory_sessions.location_id', 'locations.id')
    .where('inventory_sessions.nursery_id', nurseryId)
    .select('inventory_sessions.*', 'locations.name as location_name')
    .orderBy('inventory_sessions.completed_at', 'desc')
    .orderBy('inventory_sessions.id', 'asc');

  if (limit !== undefined && limit !== null) {
    query.limit(limit);
  }
  if (offset) {
    query.offset(offset);
  }

  return query.then((rows) => rows.map(mapSession));
}

// Всего сессий питомника — для пагинации (total рядом с listSessions).
export function countSessions(nurseryId, executor = db) {
  return executor('inventory_sessions')
    .where({ nursery_id: nurseryId })
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}

// Активные растения питомника для сверки (Э2): id + коды + текущая локация. Фильтр
// активности — deleted_at IS NULL AND status IN ('growing','storage'), как в
// export.repository.activePlants. Возвращает СЫРЫЕ snake_case поля: computeInventoryDiff
// разрешает сканы по qr_code/numeric_code и относит растение к зоне по location_id.
export function findActivePlantsForDiff(nurseryId, executor = db) {
  return executor('plants')
    .where('nursery_id', nurseryId)
    .whereNull('deleted_at')
    .whereIn('status', ['growing', 'storage'])
    .select('id', 'qr_code', 'numeric_code', 'location_id');
}
