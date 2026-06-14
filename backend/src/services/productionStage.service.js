import * as laborNormRepo from '@/repositories/stageLaborNorm.repository.js';
import * as stageRepo from '@/repositories/productionStage.repository.js';
import { AppError } from '@/utils/AppError.js';

// --- Производственные стадии ---

export function getStages(nurseryId) {
  return stageRepo.findAll(nurseryId);
}

export function createStage(nurseryId, data) {
  return stageRepo.create({
    nursery_id: nurseryId,
    name: data.name,
    slug: data.slug,
    sort_order: data.sort_order ?? 0,
    is_system: false,
    is_active: true,
  });
}

export async function updateStage(nurseryId, id, data) {
  const current = await stageRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Стадия не найдена', 404);
  }
  if (current.is_system) {
    throw new AppError('Системную стадию нельзя изменять', 403);
  }

  return stageRepo.updateById(id, data);
}

export async function deleteStage(nurseryId, id) {
  const current = await stageRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Стадия не найдена', 404);
  }
  if (current.is_system) {
    throw new AppError('Системную стадию нельзя удалять', 403);
  }

  return stageRepo.updateById(id, { is_active: false });
}

// --- Нормы трудозатрат на стадию ---

export function getLaborNorms(nurseryId, filters = {}) {
  return laborNormRepo.findAll(nurseryId, filters);
}

export async function createLaborNorm(nurseryId, data) {
  const stage = await stageRepo.findById(nurseryId, data.stage_id);
  if (!stage) {
    throw new AppError('Стадия не найдена', 404);
  }

  return laborNormRepo.create({
    nursery_id: nurseryId,
    stage_id: data.stage_id,
    operation_type: data.operation_type,
    norm_minutes: data.norm_minutes,
  });
}

export async function updateLaborNorm(nurseryId, id, data) {
  const current = await laborNormRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Норма не найдена', 404);
  }

  return laborNormRepo.updateById(id, data);
}

export async function deleteLaborNorm(nurseryId, id) {
  const current = await laborNormRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Норма не найдена', 404);
  }

  return laborNormRepo.deleteById(nurseryId, id);
}
