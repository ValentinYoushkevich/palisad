import db from '@/config/knex.js';

function buildListQuery(nurseryId, filters = {}) {
  const query = db('plants')
    .where('plants.nursery_id', nurseryId)
    .whereNull('plants.deleted_at')
    .leftJoin('nursery_species', 'plants.nursery_species_id', 'nursery_species.id')
    .leftJoin('species_catalog', 'nursery_species.species_catalog_id', 'species_catalog.id')
    .leftJoin('locations', 'plants.location_id', 'locations.id')
    .leftJoin('container_types', 'plants.container_id', 'container_types.id');

  if (filters.status) {
    query.where('plants.status', filters.status);
  }
  if (filters.speciesId) {
    query.where('plants.nursery_species_id', filters.speciesId);
  }
  if (filters.locationId) {
    query.where('plants.location_id', filters.locationId);
  }
  if (filters.containerId) {
    query.where('plants.container_id', filters.containerId);
  }
  if (filters.numericCode) {
    query.where('plants.numeric_code', filters.numericCode);
  }

  if (filters.search) {
    query.where(function search() {
      this.where('species_catalog.scientific_name', 'ilike', `%${filters.search}%`)
        .orWhere('nursery_species.display_name_ru', 'ilike', `%${filters.search}%`)
        .orWhere('plants.variety', 'ilike', `%${filters.search}%`)
        .orWhere('plants.qr_code', 'ilike', `%${filters.search}%`);
    });
  }

  if (filters.tagId) {
    query
      .join('plant_tags', 'plants.id', 'plant_tags.plant_id')
      .where('plant_tags.tag_id', filters.tagId);
  }

  return query;
}

// Страница списка: пагинация и порядок — в SQL (LIMIT/OFFSET), а не выборкой всех
// строк в память. Стабильный ORDER BY (created_at + id) даёт устойчивые границы страниц.
export function findPage(nurseryId, filters = {}, { limit, offset } = {}) {
  const query = buildListQuery(nurseryId, filters)
    .select(
      'plants.*',
      'species_catalog.scientific_name',
      'nursery_species.display_name_ru',
      'locations.name as location_name',
      'container_types.code as container_code'
    )
    .orderBy('plants.created_at', 'desc')
    .orderBy('plants.id', 'asc');

  if (limit !== undefined && limit !== null) {
    query.limit(limit);
  }
  if (offset) {
    query.offset(offset);
  }

  return query;
}

// Счётчик с теми же фильтрами, что и findPage (корректный total при фильтрации).
export function countFiltered(nurseryId, filters = {}) {
  return buildListQuery(nurseryId, filters)
    .countDistinct('plants.id as count')
    .then((rows) => Number(rows[0].count));
}

export function countByNursery(nurseryId) {
  return db('plants')
    .where({ nursery_id: nurseryId })
    .whereNull('deleted_at')
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}

export function findById(id) {
  return db('plants').where({ id }).first();
}

export function findByNurseryAndId(nurseryId, id) {
  return db('plants').where({ nursery_id: nurseryId, id }).whereNull('deleted_at').first();
}

// Батч-выборка по списку id (один запрос вместо N — для генерации этикеток).
export function findByNurseryAndIds(nurseryId, ids) {
  return db('plants')
    .where('nursery_id', nurseryId)
    .whereIn('id', ids)
    .whereNull('deleted_at');
}

export function findByQrCode(qrCode) {
  return db('plants').where({ qr_code: qrCode }).whereNull('deleted_at').first();
}

export function findByNumericCode(numericCode) {
  return db('plants').where({ numeric_code: numericCode }).whereNull('deleted_at').first();
}

export function create(data) {
  return db('plants')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function bulkCreate(records) {
  return db('plants').insert(records).returning('*');
}

export function updateById(id, data) {
  return db('plants')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function softDelete(id) {
  return db('plants')
    .where({ id })
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function restore(id) {
  return db('plants')
    .where({ id })
    .update({ deleted_at: null, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

export function addTag(plantId, tagId) {
  return db('plant_tags')
    .insert({ plant_id: plantId, tag_id: tagId })
    .onConflict(['plant_id', 'tag_id'])
    .ignore();
}

export function removeTag(plantId, tagId) {
  return db('plant_tags').where({ plant_id: plantId, tag_id: tagId }).delete();
}

export function getTagsByPlant(plantId) {
  return db('plant_tags')
    .join('tags', 'plant_tags.tag_id', 'tags.id')
    .where('plant_tags.plant_id', plantId)
    .select('tags.*');
}
