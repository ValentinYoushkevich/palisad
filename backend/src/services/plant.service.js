import { ROLES } from '@/constants/roles.constants.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import { AppError } from '@/utils/AppError.js';
import { checkFeature, checkLimit } from '@/utils/planGuards.js';
import { generateQrCode } from '@/utils/qrCode.js';

export async function getPlants(nurseryId, filters) {
  const { page, perPage, ...rest } = filters;
  const all = await plantRepo.findAllByNursery(nurseryId, rest);
  const total = all.length;
  const start = (page - 1) * perPage;
  const data = all.slice(start, start + perPage);
  return { data, total, page, perPage };
}

export async function getPlantById(nurseryId, id) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, id);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }

  const tags = await plantRepo.getTagsByPlant(id);
  return { ...plant, tags };
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

export async function createPlant(nurseryId, accountId, data) {
  const count = await plantRepo.countByNursery(nurseryId);
  await checkLimit(accountId, 'plant_limit', count);

  const qrCode = generateQrCode();
  const numericCode = await generateUniqueNumericCode();
  return plantRepo.create({
    nursery_id: nurseryId,
    species_id: data.speciesId ?? null,
    location_id: data.locationId ?? null,
    container_id: data.containerId ?? null,
    variety: data.variety ?? null,
    planted_at: data.plantedAt ?? null,
    source: data.source ?? null,
    notes: data.notes ?? null,
    qr_code: qrCode,
    numeric_code: numericCode,
  });
}

export async function bulkCreate(nurseryId, accountId, template, count) {
  const current = await plantRepo.countByNursery(nurseryId);
  await checkLimit(accountId, 'plant_limit', current + count - 1);

  const records = [];
  for (let i = 0; i < count; i += 1) {
    records.push({
      nursery_id: nurseryId,
      species_id: template.speciesId ?? null,
      location_id: template.locationId ?? null,
      container_id: template.containerId ?? null,
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

export async function updatePlant(nurseryId, id, data) {
  await requirePlant(nurseryId, id);
  return plantRepo.updateById(id, {
    species_id: data.speciesId ?? null,
    location_id: data.locationId ?? null,
    container_id: data.containerId ?? null,
    variety: data.variety ?? null,
    planted_at: data.plantedAt ?? null,
    source: data.source ?? null,
    notes: data.notes ?? null,
  });
}

export async function softDelete(nurseryId, id) {
  await requirePlant(nurseryId, id);
  return plantRepo.softDelete(id);
}

export async function restore(nurseryId, id, user) {
  if (user.role !== ROLES.OWNER) {
    throw new AppError('Только владелец может восстанавливать растения', 403);
  }

  const plant = await plantRepo.findById(id);
  if (!plant || plant.nursery_id !== nurseryId) {
    throw new AppError('Растение не найдено', 404);
  }

  return plantRepo.restore(id);
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
