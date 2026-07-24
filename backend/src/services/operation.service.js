import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { CLOSED_STATUSES } from '@/constants/operation.constants.js';
import * as operationRepo from '@/repositories/operation.repository.js';
import * as photoRepo from '@/repositories/photo.repository.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import * as stageHistoryRepo from '@/repositories/plantStageHistory.repository.js';
import * as stageRepo from '@/repositories/productionStage.repository.js';
import { AppError } from '@/utils/AppError.js';
import { logActivity } from '@/utils/logActivity.js';
import { checkFeature } from '@/utils/planGuards.js';

export async function getOperations(nurseryId, plantId) {
  await requirePlantInNursery(nurseryId, plantId);
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
  const plant = await requireOpenPlant(nurseryId, plantId);

  const duplicate = await findDuplicateOperation(plant.id, data.clientRequestId);
  if (duplicate) {
    return duplicate;
  }

  // Побочные эффекты (смена контейнера/стадии + история) и вставка самой операции —
  // в одной транзакции: раньше при сбое между шагами растение оставалось изменённым
  // без операции-подтверждения (B9).
  const operation = await db.transaction(async (trx) => {
    await applyOperationSideEffects(trx, { nurseryId, plantId: plant.id, userId, data });
    return operationRepo.create(
      {
        plant_id: plantId,
        user_id: userId,
        type: data.type,
        notes: data.notes ?? null,
        client_request_id: data.clientRequestId ?? null,
      },
      trx
    );
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

export async function updateOperation({ nurseryId, plantId, id, userId, data }) {
  await requirePlantInNursery(nurseryId, plantId);
  const operation = await requireOperation(plantId, id);
  if (operation.user_id !== userId) {
    throw new AppError('Можно редактировать только свои операции', 403);
  }

  return operationRepo.updateById(id, data);
}

export async function softDelete({ nurseryId, plantId, id, userId, userRole }) {
  await requirePlantInNursery(nurseryId, plantId);
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

export async function attachPhoto({ nurseryId, plantId, operationId, accountId, url }) {
  await checkFeature(accountId, 'feature_photos');
  await requirePlantInNursery(nurseryId, plantId);
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

export async function deletePhoto(nurseryId, plantId, operationId, photoId) {
  await requirePlantInNursery(nurseryId, plantId);
  await requireOperation(plantId, operationId);
  const photo = await photoRepo.findById(photoId);
  if (!photo || photo.operation_id !== operationId) {
    throw new AppError('Фото не найдено', 404);
  }

  return photoRepo.deleteById(photoId);
}

// Применяет побочные эффекты операции внутри переданной транзакции: transplant меняет
// контейнер растения, change_stage — стадию и пишет запись в историю. Валидирует
// обязательные поля и принадлежность стадии питомнику.
async function applyOperationSideEffects(trx, { nurseryId, plantId, userId, data }) {
  if (data.type === 'transplant') {
    if (!data.newContainerId) {
      throw new AppError('Для transplant требуется newContainerId', 400);
    }
    await plantRepo.updateById(plantId, { container_id: data.newContainerId }, trx);
  }

  if (data.type === 'change_stage') {
    if (!data.newStageId) {
      throw new AppError('Для change_stage требуется newStageId', 400);
    }
    const stage = await stageRepo.findById(nurseryId, data.newStageId);
    if (!stage) {
      throw new AppError('Стадия не найдена', 404);
    }
    await plantRepo.updateById(plantId, { stage_id: data.newStageId }, trx);
    await stageHistoryRepo.create(
      {
        plant_id: plantId,
        stage_id: data.newStageId,
        changed_by: userId,
        notes: data.notes ?? null,
      },
      trx
    );
  }
}

// Растение принадлежит питомнику и открыто (не продано/списано) — предусловие операции.
async function requireOpenPlant(nurseryId, plantId) {
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

  return plant;
}

// Идемпотентность повторной доставки офлайн-очереди (F2): при том же clientRequestId
// возвращаем уже созданную операцию — не дублируем и не применяем побочные эффекты заново.
function findDuplicateOperation(plantId, clientRequestId) {
  if (!clientRequestId) {
    return null;
  }

  return operationRepo.findByClientRequestId(plantId, clientRequestId);
}

async function requireOperation(plantId, id) {
  const operation = await operationRepo.findByPlantAndId(plantId, id);
  if (!operation) {
    throw new AppError('Операция не найдена', 404);
  }

  return operation;
}

// Гарантирует, что растение принадлежит питомнику из URL. Без этой проверки
// вложенные ресурсы (операции, фото) доступны по чужому plantId — кросс-tenant IDOR.
async function requirePlantInNursery(nurseryId, plantId) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, plantId);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }

  return plant;
}
