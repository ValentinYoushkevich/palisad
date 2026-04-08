import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';
import * as containerTypeRepo from '@/repositories/containerType.repository.js';
import * as movementTypeRepo from '@/repositories/movementType.repository.js';
import * as speciesRepo from '@/repositories/species.repository.js';
import * as tagRepo from '@/repositories/tag.repository.js';
import { AppError } from '@/utils/AppError.js';
import { checkFeature } from '@/utils/planGuards.js';

export function getSpecies(nurseryId) {
  return speciesRepo.findAll(nurseryId);
}

export function searchSpecies(nurseryId, q) {
  return speciesRepo.searchByQuery(nurseryId, q);
}

export async function createSpecies(nurseryId, data) {
  const existing = await speciesRepo.findByGbifId(nurseryId, data.gbif_id);
  if (existing) {
    return { ...existing, alreadyExists: true };
  }

  const species = await speciesRepo.create({
    nursery_id: nurseryId,
    gbif_id: data.gbif_id,
    scientific_name: data.scientific_name,
    display_name_ru: data.display_name_ru,
    gbif_family: data.gbif_family ?? null,
    gbif_genus: data.gbif_genus ?? null,
    is_active: true,
  });
  return { ...species, alreadyExists: false };
}

export async function updateSpecies(nurseryId, id, data) {
  const current = await speciesRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Вид не найден', 404);
  }

  return speciesRepo.updateById(id, data);
}

export async function deleteSpecies(nurseryId, id) {
  const current = await speciesRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Вид не найден', 404);
  }

  return speciesRepo.updateById(id, { is_active: false });
}

export function getTags(nurseryId) {
  return tagRepo.findAll(nurseryId);
}

export async function createTag(nurseryId, accountId, data) {
  await checkFeature(accountId, 'feature_tags');
  return tagRepo.create({
    nursery_id: nurseryId,
    name: data.name,
    color: data.color,
    is_active: true,
  });
}

export async function updateTag(nurseryId, id, data) {
  const current = await tagRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Тег не найден', 404);
  }

  return tagRepo.updateById(id, data);
}

export async function deleteTag(nurseryId, id) {
  const current = await tagRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Тег не найден', 404);
  }

  return tagRepo.updateById(id, { is_active: false });
}

export function getMovementTypes(nurseryId) {
  return movementTypeRepo.findAll(nurseryId);
}

export function createMovementType(nurseryId, data) {
  return movementTypeRepo.create({
    nursery_id: nurseryId,
    name: data.name,
    slug: data.slug,
    sets_status: data.sets_status ?? null,
    is_system: false,
    is_active: true,
  });
}

export async function updateMovementType(nurseryId, id, data) {
  const current = await movementTypeRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Тип движения не найден', 404);
  }
  if (current.is_system) {
    throw new AppError('Системный тип движения нельзя изменять', 403);
  }

  return movementTypeRepo.updateById(id, data);
}

export async function deleteMovementType(nurseryId, id) {
  const current = await movementTypeRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Тип движения не найден', 404);
  }
  if (current.is_system) {
    throw new AppError('Системный тип движения нельзя удалять', 403);
  }

  return movementTypeRepo.updateById(id, { is_active: false });
}

export function getContainerTypes(nurseryId) {
  return containerTypeRepo.findAll(nurseryId);
}

export function createContainerType(nurseryId, data) {
  return containerTypeRepo.create({
    nursery_id: nurseryId,
    code: data.code,
    name: data.name,
    container_kind: data.container_kind,
    volume_liters: data.volume_liters ?? null,
    side_cm: data.side_cm ?? null,
    is_system: false,
    is_active: true,
  });
}

export async function updateContainerType(nurseryId, id, data) {
  const current = await containerTypeRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Тип контейнера не найден', 404);
  }
  if (current.is_system) {
    throw new AppError('Системный тип контейнера нельзя изменять', 403);
  }

  return containerTypeRepo.updateById(id, data);
}

export async function deleteContainerType(nurseryId, id) {
  const current = await containerTypeRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Тип контейнера не найден', 404);
  }
  if (current.is_system) {
    throw new AppError('Системный тип контейнера нельзя удалять', 403);
  }

  const used = await containerTypeRepo.countUsedByPlants(id);
  if (used > 0) {
    return containerTypeRepo.updateById(id, { is_active: false });
  }

  return containerTypeRepo.updateById(id, { is_active: false });
}

export function ensureStructureRole(userRole) {
  if (!STRUCTURE_ROLES.includes(userRole)) {
    throw new AppError('Недостаточно прав', 403);
  }
}
