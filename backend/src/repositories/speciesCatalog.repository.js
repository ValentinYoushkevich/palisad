import db from '@/config/knex.js';

export function findByUsageKey(gbifUsageKey) {
  return db('species_catalog').where({ gbif_usage_key: gbifUsageKey }).first();
}

export function findByScientificNameExact(scientificName) {
  return db('species_catalog')
    .whereRaw('LOWER(scientific_name) = LOWER(?)', [scientificName.trim()])
    .first();
}

export function searchByQuery(q, limit = 20) {
  return db('species_catalog')
    .where(function search() {
      this.where('scientific_name', 'ilike', `%${q}%`)
        .orWhere('canonical_name', 'ilike', `%${q}%`)
        .orWhere('family', 'ilike', `%${q}%`)
        .orWhere('genus', 'ilike', `%${q}%`);
    })
    .orderBy('scientific_name', 'asc')
    .limit(limit);
}

export function create(data) {
  return db('species_catalog')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('species_catalog')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
