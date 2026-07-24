import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as locationRepo from '@/repositories/location.repository.js';
import * as movementRepo from '@/repositories/movement.repository.js';
import * as movementTypeRepo from '@/repositories/movementType.repository.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import { AppError } from '@/utils/AppError.js';
import { logActivity } from '@/utils/logActivity.js';

const CLOSED_STATUSES = ['sold', 'written_off'];
const EVENT_BY_MOVEMENT_SLUG = {
  arrival: EVENT_TYPES.MOVEMENT_ARRIVAL,
  sale: EVENT_TYPES.MOVEMENT_SALE,
  write_off: EVENT_TYPES.MOVEMENT_WRITE_OFF,
  transfer: EVENT_TYPES.MOVEMENT_TRANSFER,
};

export async function getMovements(nurseryId, plantId) {
  await requirePlantInNursery(nurseryId, plantId);
  return movementRepo.findByPlant(plantId);
}

export async function createMovement(nurseryId, plantId, userId, data) {
  const plant = await requirePlantInNursery(nurseryId, plantId);
  if (CLOSED_STATUSES.includes(plant.status)) {
    throw new AppError('Нельзя добавлять движения к проданному или списанному растению', 400);
  }

  const movementType = await resolveMovementType(nurseryId, data.typeId);
  await requireMovementLocations(nurseryId, data);

  const duplicate = await findDuplicateMovement(plantId, data.clientRequestId);
  if (duplicate) {
    return duplicate;
  }

  // Вставка движения и вызванное им изменение статуса/локации растения — атомарны:
  // раньше при сбое applyMovementToPlant движение оставалось без отражения в растении
  // (или наоборот), см. B9.
  const movement = await db.transaction(async (trx) => {
    const created = await movementRepo.create(
      {
        plant_id: plantId,
        user_id: userId,
        type_id: data.typeId,
        from_location_id: data.fromLocationId ?? plant.location_id,
        to_location_id: data.toLocationId ?? null,
        quantity: data.quantity,
        notes: data.notes ?? null,
        client_request_id: data.clientRequestId ?? null,
      },
      trx
    );
    await applyMovementToPlant(plantId, movementType.sets_status, data.toLocationId, trx);
    return created;
  });
  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_BY_MOVEMENT_SLUG[movementType.slug] ?? EVENT_TYPES.MOVEMENT_TRANSFER,
    entityType: ENTITY_TYPES.MOVEMENT,
    entityId: movement.id,
    details: { plant_id: plantId, type: movementType.slug },
  });
  return movement;
}

export async function deleteMovement(nurseryId, id, userRole) {
  if (!STRUCTURE_ROLES.includes(userRole)) {
    throw new AppError('Недостаточно прав для удаления движения', 403);
  }

  const movement = await movementRepo.findByNurseryAndId(nurseryId, id);
  if (!movement) {
    throw new AppError('Движение не найдено', 404);
  }

  return movementRepo.deleteById(id);
}

// Гарантирует, что растение принадлежит питомнику из URL. Иначе движения читаются
// и создаются по чужому plantId — кросс-tenant IDOR с утечкой имён локаций/юзеров.
async function requirePlantInNursery(nurseryId, plantId) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, plantId);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }

  return plant;
}

// Локации движения (откуда/куда) должны принадлежать этому питомнику — иначе растение
// можно «переставить» в локацию чужого питомника.
async function requireMovementLocations(nurseryId, data) {
  if (data.fromLocationId) {
    const fromLocation = await locationRepo.findByNurseryAndId(nurseryId, data.fromLocationId);
    if (!fromLocation) {
      throw new AppError('Локация отправления не найдена', 404);
    }
  }
  if (data.toLocationId) {
    const toLocation = await locationRepo.findByNurseryAndId(nurseryId, data.toLocationId);
    if (!toLocation) {
      throw new AppError('Локация назначения не найдена', 404);
    }
  }
}

// findById учитывает системные типы (nursery_id IS NULL) + типы своего питомника, но НЕ
// чужого — иначе можно применить чужой sets_status.
async function resolveMovementType(nurseryId, typeId) {
  const movementType = await movementTypeRepo.findById(nurseryId, typeId);
  if (!movementType?.is_active) {
    throw new AppError('Тип движения не найден', 404);
  }

  return movementType;
}

// Идемпотентность повторной доставки офлайн-очереди (F2): при том же clientRequestId
// возвращаем уже созданное движение — не дублируем и не применяем изменения растения заново.
function findDuplicateMovement(plantId, clientRequestId) {
  if (!clientRequestId) {
    return null;
  }

  return movementRepo.findByClientRequestId(plantId, clientRequestId);
}

async function applyMovementToPlant(plantId, setsStatus, toLocationId, executor) {
  const updates = {};
  if (setsStatus) {
    updates.status = setsStatus;
  }
  if (toLocationId) {
    updates.location_id = toLocationId;
  }

  if (Object.keys(updates).length > 0) {
    await plantRepo.updateById(plantId, updates, executor);
  }
}
