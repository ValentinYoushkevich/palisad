import db from '@/config/knex.js';

export function findByAccountId(accountId) {
  return db('nurseries').where({ account_id: accountId }).first();
}

export function findById(id) {
  return db('nurseries').where({ id }).first();
}

export function create(data) {
  return db('nurseries')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('nurseries')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function countByAccountId(accountId) {
  return db('nurseries')
    .where({ account_id: accountId })
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}
