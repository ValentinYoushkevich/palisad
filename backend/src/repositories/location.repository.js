import db from '@/config/knex.js';

export function findAllByNursery(nurseryId) {
  return db('locations')
    .where({ nursery_id: nurseryId })
    .orderBy('created_at', 'asc');
}

export function findByNurseryAndId(nurseryId, id) {
  return db('locations').where({ nursery_id: nurseryId, id }).first();
}

export function create(data) {
  return db('locations')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('locations')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function deleteById(id) {
  return db('locations').where({ id }).delete();
}

export function countChildren(id) {
  return db('locations')
    .where({ parent_id: id })
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}

export function countActivePlants(id) {
  return db('plants')
    .where({ location_id: id })
    .whereNull('deleted_at')
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}
