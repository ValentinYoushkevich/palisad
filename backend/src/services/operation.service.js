import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { CLOSED_STATUSES } from '@/constants/operation.constants.js';
import * as operationRepo from '@/repositories/operation.repository.js';
import * as photoRepo from '@/repositories/photo.repository.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import { AppError } from '@/utils/AppError.js';
import { logActivity } from '@/utils/logActivity.js';
import { checkFeature } from '@/utils/planGuards.js';

export function getOperations(plantId) {
  return operationRepo.findByPlant(plantId);
}

export async function createOperation({
  nurseryId,
  plantId,
  userId,
  accountId,
  data,
}) {
  await checkFeature(accountId, 'feature_operations');

  const plant = await plantRepo.findByNurseryAndId(nurseryId, plantId);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }
  if (CLOSED_STATUSES.includes(plant.status)) {
    throw new AppError(
      'Нельзя добавлять операции к проданному или списанному растению',
      400
    );
  }

  if (data.type === 'transplant') {
    if (!data.newContainerId) {
      throw new AppError('Для transplant требуется newContainerId', 400);
    }
    await plantRepo.updateById(plant.id, { container_id: data.newContainerId });
  }

  const operation = await operationRepo.create({
    plant_id: plantId,
    user_id: userId,
    type: data.type,
    notes: data.notes ?? null,
  });
  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_TYPES.OPERATION_CREATED,
    entityType: ENTITY_TYPES.OPERATION,
    entityId: operation.id,
    details: { type: data.type },
  });
  return operation;
}

export async function updateOperation(plantId, id, userId, data) {
  const operation = await requireOperation(plantId, id);
  if (operation.user_id !== userId) {
    throw new AppError('Можно редактировать только свои операции', 403);
  }

  return operationRepo.updateById(id, data);
}

export async function softDelete(plantId, id, userId, userRole) {
  const operation = await requireOperation(plantId, id);
  const isOwner = userRole === 'owner';
  const isAuthor = operation.user_id === userId;
  if (!isOwner && !isAuthor) {
    throw new AppError('Нет прав на удаление этой операции', 403);
  }

  await operationRepo.softDelete(id);
  const plant = await plantRepo.findById(plantId);
  if (plant) {
    await logActivity({
      nurseryId: plant.nursery_id,
      userId,
      eventType: EVENT_TYPES.OPERATION_DELETED,
      entityType: ENTITY_TYPES.OPERATION,
      entityId: id,
      details: null,
    });
  }
  return true;
}

export async function attachPhoto(plantId, operationId, accountId, url) {
  await checkFeature(accountId, 'feature_photos');
  const operation = await requireOperation(plantId, operationId);
  const photo = await photoRepo.create({ operation_id: operationId, url });
  const plant = await plantRepo.findById(plantId);
  if (plant) {
    await logActivity({
      nurseryId: plant.nursery_id,
      userId: operation.user_id,
      eventType: EVENT_TYPES.PHOTO_ATTACHED,
      entityType: ENTITY_TYPES.OPERATION,
      entityId: operationId,
      details: { photoId: photo.id },
    });
  }
  return photo;
}

export async function deletePhoto(plantId, operationId, photoId) {
  await requireOperation(plantId, operationId);
  const photo = await photoRepo.findById(photoId);
  if (!photo || photo.operation_id !== operationId) {
    throw new AppError('Фото не найдено', 404);
  }

  return photoRepo.deleteById(photoId);
}

async function requireOperation(plantId, id) {
  const operation = await operationRepo.findByPlantAndId(plantId, id);
  if (!operation) {
    throw new AppError('Операция не найдена', 404);
  }

  return operation;
}
