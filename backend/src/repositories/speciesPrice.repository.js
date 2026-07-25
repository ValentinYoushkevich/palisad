import db from '@/config/knex.js';

// Прайс-лист питомника с подписями вида и контейнера. Тенант-скоуп по
// species_prices.nursery_id. Порядок — по названию вида, затем по названию контейнера
// (детерминированно для UI и будущей CSV-выгрузки Э2/Э3).
export function findAllByNursery(nurseryId, executor = db) {
  return executor('species_prices')
    .join('nursery_species', 'species_prices.nursery_species_id', 'nursery_species.id')
    .join('container_types', 'species_prices.container_type_id', 'container_types.id')
    .where('species_prices.nursery_id', nurseryId)
    .select(
      'species_prices.id',
      'species_prices.nursery_species_id as nurserySpeciesId',
      'species_prices.container_type_id as containerTypeId',
      'species_prices.price',
      'nursery_species.display_name_ru as speciesName',
      'container_types.name as containerName',
      'container_types.code as containerCode'
    )
    .orderBy('nursery_species.display_name_ru', 'asc')
    .orderBy('container_types.name', 'asc');
}

// Upsert цены по уникальной тройке (nursery_id, nursery_species_id, container_type_id).
// При конфликте обновляет price и updated_at, не плодя дублей. Возвращает актуальную строку.
export function upsert({ nurseryId, nurserySpeciesId, containerTypeId, price }, executor = db) {
  return executor('species_prices')
    .insert({
      nursery_id: nurseryId,
      nursery_species_id: nurserySpeciesId,
      container_type_id: containerTypeId,
      price,
    })
    .onConflict(['nursery_id', 'nursery_species_id', 'container_type_id'])
    .merge({ price, updated_at: executor.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}

// Удаление цены, скоуплённое по питомнику. Возвращает число удалённых строк (0 — не найдено).
export function deleteByNurseryAndId(nurseryId, id, executor = db) {
  return executor('species_prices').where({ id, nursery_id: nurseryId }).del();
}
