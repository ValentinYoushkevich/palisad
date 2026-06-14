import db from '@/config/knex.js';

// Системные стадии (nursery_id IS NULL) видны всем питомникам — как movement_types.
export function findAll(nurseryId) {
  return db('production_stages')
    .where(function scope() {
      this.where({ nursery_id: nurseryId }).orWhereNull('nursery_id');
    })
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'asc');
}

export function findById(nurseryId, id) {
  return db('production_stages')
    .where({ id })
    .where(function scope() {
      this.where({ nursery_id: nurseryId }).orWhereNull('nursery_id');
    })
    .first();
}

export function create(data) {
  return db('production_stages')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('production_stages')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
