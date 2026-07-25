import db from '@/config/knex.js';

// Базовый набор фильтров списаний: движения, чей тип выставляет статус 'written_off',
// в периоде [dateFrom, dateTo] по растениям нужного питомника. У movements нет
// nursery_id → тенант-скоуп возможен только через join к plants и фильтр по
// plants.nursery_id. movement_types может быть системным (nursery_id NULL) — join по id.
function writeOffBase(nurseryId, dateFrom, dateTo, executor) {
  return executor('movements')
    .join('plants', 'movements.plant_id', 'plants.id')
    .join('movement_types', 'movements.type_id', 'movement_types.id')
    .where('plants.nursery_id', nurseryId)
    .where('movement_types.sets_status', 'written_off')
    .whereBetween('movements.created_at', [dateFrom, dateTo]);
}

// Метрика «списано» — SUM(quantity) (quantity по умолчанию 1, но может быть > 1).
// ::int, чтобы pg вернул число, а не строку (SUM даёт bigint); COALESCE — на пустую группу.
const COUNT_EXPR = 'COALESCE(SUM(movements.quantity), 0)::int';

// Измерения группировки: колонка-ключ, колонка-подпись, подпись для NULL и left-join
// соответствующего справочника. movementType уже соединён в базовом запросе.
const DIMENSIONS = {
  location: {
    key: 'plants.location_id',
    label: 'locations.name',
    nullLabel: 'Без локации',
    join: (query) => query.leftJoin('locations', 'plants.location_id', 'locations.id'),
  },
  species: {
    key: 'plants.nursery_species_id',
    label: 'nursery_species.display_name_ru',
    nullLabel: 'Без вида',
    join: (query) =>
      query.leftJoin('nursery_species', 'plants.nursery_species_id', 'nursery_species.id'),
  },
  stage: {
    key: 'plants.stage_id',
    label: 'production_stages.name',
    nullLabel: 'Без стадии',
    join: (query) =>
      query.leftJoin('production_stages', 'plants.stage_id', 'production_stages.id'),
  },
  movementType: {
    key: 'movements.type_id',
    label: 'movement_types.name',
    nullLabel: 'Без типа',
    join: (query) => query,
  },
};

function mapCountRows(rows) {
  return rows.map((row) => ({ key: row.key, label: row.label, count: Number(row.count) }));
}

// COUNT растений (а не SUM quantity) для остаточных метрик stock-flow. ::int — чтобы
// pg вернул число, а не bigint-строку.
const PLANT_COUNT_EXPR = 'COUNT(plants.id)::int';

// Предикат «живо на дату D»: создано ≤ D, не удалено на D и нет закрывающего движения
// (sets_status IN sold/written_off) с created_at ≤ D. Возвращает скоупленный по
// питомнику builder на plants — переиспользуется openingCount (Э1) и activeGrouped (Э2).
function activePlantsAt(nurseryId, at, executor) {
  return executor('plants')
    .where('plants.nursery_id', nurseryId)
    .where('plants.created_at', '<=', at)
    .where((builder) => {
      builder.whereNull('plants.deleted_at').orWhere('plants.deleted_at', '>', at);
    })
    .whereNotExists((builder) => {
      builder
        .select(executor.raw('1'))
        .from('movements')
        .join('movement_types', 'movements.type_id', 'movement_types.id')
        .whereRaw('movements.plant_id = plants.id')
        .whereIn('movement_types.sets_status', ['sold', 'written_off'])
        .where('movements.created_at', '<=', at);
    });
}

// Группировка по календарному месяцу (YYYY-MM): ключ и подпись совпадают.
function groupedByMonth(base, executor) {
  const monthExpr = "to_char(movements.created_at, 'YYYY-MM')";
  return base
    .select(executor.raw(`${monthExpr} as "key"`))
    .select(executor.raw(`${monthExpr} as "label"`))
    .select(executor.raw(`${COUNT_EXPR} as "count"`))
    .groupByRaw(monthExpr)
    .then(mapCountRows);
}

// Группировка по измерению (локация/вид/стадия/тип): NULL-ключ получает
// человекочитаемую подпись через COALESCE.
function groupedByDimension(base, executor, groupBy) {
  const dimension = DIMENSIONS[groupBy];
  return dimension
    .join(base)
    .select(executor.raw('?? as "key"', [dimension.key]))
    .select(executor.raw('COALESCE(??, ?) as "label"', [dimension.label, dimension.nullLabel]))
    .select(executor.raw(`${COUNT_EXPR} as "count"`))
    .groupBy(dimension.key, dimension.label)
    .then(mapCountRows);
}

// Сгруппированные количества списаний за период. Возвращает массив { key, label, count }.
export function writeOffGrouped({ nurseryId, dateFrom, dateTo, groupBy }, executor = db) {
  const base = writeOffBase(nurseryId, dateFrom, dateTo, executor);
  if (groupBy === 'month') {
    return groupedByMonth(base, executor);
  }

  return groupedByDimension(base, executor, groupBy);
}

// Всего списано за период (скаляр). Number.
export function totalWrittenOff({ nurseryId, dateFrom, dateTo }, executor = db) {
  return writeOffBase(nurseryId, dateFrom, dateTo, executor)
    .select(executor.raw(`${COUNT_EXPR} as "total"`))
    .first()
    .then((row) => Number(row.total));
}

// «Живой» остаток на начало периода: растения питомника, созданные до dateFrom,
// не удалённые на dateFrom и не проданные/списанные движением до dateFrom. Number.
export function openingCount({ nurseryId, dateFrom }, executor = db) {
  return activePlantsAt(nurseryId, dateFrom, executor)
    .count('plants.id as count')
    .first()
    .then((row) => Number(row.count));
}

// ─── Э2 «движение остатков» (stock-flow) ──────────────────────────────────────
// Для species/stage атрибут группировки — постоянная (species) или ТЕКУЩАЯ (stage)
// колонка растения, поэтому все метрики считаются агрегатами SQL по этой колонке и
// балансовая идентичность закрывается. Для location атрибут исторический (меняется
// перемещениями) — сырьё грузится ниже и сворачивается в JS (см. report.service).

// Живой остаток на дату, сгруппированный по измерению species/stage. [{key,label,count}].
export function activeGrouped({ nurseryId, at, groupBy }, executor = db) {
  const dimension = DIMENSIONS[groupBy];
  return dimension
    .join(activePlantsAt(nurseryId, at, executor))
    .select(executor.raw('?? as "key"', [dimension.key]))
    .select(executor.raw('COALESCE(??, ?) as "label"', [dimension.label, dimension.nullLabel]))
    .select(executor.raw(`${PLANT_COUNT_EXPR} as "count"`))
    .groupBy(dimension.key, dimension.label)
    .then(mapCountRows);
}

// Приход за период: растения питомника, созданные в (dateFrom, dateTo], сгруппированные
// по измерению species/stage. [{key,label,count}].
export function inflowGrouped({ nurseryId, dateFrom, dateTo, groupBy }, executor = db) {
  const dimension = DIMENSIONS[groupBy];
  const base = executor('plants')
    .where('plants.nursery_id', nurseryId)
    .where('plants.created_at', '>', dateFrom)
    .where('plants.created_at', '<=', dateTo);
  return dimension
    .join(base)
    .select(executor.raw('?? as "key"', [dimension.key]))
    .select(executor.raw('COALESCE(??, ?) as "label"', [dimension.label, dimension.nullLabel]))
    .select(executor.raw(`${PLANT_COUNT_EXPR} as "count"`))
    .groupBy(dimension.key, dimension.label)
    .then(mapCountRows);
}

// SUM(quantity) движений заданного sets_status в (dateFrom, dateTo], сгруппированный по
// измерению species/stage растения. Используется и для sold, и для writtenOff. [{key,label,count}].
export function movementGrouped({ nurseryId, dateFrom, dateTo, setsStatus, groupBy }, executor = db) {
  const dimension = DIMENSIONS[groupBy];
  const base = executor('movements')
    .join('plants', 'movements.plant_id', 'plants.id')
    .join('movement_types', 'movements.type_id', 'movement_types.id')
    .where('plants.nursery_id', nurseryId)
    .where('movement_types.sets_status', setsStatus)
    .where('movements.created_at', '>', dateFrom)
    .where('movements.created_at', '<=', dateTo);
  return dimension
    .join(base)
    .select(executor.raw('?? as "key"', [dimension.key]))
    .select(executor.raw('COALESCE(??, ?) as "label"', [dimension.label, dimension.nullLabel]))
    .select(executor.raw(`${COUNT_EXPR} as "count"`))
    .groupBy(dimension.key, dimension.label)
    .then(mapCountRows);
}

// ─── Сырьё для сборки stock-flow по локациям в JS ────────────────────────────
// Историческую локацию нельзя получить обычным GROUP BY: plants.location_id хранит
// ТЕКУЩЕЕ значение, которое переписывается перемещениями. Грузим кандидатов и движения
// один раз (скоуп по plants.nursery_id) и сворачиваем в сервисе.

// Растения питомника, созданные не позже dateTo (кандидаты периода).
export function plantsUpTo({ nurseryId, dateTo }, executor = db) {
  return executor('plants')
    .where('plants.nursery_id', nurseryId)
    .where('plants.created_at', '<=', dateTo)
    .select('plants.id', 'plants.location_id', 'plants.created_at', 'plants.deleted_at');
}

// Закрывающие движения (sold/written_off) питомника не позже dateTo — для расчёта
// «живости» на границах и атрибуции продаж/списаний по исторической локации.
export function closingMovementsUpTo({ nurseryId, dateTo }, executor = db) {
  return executor('movements')
    .join('plants', 'movements.plant_id', 'plants.id')
    .join('movement_types', 'movements.type_id', 'movement_types.id')
    .where('plants.nursery_id', nurseryId)
    .whereIn('movement_types.sets_status', ['sold', 'written_off'])
    .where('movements.created_at', '<=', dateTo)
    .select(
      'movements.plant_id',
      'movement_types.sets_status',
      'movements.quantity',
      'movements.created_at'
    );
}

// Движения-перемещения (тип с sets_status IS NULL) питомника не позже dateTo — для
// реконструкции исторической локации и transfersNet.
export function transfersUpTo({ nurseryId, dateTo }, executor = db) {
  return executor('movements')
    .join('plants', 'movements.plant_id', 'plants.id')
    .join('movement_types', 'movements.type_id', 'movement_types.id')
    .where('plants.nursery_id', nurseryId)
    .whereNull('movement_types.sets_status')
    .where('movements.created_at', '<=', dateTo)
    .select(
      'movements.plant_id',
      'movements.from_location_id',
      'movements.to_location_id',
      'movements.created_at'
    );
}

// Названия локаций питомника — для подписей строк отчёта по локациям.
export function locationsForNursery({ nurseryId }, executor = db) {
  return executor('locations').where('nursery_id', nurseryId).select('id', 'name');
}

// ─── Э3 «трудозатраты» (labor-cost, нормо-минуты) ────────────────────────────
// Норма зависит от стадии НА МОМЕНТ операции (историческая, не текущая). Обычным
// GROUP BY её не получить: plants.stage_id хранит текущее значение. Грузим операции
// периода, историю стадий и нормы один раз (скоуп по plants.nursery_id / nursery_id)
// и сворачиваем в JS (см. report.service). operations/plant_stage_history не имеют
// nursery_id → тенант-скоуп только через join к plants и фильтр plants.nursery_id.

// Не удалённые операции питомника в периоде [dateFrom, dateTo] (включительно).
// Тащим текущую стадию и вид растения — для фолбэка стадии и группировки по виду.
export function operationsInPeriod({ nurseryId, dateFrom, dateTo }, executor = db) {
  return executor('operations')
    .join('plants', 'operations.plant_id', 'plants.id')
    .where('plants.nursery_id', nurseryId)
    .whereNull('operations.deleted_at')
    .whereBetween('operations.created_at', [dateFrom, dateTo])
    .select(
      'operations.id',
      'operations.plant_id',
      'operations.type',
      'operations.created_at',
      'plants.nursery_species_id',
      'plants.stage_id as current_stage_id'
    );
}

// История стадий растений питомника не позже dateTo — сырьё для реконструкции
// стадии на момент операции (все нужные строки имеют created_at ≤ dateTo, т.к. сами
// операции ≤ dateTo).
export function stageHistoryUpTo({ nurseryId, dateTo }, executor = db) {
  return executor('plant_stage_history')
    .join('plants', 'plant_stage_history.plant_id', 'plants.id')
    .where('plants.nursery_id', nurseryId)
    .where('plant_stage_history.created_at', '<=', dateTo)
    .select(
      'plant_stage_history.plant_id',
      'plant_stage_history.stage_id',
      'plant_stage_history.created_at'
    );
}

// Нормы труда питомника: (стадия, тип операции) → нормо-минуты. Скоуп по nursery_id.
export function laborNormsForNursery({ nurseryId }, executor = db) {
  return executor('stage_labor_norms')
    .where('nursery_id', nurseryId)
    .select('stage_id', 'operation_type', 'norm_minutes');
}

// Подписи видов питомника — для группировки по виду. [{id, display_name_ru}].
export function nurserySpeciesLabels({ nurseryId }, executor = db) {
  return executor('nursery_species')
    .where('nursery_id', nurseryId)
    .select('id', 'display_name_ru');
}

// Подписи стадий, доступных растениям питомника: собственные стадии питомника плюс
// системные (nursery_id IS NULL). Разрешённая стадия может быть любой из них. [{id, name}].
export function productionStageLabels({ nurseryId }, executor = db) {
  return executor('production_stages')
    .where((builder) => {
      builder.where('nursery_id', nurseryId).orWhereNull('nursery_id');
    })
    .select('id', 'name');
}
