import db from '@/config/knex.js';

export function findAll(nurseryId) {
  return db('container_types')
    .where(function scope() {
      this.where({ nursery_id: nurseryId }).orWhereNull('nursery_id');
    })
    .orderBy('is_system', 'desc')
    .orderBy('created_at', 'asc');
}

export function findById(nurseryId, id) {
  return db('container_types')
    .where({ id })
    .where(function scope() {
      this.where({ nursery_id: nurseryId }).orWhereNull('nursery_id');
    })
    .first();
}

export function create(data) {
  return db('container_types')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('container_types')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function countUsedByPlants(id) {
  return db('plants')
    .where({ container_id: id })
    .whereNull('deleted_at')
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}

export function deleteById(id) {
  return db('container_types').where({ id }).del();
}
