import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { ROLES } from '@/constants/roles.constants.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import * as stageHistoryRepo from '@/repositories/plantStageHistory.repository.js';
import { AppError } from '@/utils/AppError.js';
import { logActivity } from '@/utils/logActivity.js';
import { checkFeature, checkLimit } from '@/utils/planGuards.js';
import { generateQrCode } from '@/utils/qrCode.js';

export async function getPlants(nurseryId, filters) {
  const { page, perPage, ...rest } = filters;
  const offset = (page - 1) * perPage;
  const [data, total] = await Promise.all([
    plantRepo.findPage(nurseryId, rest, { limit: perPage, offset }),
    plantRepo.countFiltered(nurseryId, rest),
  ]);
  return { data, total, page, perPage };
}

export async function getPlantById(nurseryId, id) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, id);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }

  const [tags, stageHistory] = await Promise.all([
    plantRepo.getTagsByPlant(id),
    stageHistoryRepo.findByPlant(id),
  ]);
  return { ...plant, tags, stageHistory };
}

export async function findByQr(nurseryId, qrCode) {
  const plant = await plantRepo.findByQrCode(qrCode);
  if (!plant || plant.nursery_id !== nurseryId) {
    throw new AppError('Растение не найдено', 404);
  }

  return plant;
}

export async function findByNumericCode(nurseryId, numericCode) {
  const plant = await plantRepo.findByNumericCode(numericCode);
  if (!plant || plant.nursery_id !== nurseryId) {
    throw new AppError('Растение не найдено', 404);
  }

  return plant;
}

export async function createPlant(nurseryId, accountId, data, userId) {
  const count = await plantRepo.countByNursery(nurseryId);
  await checkLimit(accountId, 'plant_limit', count);

  const qrCode = generateQrCode();
  const numericCode = await generateUniqueNumericCode();
  const plant = await plantRepo.create({
    nursery_id: nurseryId,
    nursery_species_id: data.speciesId ?? null,
    location_id: data.locationId ?? null,
    container_id: data.containerId ?? null,
    stage_id: data.stageId ?? null,
    variety: data.variety ?? null,
    planted_at: data.plantedAt ?? null,
    source: data.source ?? null,
    notes: data.notes ?? null,
    qr_code: qrCode,
    numeric_code: numericCode,
  });
  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_TYPES.PLANT_CREATED,
    entityType: ENTITY_TYPES.PLANT,
    entityId: plant.id,
    details: { qr_code: plant.qr_code },
  });
  return plant;
}

export async function bulkCreate(nurseryId, accountId, template, count) {
  const current = await plantRepo.countByNursery(nurseryId);
  await checkLimit(accountId, 'plant_limit', current + count - 1);

  const records = [];
  for (let i = 0; i < count; i += 1) {
    records.push({
      nursery_id: nurseryId,
      nursery_species_id: template.speciesId ?? null,
      location_id: template.locationId ?? null,
      container_id: template.containerId ?? null,
      stage_id: template.stageId ?? null,
      variety: template.variety ?? null,
      planted_at: template.plantedAt ?? null,
      source: template.source ?? null,
      notes: template.notes ?? null,
      qr_code: generateQrCode(),
      numeric_code: await generateUniqueNumericCode(),
    });
  }

  return plantRepo.bulkCreate(records);
}

export async function updatePlant(nurseryId, id, data, userId) {
  await requirePlant(nurseryId, id);
  const plant = await plantRepo.updateById(id, {
    nursery_species_id: data.speciesId ?? null,
    location_id: data.locationId ?? null,
    container_id: data.containerId ?? null,
    stage_id: data.stageId ?? null,
    variety: data.variety ?? null,
    planted_at: data.plantedAt ?? null,
    source: data.source ?? null,
    notes: data.notes ?? null,
  });
  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_TYPES.PLANT_UPDATED,
    entityType: ENTITY_TYPES.PLANT,
    entityId: id,
    details: null,
  });
  return plant;
}

export async function softDelete(nurseryId, id, userId) {
  await requirePlant(nurseryId, id);
  const plant = await plantRepo.softDelete(id);
  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_TYPES.PLANT_DELETED,
    entityType: ENTITY_TYPES.PLANT,
    entityId: id,
    details: null,
  });
  return plant;
}

export async function restore(nurseryId, id, user) {
  if (user.role !== ROLES.OWNER) {
    throw new AppError('Только владелец может восстанавливать растения', 403);
  }

  const existingPlant = await plantRepo.findById(id);
  if (!existingPlant || existingPlant.nursery_id !== nurseryId) {
    throw new AppError('Растение не найдено', 404);
  }

  const plant = await plantRepo.restore(id);
  await logActivity({
    nurseryId,
    userId: user.userId,
    eventType: EVENT_TYPES.PLANT_RESTORED,
    entityType: ENTITY_TYPES.PLANT,
    entityId: id,
    details: null,
  });
  return plant;
}

export async function addTag(nurseryId, plantId, tagId, accountId) {
  await checkFeature(accountId, 'feature_tags');
  await requirePlant(nurseryId, plantId);
  return plantRepo.addTag(plantId, tagId);
}

export async function removeTag(nurseryId, plantId, tagId) {
  await requirePlant(nurseryId, plantId);
  return plantRepo.removeTag(plantId, tagId);
}

async function requirePlant(nurseryId, id) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, id);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }

  return plant;
}

async function generateUniqueNumericCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = String(Date.now() + Math.floor(Math.random() * 10000)).slice(-8);
    const existing = await plantRepo.findByNumericCode(code);
    if (!existing) {
      return code;
    }
  }

  throw new AppError('Не удалось сгенерировать уникальный numeric_code', 500);
}
