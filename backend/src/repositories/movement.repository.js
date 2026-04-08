import db from '@/config/knex.js';

export function findByPlant(plantId) {
  return db('movements')
    .where({ plant_id: plantId })
    .leftJoin('locations as from_loc', 'movements.from_location_id', 'from_loc.id')
    .leftJoin('locations as to_loc', 'movements.to_location_id', 'to_loc.id')
    .leftJoin('users', 'movements.user_id', 'users.id')
    .leftJoin('movement_types', 'movements.type_id', 'movement_types.id')
    .select(
      'movements.*',
      'movement_types.name as movement_type_name',
      'movement_types.slug as movement_type_slug',
      'from_loc.name as from_location_name',
      'to_loc.name as to_location_name',
      'users.name as user_name'
    )
    .orderBy('movements.created_at', 'desc');
}

export function findByNurseryAndId(nurseryId, id) {
  return db('movements')
    .join('plants', 'movements.plant_id', 'plants.id')
    .where('movements.id', id)
    .where('plants.nursery_id', nurseryId)
    .select('movements.*')
    .first();
}

export function create(data) {
  return db('movements')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function deleteById(id) {
  return db('movements').where({ id }).delete();
}
