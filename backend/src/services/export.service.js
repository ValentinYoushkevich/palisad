import * as exportRepo from '@/repositories/export.repository.js';
import { checkFeature } from '@/utils/planGuards.js';

// Сервис CSV-экспорта (§4 «Экспорт», Э2 «наличие»). ОБА формата (json/csv) гейтятся
// планом: checkFeature бросает AppError('Функция недоступна...', 403), если в тарифе нет
// feature_export. Строки — только данные (без итоговой строки): «Всего» дорисовывает
// контроллер при выдаче CSV, а json отдаёт total отдельным числом.

// Предохранитель обхода дерева локаций: глубже реальной иерархии (area→section→row→place)
// быть не может, поэтому кап заведомо велик и лишь защищает от зациклившихся parent_id.
const MAX_PATH_DEPTH = 100;

// Полный путь локации «Участок / Секция / Ряд» (root→leaf). Идём вверх по parent_id,
// собирая имена, затем разворачиваем. Чистая функция (юнит-тестируется напрямую):
// null-локация → «Без локации»; оборванный parent (нет узла) — останавливаемся на
// собранном; visited-множество страхует от циклов.
export function buildLocationPath(locationId, nodeById) {
  if (locationId === null || locationId === undefined) {
    return 'Без локации';
  }

  const names = [];
  const visited = new Set();
  let current = locationId;
  let depth = 0;
  while (current !== null && current !== undefined && depth < MAX_PATH_DEPTH) {
    if (visited.has(current)) {
      break;
    }
    visited.add(current);
    const node = nodeById.get(current);
    if (!node) {
      break;
    }
    names.push(node.name);
    current = node.parent_id ?? null;
    depth += 1;
  }

  names.reverse();
  return names.join(' / ');
}

// Порядок строк в режиме species: вид → контейнер (затем сорт/стадия — детерминизм).
function compareBySpecies(a, b) {
  return (
    a.speciesName.localeCompare(b.speciesName) ||
    a.containerName.localeCompare(b.containerName) ||
    a.variety.localeCompare(b.variety) ||
    a.stageName.localeCompare(b.stageName)
  );
}

// Порядок строк в режиме location: путь локации → вид → контейнер → ...
function compareByLocation(a, b) {
  return a.locationPath.localeCompare(b.locationPath) || compareBySpecies(a, b);
}

// Достраивает путь локации к каждой строке сводки и сортирует по (путь → вид → контейнер).
function withLocationPaths(aggregate, locations) {
  const nodeById = new Map(locations.map((location) => [location.id, location]));
  const rows = aggregate.map((row) => ({
    locationPath: buildLocationPath(row.locationId, nodeById),
    speciesName: row.speciesName,
    variety: row.variety,
    stageName: row.stageName,
    containerName: row.containerName,
    count: row.count,
  }));
  rows.sort(compareByLocation);
  return rows;
}

// Строки режима species: подписи уже пришли из SQL, остаётся отсортировать.
function bySpecies(aggregate) {
  const rows = aggregate.map((row) => ({
    speciesName: row.speciesName,
    variety: row.variety,
    stageName: row.stageName,
    containerName: row.containerName,
    count: row.count,
  }));
  rows.sort(compareBySpecies);
  return rows;
}

// Э2 «наличие»: сводка активных растений по виду или локации. Возвращает
// { groupBy, rows, total }, где rows — только данные (без «Всего»), total — сумма count.
export async function getStockExport(nurseryId, accountId, { groupBy }) {
  await checkFeature(accountId, 'feature_export');

  const aggregate = await exportRepo.stockAggregate({ nurseryId, groupBy });
  const rows =
    groupBy === 'location'
      ? withLocationPaths(aggregate, await exportRepo.locationsForNursery({ nurseryId }))
      : bySpecies(aggregate);

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return { groupBy, rows, total };
}

// Позиция считается с ценой, когда species_prices дал совпадение (цена 0 — валидна и
// сохраняется). Отсутствие цены — null из leftJoin.
function hasPrice(position) {
  return position.price !== null && position.price !== undefined;
}

// Порядок строк прайс-листа: научное имя → локальное имя → контейнер.
function comparePriceList(a, b) {
  return (
    a.scientificName.localeCompare(b.scientificName) ||
    a.speciesName.localeCompare(b.speciesName) ||
    a.containerName.localeCompare(b.containerName)
  );
}

// Э3 «прайс-лист»: готовый файл покупателю. Гейтится feature_export (ОБА формата). Позиции
// идут из активных растений (наличие всегда ≥ 1), цена подтянута leftJoin. По умолчанию
// (includeUnpriced=false) оставляем только позиции С ценой; includeUnpriced=true — режим
// владельца «найти пробелы в прайсе»: показываем всё, цена может быть пустой (null).
// Возвращает { meta, rows, total }: rows — только данные, total — сумма наличия.
export async function getPriceListExport(nurseryId, accountId, { includeUnpriced }) {
  await checkFeature(accountId, 'feature_export');

  const [positions, nurseryName] = await Promise.all([
    exportRepo.priceListAggregate({ nurseryId }),
    exportRepo.findNurseryName({ nurseryId }),
  ]);

  const rows = (includeUnpriced ? positions : positions.filter(hasPrice))
    .map((position) => ({
      scientificName: position.scientificName,
      speciesName: position.speciesName,
      containerName: position.containerName,
      count: position.count,
      price: hasPrice(position) ? position.price : null,
    }))
    .sort(comparePriceList);

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const meta = {
    nurseryName,
    exportedAt: new Date().toISOString().slice(0, 10),
    currency: 'BYN',
    includeUnpriced,
  };

  return { meta, rows, total };
}
