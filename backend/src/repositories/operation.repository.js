import db from '@/config/knex.js';

export function findByPlant(plantId) {
  return db('operations')
    .where({ plant_id: plantId })
    .whereNull('deleted_at')
    .orderBy('created_at', 'desc');
}

export function findByPlantAndId(plantId, id) {
  return db('operations')
    .where({ plant_id: plantId, id })
    .whereNull('deleted_at')
    .first();
}

// Идемпотентность повторной доставки офлайн-очереди (F2): ищем ранее созданную
// операцию по client_request_id. Дедуп по всем строкам (без whereNull deleted_at) —
// повторный запрос не должен воскрешать/дублировать даже удалённую запись.
export function findByClientRequestId(plantId, clientRequestId, executor = db) {
  return executor('operations')
    .where({ plant_id: plantId, client_request_id: clientRequestId })
    .first();
}

export function create(data, executor = db) {
  return executor('operations')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('operations')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function softDelete(id) {
  return db('operations')
    .where({ id })
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
}
