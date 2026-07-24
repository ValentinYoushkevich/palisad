import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { ROLES } from '@/constants/roles.constants.js';
import * as containerTypeRepo from '@/repositories/containerType.repository.js';
import * as locationRepo from '@/repositories/location.repository.js';
import * as nurserySpeciesRepo from '@/repositories/nurserySpecies.repository.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import * as stageHistoryRepo from '@/repositories/plantStageHistory.repository.js';
import * as stageRepo from '@/repositories/productionStage.repository.js';
import * as tagRepo from '@/repositories/tag.repository.js';
import { AppError } from '@/utils/AppError.js';
import { logActivity } from '@/utils/logActivity.js';
import { checkFeature, checkLimit, lockAccount } from '@/utils/planGuards.js';
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
  const plant = await plantRepo.findByQrCode(nurseryId, qrCode);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }

  return plant;
}

export async function findByNumericCode(nurseryId, numericCode) {
  const plant = await plantRepo.findByNumericCode(nurseryId, numericCode);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }

  return plant;
}

export async function createPlant(nurseryId, accountId, data, userId) {
  await resolveReferences(nurseryId, data);

  const qrCode = generateQrCode();
  const numericCode = await generateUniqueNumericCode(nurseryId);
  // Лимит проверяется под advisory-lock'ом внутри той же транзакции, что и вставка,
  // иначе параллельные создания пробивают plant_limit (TOCTOU, см. B10).
  const plant = await db.transaction(async (trx) => {
    await lockAccount(trx, accountId);
    const count = await plantRepo.countByNursery(nurseryId, trx);
    await checkLimit(accountId, 'plant_limit', count, trx);
    return plantRepo.create(
      {
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
      },
      trx
    );
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
  await resolveReferences(nurseryId, template);

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
      numeric_code: await generateUniqueNumericCode(nurseryId),
    });
  }

  // Как и в createPlant: лимит под advisory-lock'ом в транзакции, чтобы конкурентные
  // bulk-вставки суммарно не пробили plant_limit (B10).
  return db.transaction(async (trx) => {
    await lockAccount(trx, accountId);
    const current = await plantRepo.countByNursery(nurseryId, trx);
    await checkLimit(accountId, 'plant_limit', current + count - 1, trx);
    return plantRepo.bulkCreate(records, trx);
  });
}

// Соответствие полей запроса колонкам. PATCH должен менять только переданные поля,
// поэтому собираем объект update ровно из присутствующих ключей — иначе частичный
// PATCH (например только notes) затирал бы species/location/stage в NULL (B15).
const PLANT_UPDATE_FIELDS = {
  speciesId: 'nursery_species_id',
  locationId: 'location_id',
  containerId: 'container_id',
  stageId: 'stage_id',
  variety: 'variety',
  plantedAt: 'planted_at',
  source: 'source',
  notes: 'notes',
};

function buildPlantUpdate(data) {
  const update = {};
  for (const [key, column] of Object.entries(PLANT_UPDATE_FIELDS)) {
    if (data[key] !== undefined) {
      update[column] = data[key];
    }
  }
  return update;
}

export async function updatePlant(nurseryId, id, data, userId) {
  await requirePlant(nurseryId, id);
  await resolveReferences(nurseryId, data);
  const plant = await plantRepo.updateById(id, buildPlantUpdate(data));
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
  await requireTag(nurseryId, tagId);
  return plantRepo.addTag(plantId, tagId);
}

export async function removeTag(nurseryId, plantId, tagId) {
  await requirePlant(nurseryId, plantId);
  await requireTag(nurseryId, tagId);
  return plantRepo.removeTag(plantId, tagId);
}

async function requirePlant(nurseryId, id) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, id);
  if (!plant) {
    throw new AppError('Растение не найдено', 404);
  }

  return plant;
}

async function requireTag(nurseryId, tagId) {
  const tag = await tagRepo.findById(nurseryId, tagId);
  if (!tag) {
    throw new AppError('Тег не найден', 404);
  }

  return tag;
}

// Проверяет, что переданные ссылки принадлежат этому питомнику. Для контейнеров и
// стадий findById репозитория допускает системные строки (nursery_id IS NULL), для
// вида и локации — только строки своего питомника. Без этого можно привязать растение
// к сущностям чужого питомника, и их имена утекут в выдачу через JOIN в findPage.
async function resolveReferences(nurseryId, data) {
  if (data.speciesId) {
    const species = await nurserySpeciesRepo.findById(nurseryId, data.speciesId);
    if (!species) {
      throw new AppError('Вид не найден', 404);
    }
  }
  if (data.locationId) {
    const location = await locationRepo.findByNurseryAndId(nurseryId, data.locationId);
    if (!location) {
      throw new AppError('Локация не найдена', 404);
    }
  }
  if (data.containerId) {
    const container = await containerTypeRepo.findById(nurseryId, data.containerId);
    if (!container) {
      throw new AppError('Тип контейнера не найден', 404);
    }
  }
  if (data.stageId) {
    const stage = await stageRepo.findById(nurseryId, data.stageId);
    if (!stage) {
      throw new AppError('Стадия не найдена', 404);
    }
  }
}

// Проверка коллизии — в пределах питомника: коды уникальны per-nursery (D8), поэтому
// пространство генерации сузилось до одного питомника и коллизии практически исчезли.
async function generateUniqueNumericCode(nurseryId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = String(Date.now() + Math.floor(Math.random() * 10000)).slice(-8);
    const existing = await plantRepo.findByNumericCode(nurseryId, code);
    if (!existing) {
      return code;
    }
  }

  throw new AppError('Не удалось сгенерировать уникальный numeric_code', 500);
}
