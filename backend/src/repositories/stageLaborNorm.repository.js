import db from '@/config/knex.js';

export function findAll(nurseryId, filters = {}) {
  const query = db('stage_labor_norms')
    .where('stage_labor_norms.nursery_id', nurseryId)
    .leftJoin('production_stages', 'stage_labor_norms.stage_id', 'production_stages.id')
    .select('stage_labor_norms.*', 'production_stages.name as stage_name')
    .orderBy('production_stages.sort_order', 'asc');

  if (filters.stageId) {
    query.where('stage_labor_norms.stage_id', filters.stageId);
  }

  return query;
}

export function findById(nurseryId, id) {
  return db('stage_labor_norms').where({ id, nursery_id: nurseryId }).first();
}

export function create(data) {
  return db('stage_labor_norms')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('stage_labor_norms')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function deleteById(nurseryId, id) {
  return db('stage_labor_norms').where({ id, nursery_id: nurseryId }).delete();
}
