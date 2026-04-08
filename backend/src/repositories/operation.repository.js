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

export function create(data) {
  return db('operations')
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
