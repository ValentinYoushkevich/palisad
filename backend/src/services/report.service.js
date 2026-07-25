import * as reportRepo from '@/repositories/report.repository.js';

// Округление долей/ставки до 4 знаков — компромисс между точностью и стабильностью
// сравнений в тестах/выгрузке.
function round4(value) {
  return Math.round(value * 10000) / 10000;
}

// Отчёт «списания» (Э1): сгруппированные количества + процент отхода к «живому»
// остатку на начало периода. Все запросы тенант-скоупятся внутри репозитория.
export async function getWriteOffs({ nurseryId, dateFrom, dateTo, groupBy }) {
  const [rows, totalWrittenOff, openingCount] = await Promise.all([
    reportRepo.writeOffGrouped({ nurseryId, dateFrom, dateTo, groupBy }),
    reportRepo.totalWrittenOff({ nurseryId, dateFrom, dateTo }),
    reportRepo.openingCount({ nurseryId, dateFrom }),
  ]);

  const rate = openingCount > 0 ? round4(totalWrittenOff / openingCount) : 0;
  const enriched = rows.map((row) => ({
    key: row.key,
    label: row.label,
    count: row.count,
    share: totalWrittenOff > 0 ? round4(row.count / totalWrittenOff) : 0,
  }));

  // Помесячно — хронологический порядок по ключу; иначе — по убыванию количества.
  if (groupBy === 'month') {
    enriched.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  } else {
    enriched.sort((a, b) => b.count - a.count);
  }

  return {
    period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    totalWrittenOff,
    openingCount,
    rate,
    rows: enriched,
  };
}

// Э2 «движение остатков» (stock-flow). Балансовая идентичность на КАЖДОЙ строке и в
// totals: closing = opening + inflow − sold − writtenOff + transfersNet. Держится
// by construction — closing считается независимо (живой остаток на dateTo), а не
// выводится из правой части, поэтому тест реально проверяет корректность.
const STOCK_FLOW_METRICS = ['opening', 'inflow', 'sold', 'writtenOff', 'transfersNet', 'closing'];

function emptyRow(key, label) {
  return { key, label, opening: 0, inflow: 0, sold: 0, writtenOff: 0, transfersNet: 0, closing: 0 };
}

// Порядок строк: по остатку на конец (desc), затем на начало (desc), затем по подписи.
function compareStockFlowRows(a, b) {
  return (
    b.closing - a.closing || b.opening - a.opening || String(a.label).localeCompare(String(b.label))
  );
}

// totals — поколоночная сумма строк (идентичность держится и для totals).
function sumTotals(rows) {
  const totals = { opening: 0, inflow: 0, sold: 0, writtenOff: 0, transfersNet: 0, closing: 0 };
  for (const row of rows) {
    for (const metric of STOCK_FLOW_METRICS) {
      totals[metric] += row[metric];
    }
  }
  return totals;
}

export async function getStockFlow({ nurseryId, dateFrom, dateTo, groupBy }) {
  const rows =
    groupBy === 'location'
      ? await buildLocationRows({ nurseryId, dateFrom, dateTo })
      : await buildDimensionRows({ nurseryId, dateFrom, dateTo, groupBy });

  rows.sort(compareStockFlowRows);

  return {
    period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    rows,
    totals: sumTotals(rows),
  };
}

// Ленивое ведро строки измерения (species/stage) по ключу-группе.
function dimensionBucket(groups, { key, label }) {
  const mapKey = key === null ? '__null__' : String(key);
  if (!groups.has(mapKey)) {
    groups.set(mapKey, emptyRow(key, label));
  }
  return groups.get(mapKey);
}

// species/stage: атрибут группировки — постоянная (species) или текущая (stage) колонка
// растения, поэтому все пять метрик считаются агрегатами SQL и сшиваются по ключу.
// transfersNet ≡ 0 (перемещения не меняют вид/текущую стадию → фантомных переходов нет).
async function buildDimensionRows({ nurseryId, dateFrom, dateTo, groupBy }) {
  const [opening, closing, inflow, sold, writtenOff] = await Promise.all([
    reportRepo.activeGrouped({ nurseryId, at: dateFrom, groupBy }),
    reportRepo.activeGrouped({ nurseryId, at: dateTo, groupBy }),
    reportRepo.inflowGrouped({ nurseryId, dateFrom, dateTo, groupBy }),
    reportRepo.movementGrouped({ nurseryId, dateFrom, dateTo, setsStatus: 'sold', groupBy }),
    reportRepo.movementGrouped({ nurseryId, dateFrom, dateTo, setsStatus: 'written_off', groupBy }),
  ]);

  const groups = new Map();
  const sources = { opening, closing, inflow, sold, writtenOff };
  for (const [metric, resultRows] of Object.entries(sources)) {
    for (const row of resultRows) {
      dimensionBucket(groups, row)[metric] = row.count;
    }
  }

  return [...groups.values()];
}

// Раскладывает движения по plant_id, каждый список — по возрастанию created_at.
function groupMovementsByPlant(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.plant_id)) {
      map.set(row.plant_id, []);
    }
    map.get(row.plant_id).push(row);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  return map;
}

// location_at(plant, D) = to_location_id последнего перемещения с created_at ≤ D; если
// таких нет, но перемещения позже есть — from_location_id самого раннего (стартовая
// локация); иначе — текущая plants.location_id.
function locationAt(plant, at, transfersByPlant) {
  const list = transfersByPlant.get(plant.id) ?? [];
  let result = plant.location_id ?? null;
  let matched = false;
  for (const transfer of list) {
    if (new Date(transfer.created_at) <= at) {
      result = transfer.to_location_id ?? null;
      matched = true;
    }
  }
  if (!matched && list.length > 0) {
    result = list[0].from_location_id ?? null;
  }
  return result;
}

// «Живо на дату D»: создано ≤ D, не удалено на D и нет закрывающего движения ≤ D.
function isActiveAt(plant, at, closingByPlant) {
  if (new Date(plant.created_at) > at) {
    return false;
  }
  if (plant.deleted_at && new Date(plant.deleted_at) <= at) {
    return false;
  }
  const closings = closingByPlant.get(plant.id) ?? [];
  return !closings.some((movement) => new Date(movement.created_at) <= at);
}

// Ленивое ведро строки локации; NULL-локация → строка «Без локации».
function locationBucket(groups, locationId, labelById) {
  const key = locationId ?? null;
  const mapKey = key === null ? '__null__' : String(key);
  if (!groups.has(mapKey)) {
    const label = key === null ? 'Без локации' : (labelById.get(key) ?? 'Без локации');
    groups.set(mapKey, emptyRow(key, label));
  }
  return groups.get(mapKey);
}

function inPeriod(value, dateFrom, dateTo) {
  const at = new Date(value);
  return at > dateFrom && at <= dateTo;
}

// opening/closing/inflow: каждое растение попадает в ведро своей исторической локации
// на соответствующей границе (dateFrom/dateTo/created_at).
function foldBoundaries(ctx) {
  const { plants, dateFrom, dateTo, transfersByPlant, closingByPlant, bucketFor } = ctx;
  for (const plant of plants) {
    if (isActiveAt(plant, dateFrom, closingByPlant)) {
      bucketFor(locationAt(plant, dateFrom, transfersByPlant)).opening += 1;
    }
    if (isActiveAt(plant, dateTo, closingByPlant)) {
      bucketFor(locationAt(plant, dateTo, transfersByPlant)).closing += 1;
    }
    if (inPeriod(plant.created_at, dateFrom, dateTo)) {
      bucketFor(locationAt(plant, new Date(plant.created_at), transfersByPlant)).inflow += 1;
    }
  }
}

// sold/writtenOff: SUM(quantity) в ведро локации растения на момент движения.
function foldClosingMovements(ctx) {
  const { closingMovements, dateFrom, dateTo, plantById, transfersByPlant, bucketFor } = ctx;
  for (const movement of closingMovements) {
    if (!inPeriod(movement.created_at, dateFrom, dateTo)) {
      continue;
    }
    const at = new Date(movement.created_at);
    const bucket = bucketFor(locationAt(plantById.get(movement.plant_id), at, transfersByPlant));
    if (movement.sets_status === 'sold') {
      bucket.sold += movement.quantity;
    } else {
      bucket.writtenOff += movement.quantity;
    }
  }
}

// transfersNet: +1 в локацию назначения, −1 из локации отправления (каждое в периоде).
function foldTransfers(ctx) {
  const { transfers, dateFrom, dateTo, bucketFor } = ctx;
  for (const transfer of transfers) {
    if (!inPeriod(transfer.created_at, dateFrom, dateTo)) {
      continue;
    }
    if (transfer.to_location_id !== null) {
      bucketFor(transfer.to_location_id).transfersNet += 1;
    }
    if (transfer.from_location_id !== null) {
      bucketFor(transfer.from_location_id).transfersNet -= 1;
    }
  }
}

// location: локация исторична (переписывается перемещениями), поэтому грузим кандидатов
// и движения один раз и сворачиваем в JS. Всё скоуплено по plants.nursery_id в репозитории.
async function buildLocationRows({ nurseryId, dateFrom, dateTo }) {
  const [plants, closingMovements, transfers, locations] = await Promise.all([
    reportRepo.plantsUpTo({ nurseryId, dateTo }),
    reportRepo.closingMovementsUpTo({ nurseryId, dateTo }),
    reportRepo.transfersUpTo({ nurseryId, dateTo }),
    reportRepo.locationsForNursery({ nurseryId }),
  ]);

  const labelById = new Map(locations.map((location) => [location.id, location.name]));
  const plantById = new Map(plants.map((plant) => [plant.id, plant]));
  const transfersByPlant = groupMovementsByPlant(transfers);
  const closingByPlant = groupMovementsByPlant(closingMovements);

  const groups = new Map();
  const bucketFor = (locationId) => locationBucket(groups, locationId, labelById);
  const ctx = {
    plants,
    closingMovements,
    transfers,
    dateFrom,
    dateTo,
    plantById,
    transfersByPlant,
    closingByPlant,
    bucketFor,
  };

  foldBoundaries(ctx);
  foldClosingMovements(ctx);
  foldTransfers(ctx);

  return [...groups.values()];
}

// ─── Э3 «трудозатраты» (labor-cost, нормо-минуты) ────────────────────────────
// Норма операции зависит от стадии НА МОМЕНТ операции (историческая, не текущая),
// поэтому агрегируем в JS: грузим операции периода, историю стадий и нормы, а стадию
// каждой операции реконструируем чистой функцией resolveStageAtOperation.

// Округление нормо-минут на растение до 2 знаков (компромисс точность/стабильность тестов).
function round2(value) {
  return Math.round(value * 100) / 100;
}

// Ключ индекса норм: (стадия, тип операции). Пробел-разделитель безопасен — stage_id
// это UUID (без пробелов), operation_type — короткий тип без пробелов, коллизий пар нет.
function normKey(stageId, operationType) {
  return `${stageId}${operationType}`;
}

// Историческая стадия растения на момент операции: stage_id последней записи истории с
// created_at ≤ времени операции; если таких нет — текущая стадия растения; если и её нет —
// null («без стадии»). historyRowsForPlant должен быть отсортирован по возрастанию
// created_at (см. groupMovementsByPlant). Чистая функция — покрыта прямым юнит-тестом.
export function resolveStageAtOperation(historyRowsForPlant, operationCreatedAt, currentStageId) {
  const at = new Date(operationCreatedAt);
  let resolved = null;
  let matched = false;
  for (const row of historyRowsForPlant) {
    if (new Date(row.created_at) <= at) {
      resolved = row.stage_id ?? null;
      matched = true;
    }
  }
  return matched ? resolved : (currentStageId ?? null);
}

// Индекс норм: `${stageId}${operationType}` → нормо-минуты (Number).
function buildNormIndex(norms) {
  const index = new Map();
  for (const norm of norms) {
    index.set(normKey(norm.stage_id, norm.operation_type), Number(norm.norm_minutes));
  }
  return index;
}

// Норма операции или null, если нормы нет (стадия отсутствует, либо нет строки под
// (стадия, тип)). Операции без нормы дают 0 минут, но считаются в operationsCount.
function lookupNorm(normByKey, resolvedStage, operationType) {
  if (resolvedStage === null) {
    return null;
  }
  const minutes = normByKey.get(normKey(resolvedStage, operationType));
  return minutes === undefined ? null : minutes;
}

// Ключ и подпись группы: stage — по ИСТОРИЧЕСКОЙ стадии на момент операции; species —
// по постоянному виду растения. NULL получает человекочитаемую подпись.
function resolveGroup(groupBy, op, resolvedStage, labels) {
  if (groupBy === 'stage') {
    const key = resolvedStage;
    const label = key === null ? 'Без стадии' : (labels.stageLabelById.get(key) ?? 'Без стадии');
    return { key, label };
  }
  const key = op.nursery_species_id ?? null;
  const label = key === null ? 'Без вида' : (labels.speciesLabelById.get(key) ?? 'Без вида');
  return { key, label };
}

// Ленивое ведро группы labor-cost по ключу (NULL-ключ → общее ведро).
function laborBucket(groups, key, label) {
  const mapKey = key === null ? '__null__' : String(key);
  if (!groups.has(mapKey)) {
    groups.set(mapKey, { key, label, minutes: 0, operations: 0, plants: new Set() });
  }
  return groups.get(mapKey);
}

// Свёртка операций: на каждую — историческая стадия, поиск нормы, аккумуляция в группу.
// totalMinutes растёт только на операциях с нормой; operationsWithoutNorm — на остальных;
// минуты ведра растут на norm (0 без нормы), operations — всегда (сумма = operationsCount).
function foldOperations(ctx) {
  const { operations, historyByPlant, normByKey, groupBy, labels } = ctx;
  const groups = new Map();
  let totalMinutes = 0;
  let operationsWithoutNorm = 0;

  for (const op of operations) {
    const resolvedStage = resolveStageAtOperation(
      historyByPlant.get(op.plant_id) ?? [],
      op.created_at,
      op.current_stage_id ?? null
    );
    const norm = lookupNorm(normByKey, resolvedStage, op.type);
    if (norm === null) {
      operationsWithoutNorm += 1;
    } else {
      totalMinutes += norm;
    }
    const { key, label } = resolveGroup(groupBy, op, resolvedStage, labels);
    const bucket = laborBucket(groups, key, label);
    bucket.minutes += norm ?? 0;
    bucket.operations += 1;
    bucket.plants.add(op.plant_id);
  }

  return { groups, totalMinutes, operationsWithoutNorm };
}

// Строки отчёта из вёдер: plants = COUNT(DISTINCT plant_id), minutesPerPlant = minutes/plants.
// Порядок — по минутам desc, затем по подписи (детерминированно).
function buildLaborRows(groups) {
  const rows = [...groups.values()].map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    minutes: bucket.minutes,
    operations: bucket.operations,
    plants: bucket.plants.size,
    minutesPerPlant: bucket.plants.size > 0 ? round2(bucket.minutes / bucket.plants.size) : 0,
  }));
  rows.sort((a, b) => b.minutes - a.minutes || String(a.label).localeCompare(String(b.label)));
  return rows;
}

// Э3 «трудозатраты»: сумма нормо-минут по группе (вид/историческая стадия), без денег.
// Всё скоуплено по plants.nursery_id / nursery_id в репозитории. groupMovementsByPlant
// переиспользуется для истории стадий (нужна та же группировка по plant_id + сортировка asc).
export async function getLaborCost({ nurseryId, dateFrom, dateTo, groupBy }) {
  const [operations, history, norms, species, stages] = await Promise.all([
    reportRepo.operationsInPeriod({ nurseryId, dateFrom, dateTo }),
    reportRepo.stageHistoryUpTo({ nurseryId, dateTo }),
    reportRepo.laborNormsForNursery({ nurseryId }),
    reportRepo.nurserySpeciesLabels({ nurseryId }),
    reportRepo.productionStageLabels({ nurseryId }),
  ]);

  const { groups, totalMinutes, operationsWithoutNorm } = foldOperations({
    operations,
    historyByPlant: groupMovementsByPlant(history),
    normByKey: buildNormIndex(norms),
    groupBy,
    labels: {
      speciesLabelById: new Map(species.map((s) => [s.id, s.display_name_ru])),
      stageLabelById: new Map(stages.map((s) => [s.id, s.name])),
    },
  });

  return {
    period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    totalMinutes,
    operationsCount: operations.length,
    operationsWithoutNorm,
    rows: buildLaborRows(groups),
  };
}
