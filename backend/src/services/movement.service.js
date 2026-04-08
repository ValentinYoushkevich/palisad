import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as movementRepo from '@/repositories/movement.repository.js';
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

export function getMovements(plantId) {
  return movementRepo.findByPlant(plantId);
}

export async function createMovement(nurseryId, plantId, userId, data) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, plantId);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }
  if (CLOSED_STATUSES.includes(plant.status)) {
    throw new AppError('Нельзя добавлять движения к проданному или списанному растению', 400);
  }

  const movementType = await db('movement_types')
    .where({ id: data.typeId, is_active: true })
    .first();
  if (!movementType) {
    throw new AppError('Тип движения не найден', 404);
  }

  const movement = await movementRepo.create({
    plant_id: plantId,
    user_id: userId,
    type_id: data.typeId,
    from_location_id: data.fromLocationId ?? plant.location_id,
    to_location_id: data.toLocationId ?? null,
    quantity: data.quantity,
    notes: data.notes ?? null,
  });

  await applyMovementToPlant(plantId, movementType.sets_status, data.toLocationId);
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

async function applyMovementToPlant(plantId, setsStatus, toLocationId) {
  const updates = {};
  if (setsStatus) {
    updates.status = setsStatus;
  }
  if (toLocationId) {
    updates.location_id = toLocationId;
  }

  if (Object.keys(updates).length > 0) {
    await plantRepo.updateById(plantId, updates);
  }
}
