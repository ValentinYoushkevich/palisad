import db from '@/config/knex.js';

export function findAll(nurseryId) {
  return db('species').where({ nursery_id: nurseryId }).orderBy('created_at', 'asc');
}

export function searchByQuery(nurseryId, q) {
  return db('species')
    .where({ nursery_id: nurseryId })
    .where(function search() {
      this.where('scientific_name', 'ilike', `%${q}%`)
        .orWhere('display_name_ru', 'ilike', `%${q}%`)
        .orWhere('gbif_family', 'ilike', `%${q}%`)
        .orWhere('gbif_genus', 'ilike', `%${q}%`);
    })
    .orderBy('scientific_name', 'asc');
}

export function findById(nurseryId, id) {
  return db('species').where({ nursery_id: nurseryId, id }).first();
}

export function findByGbifId(nurseryId, gbifId) {
  return db('species').where({ nursery_id: nurseryId, gbif_id: gbifId }).first();
}

export function create(data) {
  return db('species')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('species')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function countUsedByPlants(id) {
  return db('plants')
    .where({ species_id: id })
    .whereNull('deleted_at')
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}
