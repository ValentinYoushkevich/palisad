import db from '@/config/knex.js';

export function findAll(nurseryId) {
  return db('tags').where({ nursery_id: nurseryId }).orderBy('created_at', 'asc');
}

export function findById(nurseryId, id) {
  return db('tags').where({ nursery_id: nurseryId, id }).first();
}

export function create(data) {
  return db('tags')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('tags')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
