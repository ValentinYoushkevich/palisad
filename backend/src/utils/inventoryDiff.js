/**
 * Чистая логика сверки инвентаризации (§ «Инвентаризация», Э1). Ни импортов из
 * репозиториев, ни обращений к БД — модуль юнит-тестируется и его алгоритм
 * зеркалится на фронтенде (офлайн-предпросмотр расхождений до отправки на сервер).
 * Всё сравнение делается над уже отфильтрованными АКТИВНЫМИ растениями (фильтрацию
 * `deleted_at IS NULL AND status IN ('growing','storage')` выполняет вызывающий).
 */

/**
 * Множество id локаций поддерева с корнем `rootId`, включая сам `rootId`.
 *
 * @param {string} rootId — id корневой локации зоны.
 * @param {Array<{ id: string, parent_id: string|null }>} locations — все локации питомника.
 * @returns {Set<string>} id всех локаций поддерева (включая корень).
 *
 * Нисходящий обход (BFS) по карте «родитель → дети», построенной из parent_id.
 * Защита от циклов: узел добавляется в результат один раз (Set посещённых). Если
 * `rootId` отсутствует среди локаций — возвращаем множество только из самого `rootId`.
 */
export function collectSubtreeLocationIds(rootId, locations) {
  const childrenByParent = new Map();
  let rootPresent = false;

  for (const location of locations) {
    if (location.id === rootId) {
      rootPresent = true;
    }
    const parent = location.parent_id;
    if (parent === null || parent === undefined) {
      continue;
    }
    const bucket = childrenByParent.get(parent);
    if (bucket) {
      bucket.push(location.id);
    } else {
      childrenByParent.set(parent, [location.id]);
    }
  }

  if (!rootPresent) {
    return new Set([rootId]);
  }

  const result = new Set([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = childrenByParent.get(current);
    if (!children) {
      continue;
    }
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    }
  }
  return result;
}

/**
 * Сверка отсканированных кодов с активными растениями питомника.
 *
 * @param {object} params
 * @param {Array<{ id: string, qr_code: string, numeric_code: string, location_id: string|null }>} params.nurseryPlants
 *   Активные растения ВСЕГО питомника (вызывающий уже отфильтровал по активности). Могут
 *   нести доп. поля (speciesName, stageName и т.п.) — весь объект растения прокидывается дальше.
 * @param {Set<string>} params.zoneLocationIds — id локаций зоны (из collectSubtreeLocationIds).
 * @param {Array<{ code: string, scannedAt: * }>} params.scans — сырые сканы (могут дублироваться).
 * @returns {{ matched: Array, missing: Array, foreign: Array, unknown: Array }}
 *   matched/foreign/unknown — в порядке сканов; missing — в порядке nurseryPlants.
 *   matched/foreign/unknown несут { plant?, rawCode, scannedAt }; missing несёт { plant }.
 */
export function computeInventoryDiff({ nurseryPlants, zoneLocationIds, scans }) {
  // 1. Дедуп сканов по обрезанному коду: первое вхождение выигрывает, пустые/пробельные
  //    коды игнорируются.
  const dedupedScans = [];
  const seenCodes = new Set();
  for (const scan of scans) {
    const code = typeof scan.code === 'string' ? scan.code.trim() : '';
    if (code === '' || seenCodes.has(code)) {
      continue;
    }
    seenCodes.add(code);
    dedupedScans.push({ code, scannedAt: scan.scannedAt });
  }

  // 2. Лукап-карты активных растений по QR и по числовому коду.
  const byQr = new Map();
  const byNumeric = new Map();
  for (const plant of nurseryPlants) {
    if (plant.qr_code !== null && plant.qr_code !== undefined) {
      byQr.set(plant.qr_code, plant);
    }
    if (plant.numeric_code !== null && plant.numeric_code !== undefined) {
      byNumeric.set(plant.numeric_code, plant);
    }
  }

  const matched = [];
  const foreign = [];
  const unknown = [];
  const matchedIds = new Set();

  // 3. Разрешаем каждый уникальный скан.
  for (const { code, scannedAt } of dedupedScans) {
    const plant = byQr.get(code) ?? byNumeric.get(code);
    if (!plant) {
      unknown.push({ rawCode: code, scannedAt });
      continue;
    }
    if (zoneLocationIds.has(plant.location_id)) {
      matched.push({ plant, rawCode: code, scannedAt });
      matchedIds.add(plant.id);
    } else {
      foreign.push({ plant, rawCode: code, scannedAt });
    }
  }

  // 4. missing — растения зоны, которые не были отсканированы.
  const missing = [];
  for (const plant of nurseryPlants) {
    if (zoneLocationIds.has(plant.location_id) && !matchedIds.has(plant.id)) {
      missing.push({ plant });
    }
  }

  return { matched, missing, foreign, unknown };
}
