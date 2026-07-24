import db from '@/config/knex.js';

export function findByEmail(email) {
  return db('accounts').where({ email }).first();
}

export function findById(id) {
  return db('accounts').where({ id }).first();
}

export function create(data, executor = db) {
  return executor('accounts')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('accounts')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
