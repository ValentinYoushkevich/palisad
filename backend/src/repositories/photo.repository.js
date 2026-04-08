import db from '@/config/knex.js';

export function findByOperation(operationId) {
  return db('photos').where({ operation_id: operationId }).orderBy('created_at');
}

export function create(data) {
  return db('photos')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function findById(id) {
  return db('photos').where({ id }).first();
}

export function deleteById(id) {
  return db('photos').where({ id }).delete();
}
