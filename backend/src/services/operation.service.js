import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { CLOSED_STATUSES } from '@/constants/operation.constants.js';
import * as containerTypeRepo from '@/repositories/containerType.repository.js';
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
  const operations = await operationRepo.findByPlant(plantId);
  // Каждая операция несёт метаданные своих фото (без байтов). Тянем одним запросом
  // по всем id операций и группируем, чтобы не плодить N+1.
  const photos = await photoRepo.findMetaByOperationIds(operations.map((op) => op.id));
  const byOperation = new Map();
  for (const photo of photos) {
    const list = byOperation.get(photo.operation_id) ?? [];
    list.push({
      id: photo.id,
      mime_type: photo.mime_type,
      size: photo.size,
      created_at: photo.created_at,
    });
    byOperation.set(photo.operation_id, list);
  }

  return operations.map((op) => ({ ...op, photos: byOperation.get(op.id) ?? [] }));
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

// Колонки operations, безопасно патчабельные через PATCH без побочных эффектов.
// type/newContainerId/newStageId сюда НЕ входят — они требуют side-effects и
// отклоняются отдельно (см. updateOperation).
const OPERATION_UPDATE_FIELDS = {
  notes: 'notes',
};

function buildOperationUpdate(data) {
  const update = {};
  for (const [key, column] of Object.entries(OPERATION_UPDATE_FIELDS)) {
    if (data[key] !== undefined) {
      update[column] = data[key];
    }
  }
  return update;
}

export async function updateOperation({ nurseryId, plantId, id, userId, data }) {
  await requirePlantInNursery(nurseryId, plantId);
  const operation = await requireOperation(plantId, id);
  if (operation.user_id !== userId) {
    throw new AppError('Можно редактировать только свои операции', 403);
  }

  // Смена type и пересадка/смена стадии требуют транзакционных побочных эффектов
  // (контейнер/стадия растения + история) — через PATCH не поддерживаем. Раньше
  // newContainerId/newStageId уходили прямо в UPDATE operations несуществующими
  // колонками → SQL 500, а смена type молча не выполняла side-effects (B16).
  if (
    data.type !== undefined ||
    data.newContainerId !== undefined ||
    data.newStageId !== undefined
  ) {
    throw new AppError(
      'Смена типа/пересадка/стадии через PATCH не поддерживается',
      400
    );
  }

  const update = buildOperationUpdate(data);
  if (Object.keys(update).length === 0) {
    return operation;
  }

  return operationRepo.updateById(id, update);
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

// Приём фото как файла: file = { buffer, mimetype, size } (multer memoryStorage).
// Валидация mime/размера выполняется на уровне multer (см. роут) — закрывает B18.
// Байты сохраняем в photos.image (bytea); наружу возвращаем только метаданные.
export async function attachPhoto({ nurseryId, plantId, operationId, accountId, file }) {
  await checkFeature(accountId, 'feature_photos');
  await requirePlantInNursery(nurseryId, plantId);
  const operation = await requireOperation(plantId, operationId);
  if (!file) {
    throw new AppError('Файл обязателен', 400);
  }

  const photo = await photoRepo.create({
    operation_id: operationId,
    image: file.buffer,
    mime_type: file.mimetype,
    size: file.size,
  });
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

// Отдаёт байты фото для стрим-эндпоинта. Те же tenant-гарды, что и у прочих
// вложенных ресурсов: фото чужой операции/питомника → 404 (через requireOperation
// и проверку operation_id).
export async function getPhotoContent({ nurseryId, plantId, operationId, photoId }) {
  await requirePlantInNursery(nurseryId, plantId);
  await requireOperation(plantId, operationId);
  const photo = await photoRepo.findByIdForStream(photoId);
  if (!photo || photo.operation_id !== operationId) {
    throw new AppError('Фото не найдено', 404);
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
// обязательные поля и принадлежность стадии/контейнера питомнику.
async function applyOperationSideEffects(trx, { nurseryId, plantId, userId, data }) {
  if (data.type === 'transplant') {
    if (!data.newContainerId) {
      throw new AppError('Для transplant требуется newContainerId', 400);
    }
    // B5: контейнер обязан принадлежать питомнику (репозиторий допускает системные
    // строки с nursery_id IS NULL) — как стадия в change_stage ниже. Без проверки
    // transplant привязывал растение к container_type чужого питомника, и его имя
    // утекало через JOIN в findPage.
    const container = await containerTypeRepo.findById(nurseryId, data.newContainerId);
    if (!container) {
      throw new AppError('Тип контейнера не найден', 404);
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
