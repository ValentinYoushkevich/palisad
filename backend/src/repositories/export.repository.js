import db from '@/config/knex.js';

// Репозиторий CSV-экспорта (§4 «Экспорт»). Э2 — сводка «что есть в наличии»: активные
// растения (deleted_at IS NULL AND status IN ('growing','storage')) СГРУППИРОВАНЫ и
// посчитаны COUNT(*) (у plants нет колонки количества — одна строка = одно растение).
// Э3 добавит сюда выгрузку прайс-листа поверх тех же соглашений.

// Активные растения питомника: не удалены и в «живом» статусе. sold/written_off
// исключаются. Тенант-скоуп по plants.nursery_id.
function activePlants(nurseryId, executor) {
  return executor('plants')
    .where('plants.nursery_id', nurseryId)
    .whereNull('plants.deleted_at')
    .whereIn('plants.status', ['growing', 'storage']);
}

// Сводка наличия: COUNT(*) активных растений по (вид, сорт, стадия, контейнер), в режиме
// location — дополнительно по локации. Группируем по СЫРЫМ id (+ сорт), а подписи тащим
// через leftJoin со COALESCE в '' — группировка по id не даёт NULL-строкам схлопнуться с
// реальными пустыми подписями. Историческая локация не нужна: наличие — срез на «сейчас»,
// поэтому берём текущий plants.location_id, а путь достраивается в сервисе по locationsForNursery.
// Возвращает [{ speciesName, variety, stageName, containerName, count, [locationId] }].
export function stockAggregate({ nurseryId, groupBy }, executor = db) {
  const query = activePlants(nurseryId, executor)
    .leftJoin('nursery_species', 'plants.nursery_species_id', 'nursery_species.id')
    .leftJoin('production_stages', 'plants.stage_id', 'production_stages.id')
    .leftJoin('container_types', 'plants.container_id', 'container_types.id')
    .select(
      executor.raw(`COALESCE(nursery_species.display_name_ru, '') as "speciesName"`),
      executor.raw(`COALESCE(plants.variety, '') as "variety"`),
      executor.raw(`COALESCE(production_stages.name, '') as "stageName"`),
      executor.raw(`COALESCE(container_types.name, '') as "containerName"`),
      executor.raw('COUNT(*)::int as "count"')
    )
    .groupBy(
      'plants.nursery_species_id',
      'nursery_species.display_name_ru',
      'plants.variety',
      'plants.stage_id',
      'production_stages.name',
      'plants.container_id',
      'container_types.name'
    );

  if (groupBy === 'location') {
    query.select('plants.location_id as locationId').groupBy('plants.location_id');
  }

  return query.then((rows) => rows.map((row) => ({ ...row, count: Number(row.count) })));
}

// Все локации питомника — сырьё для построения полного пути «Участок / Секция / Ряд» в
// сервисе. parent_id нужен для обхода вверх по дереву. [{ id, parent_id, name }].
export function locationsForNursery({ nurseryId }, executor = db) {
  return executor('locations')
    .where('nursery_id', nurseryId)
    .select('id', 'parent_id', 'name');
}

// Э3 «прайс-лист»: позиции для готового файла покупателю. Активные растения СГРУППИРОВАНЫ
// по (вид, контейнер) с COUNT(*) как наличием; позиции без вида исключаем (у строки прайса
// обязан быть вид). Цена подтягивается leftJoin со species_prices по паре
// (nursery_species_id, container_type_id) в рамках того же питомника — null, когда цены нет.
// Наличие > 0 гарантировано конструкцией (позиции идут ИЗ активных растений). Подписи тащим
// через leftJoin со COALESCE в '' (группировка по сырым id, как в stockAggregate). Возвращает
// [{ scientificName, speciesName, containerName, containerId, nurserySpeciesId, count, price }].
export function priceListAggregate({ nurseryId }, executor = db) {
  return activePlants(nurseryId, executor)
    .whereNotNull('plants.nursery_species_id')
    .leftJoin('nursery_species', 'plants.nursery_species_id', 'nursery_species.id')
    .leftJoin('species_catalog', 'nursery_species.species_catalog_id', 'species_catalog.id')
    .leftJoin('container_types', 'plants.container_id', 'container_types.id')
    .leftJoin('species_prices', function joinPrice() {
      this.on('species_prices.nursery_species_id', '=', 'plants.nursery_species_id')
        .andOn('species_prices.container_type_id', '=', 'plants.container_id')
        .andOn('species_prices.nursery_id', '=', 'plants.nursery_id');
    })
    .select(
      executor.raw(`COALESCE(species_catalog.scientific_name, '') as "scientificName"`),
      executor.raw(`COALESCE(nursery_species.display_name_ru, '') as "speciesName"`),
      executor.raw(`COALESCE(container_types.name, '') as "containerName"`),
      'plants.container_id as containerId',
      'plants.nursery_species_id as nurserySpeciesId',
      executor.raw('COUNT(*)::int as "count"'),
      'species_prices.price as price'
    )
    .groupBy(
      'plants.nursery_species_id',
      'nursery_species.display_name_ru',
      'species_catalog.scientific_name',
      'plants.container_id',
      'container_types.name',
      'species_prices.price'
    )
    .then((rows) => rows.map((row) => ({ ...row, count: Number(row.count) })));
}

// Имя питомника для блок-шапки прайс-листа. Тенант-скоуп по id. Возвращает строку имени
// (питомник заведомо существует — маршрут защищён requireNurseryAccess).
export function findNurseryName({ nurseryId }, executor = db) {
  return executor('nurseries')
    .where('id', nurseryId)
    .select('name')
    .first()
    .then((row) => row?.name ?? '');
}
