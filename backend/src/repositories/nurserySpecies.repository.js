import db from '@/config/knex.js';

function withCatalog(query) {
  return query
    .join('species_catalog', 'nursery_species.species_catalog_id', 'species_catalog.id')
    .select(
      'nursery_species.id',
      'nursery_species.nursery_id',
      'nursery_species.species_catalog_id',
      'nursery_species.display_name_ru',
      'nursery_species.is_active',
      'nursery_species.created_at',
      'nursery_species.updated_at',
      'species_catalog.gbif_usage_key',
      'species_catalog.scientific_name',
      'species_catalog.canonical_name',
      'species_catalog.family',
      'species_catalog.genus',
      'species_catalog.rank',
      'species_catalog.taxonomic_status'
    );
}

export function findAll(nurseryId) {
  return withCatalog(db('nursery_species').where({ 'nursery_species.nursery_id': nurseryId })).orderBy(
    'nursery_species.created_at',
    'asc'
  );
}

export function searchByQuery(nurseryId, q) {
  return withCatalog(
    db('nursery_species')
      .where({ 'nursery_species.nursery_id': nurseryId })
      .where(function search() {
        this.where('species_catalog.scientific_name', 'ilike', `%${q}%`)
          .orWhere('nursery_species.display_name_ru', 'ilike', `%${q}%`)
          .orWhere('species_catalog.family', 'ilike', `%${q}%`)
          .orWhere('species_catalog.genus', 'ilike', `%${q}%`);
      })
  ).orderBy('species_catalog.scientific_name', 'asc');
}

export function findById(nurseryId, id) {
  return withCatalog(
    db('nursery_species').where({
      'nursery_species.nursery_id': nurseryId,
      'nursery_species.id': id,
    })
  ).first();
}

export function findByCatalogId(nurseryId, speciesCatalogId) {
  return withCatalog(
    db('nursery_species').where({
      'nursery_species.nursery_id': nurseryId,
      'nursery_species.species_catalog_id': speciesCatalogId,
    })
  ).first();
}

export function create(data) {
  return db('nursery_species')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('nursery_species')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
