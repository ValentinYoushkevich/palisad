import db from '@/config/knex.js';

export function create(data) {
  return db('plant_stage_history')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function findByPlant(plantId) {
  return db('plant_stage_history')
    .where('plant_stage_history.plant_id', plantId)
    .leftJoin('production_stages', 'plant_stage_history.stage_id', 'production_stages.id')
    .leftJoin('users', 'plant_stage_history.changed_by', 'users.id')
    .select(
      'plant_stage_history.*',
      'production_stages.name as stage_name',
      'production_stages.slug as stage_slug',
      'users.name as changed_by_name'
    )
    .orderBy('plant_stage_history.created_at', 'desc');
}
