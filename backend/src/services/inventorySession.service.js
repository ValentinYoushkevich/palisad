import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import * as inventoryRepo from '@/repositories/inventorySession.repository.js';
import * as locationRepo from '@/repositories/location.repository.js';
import * as movementRepo from '@/repositories/movement.repository.js';
import * as movementTypeRepo from '@/repositories/movementType.repository.js';
import * as nurseryRepo from '@/repositories/nursery.repository.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import * as userRepo from '@/repositories/user.repository.js';
import { CLOSED_STATUSES } from '@/services/movement.service.js';
import { AppError } from '@/utils/AppError.js';
import { generateInventoryActPdf } from '@/utils/generateInventoryActPdf.js';
import { collectSubtreeLocationIds, computeInventoryDiff } from '@/utils/inventoryDiff.js';
import { logActivity } from '@/utils/logActivity.js';
import { lockAccount } from '@/utils/planGuards.js';
import { parsePagination } from '@/utils/validators/pagination.validators.js';

// Сервис сессий инвентаризации (§ «Инвентаризация», Э2): создание сессии со сверкой,
// история и деталь. Чистая сверка живёт в utils/inventoryDiff.js; здесь — оркестрация
// (загрузка данных, транзакция, идемпотентность) и форматирование ответа под FIXED-контракт.
// Поздние стадии (/apply, /act) встают поверх тех же репозиториев и форматтера.

const UNIQUE_VIOLATION = '23505';

// Денормализованные счётчики сессии (общая форма для detail и summary).
function sessionCounts(session) {
  return {
    matched: session.matchedCount,
    missing: session.missingCount,
    foreign: session.foreignCount,
    unknown: session.unknownCount,
  };
}

// missing-строка ответа: растение зоны, которое не отсканировали (подписи из репозитория).
function mapMissingItem(item) {
  return {
    id: item.itemId,
    plantId: item.plantId,
    qrCode: item.qrCode,
    numericCode: item.numericCode,
    speciesName: item.speciesName,
    scientificName: item.scientificName,
    stageName: item.stageName,
    currentLocationName: item.currentLocationName,
    appliedMovementId: item.appliedMovementId,
  };
}

// foreign-строка: те же подписи растения + сам скан (raw_code/scanned_at).
function mapForeignItem(item) {
  return {
    ...mapMissingItem(item),
    rawCode: item.rawCode,
    scannedAt: item.scannedAt,
  };
}

// unknown-строка: растения нет — только отсканированный код и время.
function mapUnknownItem(item) {
  return { id: item.itemId, rawCode: item.rawCode, scannedAt: item.scannedAt };
}

// DETAIL-форма ответа: сессия + её строки, разложенные по категориям. matched НЕ отдаётся
// массивом (только counts.matched); missing/foreign/unknown — массивы. counts берутся из
// снимка-счётчиков сессии, а не из длины массивов (matched массива нет).
export function formatDetail(session, items) {
  return {
    id: session.id,
    locationId: session.locationId,
    locationName: session.locationName,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    counts: sessionCounts(session),
    items: {
      missing: items.filter((item) => item.category === 'missing').map(mapMissingItem),
      foreign: items.filter((item) => item.category === 'foreign').map(mapForeignItem),
      unknown: items.filter((item) => item.category === 'unknown').map(mapUnknownItem),
    },
  };
}

// Строка истории (list): шапка сессии со счётчиками, без построчных расхождений.
function formatSummary(session) {
  return {
    id: session.id,
    locationId: session.locationId,
    locationName: session.locationName,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    counts: sessionCounts(session),
  };
}

// Строки inventory_items из результата сверки (snake_case под вставку). matched/foreign
// несут plant_id + скан; unknown — код без растения; missing — растение без скана.
function buildItemRows(sessionId, diff) {
  const scanned = (category) => ({ plant, rawCode, scannedAt }) => ({
    session_id: sessionId,
    plant_id: plant.id,
    raw_code: rawCode,
    category,
    scanned_at: scannedAt,
  });
  return [
    ...diff.matched.map(scanned('matched')),
    ...diff.foreign.map(scanned('foreign')),
    ...diff.unknown.map(({ rawCode, scannedAt }) => ({
      session_id: sessionId,
      plant_id: null,
      raw_code: rawCode,
      category: 'unknown',
      scanned_at: scannedAt,
    })),
    ...diff.missing.map(({ plant }) => ({
      session_id: sessionId,
      plant_id: plant.id,
      raw_code: null,
      category: 'missing',
      scanned_at: null,
    })),
  ];
}

// Собирает DETAIL по id: сессия (nursery-скоуп) + её строки. Используется create/replay
// (сессия заведомо существует) — потому без 404-проверки, в отличие от getSession.
async function buildDetail(nurseryId, sessionId) {
  const [session, items] = await Promise.all([
    inventoryRepo.findSessionById(nurseryId, sessionId),
    inventoryRepo.findItemsBySession(sessionId),
  ]);
  return formatDetail(session, items);
}

// Атомарная вставка сессии и её строк (одна транзакция). Возвращает id новой сессии;
// репозитории композятся через executor=trx. Счётчики берём из длин массивов сверки.
function persistSession({ nurseryId, userId, body, diff }) {
  return db.transaction(async (trx) => {
    const session = await inventoryRepo.createSession(
      {
        nursery_id: nurseryId,
        location_id: body.locationId,
        user_id: userId,
        started_at: body.startedAt,
        completed_at: body.completedAt,
        client_request_id: body.clientRequestId,
        matched_count: diff.matched.length,
        missing_count: diff.missing.length,
        foreign_count: diff.foreign.length,
        unknown_count: diff.unknown.length,
      },
      trx
    );
    await inventoryRepo.createItems(buildItemRows(session.id, diff), trx);
    return session.id;
  });
}

// Создание сессии со сверкой. Возвращает { detail, created }: created=false для
// идемпотентного повтора (тот же clientRequestId) → контроллер отдаёт 200 вместо 201.
export async function createSession(nurseryId, userId, body) {
  const { locationId, clientRequestId, scans } = body;

  // Локация зоны обязана принадлежать питомнику — иначе составной FK (location_id,
  // nursery_id) бросил бы сырую ошибку БД; ловим раньше осмысленным 404.
  const location = await locationRepo.findByNurseryAndId(nurseryId, locationId);
  if (!location) {
    throw new AppError('Локация не найдена', 404);
  }

  // Идемпотентность повторной доставки (F2): та же пара (nursery, clientRequestId) →
  // возвращаем уже созданную сессию без нового INSERT и без дублей строк.
  const existing = await inventoryRepo.findByClientRequestId(nurseryId, clientRequestId);
  if (existing) {
    return { detail: await buildDetail(nurseryId, existing.id), created: false };
  }

  // Сверка: поддерево зоны × активные растения питомника × сканы.
  const [locations, nurseryPlants] = await Promise.all([
    locationRepo.findAllByNursery(nurseryId),
    inventoryRepo.findActivePlantsForDiff(nurseryId),
  ]);
  const zoneLocationIds = collectSubtreeLocationIds(locationId, locations);
  const diff = computeInventoryDiff({ nurseryPlants, zoneLocationIds, scans });

  try {
    const sessionId = await persistSession({ nurseryId, userId, body, diff });
    return { detail: await buildDetail(nurseryId, sessionId), created: true };
  } catch (err) {
    // Гонка идемпотентности: параллельный запрос с тем же clientRequestId успел вставить
    // сессию → 23505 на частичном уникальном uq_inventory_sessions_client_request. Достаём
    // созданную и отдаём её (200). Прочие ошибки — наружу. Строка гарантированно есть:
    // индекс скоуплен по (nursery_id, client_request_id), по которым мы и ищем.
    if (err?.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    const raced = await inventoryRepo.findByClientRequestId(nurseryId, clientRequestId);
    return { detail: await buildDetail(nurseryId, raced.id), created: false };
  }
}

// Деталь сессии по id (nursery-скоуп). 404, если не найдена или из другого питомника.
export async function getSession(nurseryId, id) {
  const session = await inventoryRepo.findSessionById(nurseryId, id);
  if (!session) {
    throw new AppError('Сессия инвентаризации не найдена', 404);
  }
  const items = await inventoryRepo.findItemsBySession(id);
  return formatDetail(session, items);
}

// PDF-акт инвентаризации (Э4): деталь сессии + подписи (название питомника, исполнитель) →
// поток PDF (сам рендер в utils/generateInventoryActPdf). 404 из getSession пробрасывается.
// user_id сессии → имя исполнителя (name, иначе email; null, если строки пользователя нет);
// nurseryId → название питомника в шапку. Акт отражает применение: генератор считает
// «применено» по appliedMovementId строк сверки.
export async function generateAct(nurseryId, id) {
  const detail = await getSession(nurseryId, id);
  const [session, nursery] = await Promise.all([
    inventoryRepo.findSessionById(nurseryId, id),
    nurseryRepo.findById(nurseryId),
  ]);
  const nurseryName = nursery?.name ?? null;
  let scannedByName = null;
  if (session?.userId) {
    const user = await userRepo.findById(session.userId);
    scannedByName = user ? user.name || user.email || null : null;
  }
  return generateInventoryActPdf({ detail, nurseryName, scannedByName });
}

// Уникализирует список id, сохраняя порядок первого появления. Вход валидатор не
// дедуплицирует — повтор одного plantId не должен создавать два движения.
function dedupe(ids) {
  return [...new Set(ids)];
}

// Проверяет пользовательский тип списания: доступен питомнику (own или system, паттерн
// B5 через findById), is_active и именно списание (sets_status='written_off'). Иначе
// им можно было бы «применить» произвольный sets_status или чужой тип.
async function resolveWriteOffType(nurseryId, movementTypeId) {
  const movementType = await movementTypeRepo.findById(nurseryId, movementTypeId);
  if (!movementType?.is_active || movementType.sets_status !== 'written_off') {
    throw new AppError('Некорректный тип списания', 400);
  }
  return movementType;
}

// Индексирует строки сессии по plant_id, отдельно missing и foreign — применение
// работает только со «своей» категорией (списываем missing, возвращаем foreign).
function indexItemsByCategory(items) {
  const missing = new Map();
  const foreign = new Map();
  for (const item of items) {
    if (item.plantId === null) {
      continue; // unknown-строки без растения применению не подлежат
    }
    if (item.category === 'missing') {
      missing.set(item.plantId, item);
    } else if (item.category === 'foreign') {
      foreign.set(item.plantId, item);
    }
  }
  return { missing, foreign };
}

// Общая часть write-off/transfer: строка нужной категории есть и ещё не применена;
// растение живо и не закрыто. Возвращает { plant } к применению либо { reason } для skip.
async function loadApplicable(nurseryId, plantId, item, trx) {
  if (!item) {
    return { reason: 'not_in_session' };
  }
  if (item.appliedMovementId) {
    return { reason: 'already_applied' };
  }
  const plant = await plantRepo.findByNurseryAndIdForUpdate(nurseryId, plantId, trx);
  if (!plant || plant.deleted_at) {
    return { reason: 'plant_deleted' };
  }
  if (CLOSED_STATUSES.includes(plant.status)) {
    return { reason: 'status_changed' };
  }
  return { plant };
}

// Создаёт движение инвентаризации и отражает его в растении и строке сверки (аудит).
// type_id/notes/toLocationId/plantUpdate различаются между списанием и перемещением;
// общая механика (create → updateById → setItemAppliedMovement) — здесь. Возвращает id
// созданного движения. Всё внутри trx.
async function applyMovement(params, trx) {
  const { userId, plantId, plant, item, typeId, toLocationId, notes, plantUpdate } = params;
  const movement = await movementRepo.create(
    {
      plant_id: plantId,
      user_id: userId,
      type_id: typeId,
      from_location_id: plant.location_id,
      to_location_id: toLocationId,
      quantity: 1,
      notes,
      client_request_id: null,
    },
    trx
  );
  await plantRepo.updateById(plantId, plantUpdate, trx);
  await inventoryRepo.setItemAppliedMovement(item.itemId, movement.id, trx);
  return movement.id;
}

// Применение расхождений сессии (Э3) — одна транзакция, race-safe. writeOff списывает
// «пропавшие» (missing) выбранным типом списания; transfer возвращает «чужие» (foreign)
// в зону сессии системным типом «перемещение». Идемпотентно: повтор с теми же id видит
// applied_movement_id уже проставленным → all already_applied, нуль новых движений.
// Гонка параллельных применений ОДНОЙ сессии сериализуется advisory-lock'ом по ключу
// сессии (планГарды.lockAccount хэширует любую строку), а на уровне растения — SELECT
// FOR UPDATE + повторная проверка appliedMovementId после захвата замка.
export async function applySession(nurseryId, userId, sessionId, body) {
  // 404, если сессии нет или она из другого питомника; нужен locationId — цель перемещения.
  const session = await getSession(nurseryId, sessionId);
  const toLocationId = session.locationId;

  const writeOff = body.writeOff ?? {};
  const transfer = body.transfer ?? {};
  const writeOffPlantIds = dedupe(writeOff.plantIds ?? []);
  const transferPlantIds = dedupe(transfer.plantIds ?? []);

  // Резолвим типы движений ДО транзакции (валидные ошибки 400/500 без открытого замка).
  const writeOffType =
    writeOffPlantIds.length > 0
      ? await resolveWriteOffType(nurseryId, writeOff.movementTypeId)
      : null;
  let transferType = null;
  if (transferPlantIds.length > 0) {
    transferType = await movementTypeRepo.findSystemBySlug('transfer');
    if (!transferType?.is_active) {
      throw new AppError('Системный тип перемещения недоступен', 500);
    }
  }

  const result = await db.transaction(async (trx) => {
    // Сериализуем конкурентные применения ЭТОЙ сессии; префикс ключа исключает
    // коллизию с настоящими account-локами (общий хэш-неймспейс advisory-lock'ов).
    await lockAccount(trx, `inv-apply:${sessionId}`);

    // Перечитываем строки ВНУТРИ trx после захвата замка — видим applied_movement_id,
    // проставленный ранее закоммиченным применением (READ COMMITTED).
    const items = await inventoryRepo.findItemsBySession(sessionId, trx);
    const { missing, foreign } = indexItemsByCategory(items);

    const skipped = [];
    const applied = [];

    for (const plantId of writeOffPlantIds) {
      const item = missing.get(plantId);
      const outcome = await loadApplicable(nurseryId, plantId, item, trx);
      if (outcome.reason) {
        skipped.push({ plantId, reason: outcome.reason });
        continue;
      }
      const movementId = await applyMovement(
        {
          userId,
          plantId,
          plant: outcome.plant,
          item,
          typeId: writeOffType.id,
          toLocationId: null,
          notes: 'Инвентаризация: списание',
          plantUpdate: { status: writeOffType.sets_status },
        },
        trx
      );
      applied.push({ eventType: EVENT_TYPES.MOVEMENT_WRITE_OFF, movementId, plantId });
    }

    for (const plantId of transferPlantIds) {
      const item = foreign.get(plantId);
      const outcome = await loadApplicable(nurseryId, plantId, item, trx);
      if (outcome.reason) {
        skipped.push({ plantId, reason: outcome.reason });
        continue;
      }
      if (outcome.plant.location_id === toLocationId) {
        skipped.push({ plantId, reason: 'already_here' });
        continue;
      }
      const movementId = await applyMovement(
        {
          userId,
          plantId,
          plant: outcome.plant,
          item,
          typeId: transferType.id,
          toLocationId,
          notes: 'Инвентаризация: перемещение',
          plantUpdate: { location_id: toLocationId },
        },
        trx
      );
      applied.push({ eventType: EVENT_TYPES.MOVEMENT_TRANSFER, movementId, plantId });
    }

    const writtenOff = applied.filter((a) => a.eventType === EVENT_TYPES.MOVEMENT_WRITE_OFF).length;
    return { writtenOff, transferred: applied.length - writtenOff, skipped, applied };
  });

  // Аудит — после коммита (как movement.service): по событию на каждое созданное
  // движение. logActivity глотает ошибки, поэтому не ломает ответ применения.
  for (const entry of result.applied) {
    await logActivity({
      nurseryId,
      userId,
      eventType: entry.eventType,
      entityType: ENTITY_TYPES.MOVEMENT,
      entityId: entry.movementId,
      details: { plant_id: entry.plantId, source: 'inventory', session_id: sessionId },
    });
  }

  return {
    applied: { writtenOff: result.writtenOff, transferred: result.transferred },
    skipped: result.skipped,
  };
}

// Пагинированная история сессий питомника (свежие сверху). Пагинация зажата
// parsePagination (perPage 1..100). Возвращает { rows, page, perPage, total }.
export async function listSessions(nurseryId, query) {
  const { page, perPage } = parsePagination(query);
  const offset = (page - 1) * perPage;
  const [sessions, total] = await Promise.all([
    inventoryRepo.listSessions(nurseryId, { limit: perPage, offset }),
    inventoryRepo.countSessions(nurseryId),
  ]);
  return { rows: sessions.map(formatSummary), page, perPage, total };
}
