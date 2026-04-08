import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import * as locationRepo from '@/repositories/location.repository.js';
import { AppError } from '@/utils/AppError.js';
import { logActivity } from '@/utils/logActivity.js';

const TYPE_LEVEL = {
  area: 0,
  section: 1,
  row: 2,
  place: 3,
};

export function getLocations(nurseryId) {
  return locationRepo.findAllByNursery(nurseryId);
}

export async function getLocationsTree(nurseryId) {
  const locations = await locationRepo.findAllByNursery(nurseryId);
  return buildTree(locations);
}

export async function createLocation(nurseryId, data, userId) {
  await ensureParentValid(nurseryId, data.parentId, data.type);
  const location = await locationRepo.create({
    nursery_id: nurseryId,
    name: data.name,
    type: data.type,
    parent_id: data.parentId ?? null,
  });
  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_TYPES.LOCATION_CREATED,
    entityType: ENTITY_TYPES.LOCATION,
    entityId: location.id,
    details: { type: location.type },
  });
  return location;
}

export async function updateLocation(nurseryId, id, data, userId) {
  const current = await requireLocation(nurseryId, id);
  const nextType = data.type ?? current.type;
  const nextParentId =
    Object.hasOwn(data, 'parentId') ?
      data.parentId :
      current.parent_id;

  await ensureParentValid(nurseryId, nextParentId, nextType, id);
  const location = await locationRepo.updateById(id, {
    name: data.name ?? current.name,
    type: nextType,
    parent_id: nextParentId ?? null,
  });
  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_TYPES.LOCATION_UPDATED,
    entityType: ENTITY_TYPES.LOCATION,
    entityId: id,
    details: { type: location.type },
  });
  return location;
}

export async function deleteLocation(nurseryId, id, userId) {
  await requireLocation(nurseryId, id);

  const childrenCount = await locationRepo.countChildren(id);
  if (childrenCount > 0) {
    throw new AppError('Нельзя удалить локацию с дочерними узлами', 400);
  }

  const plantsCount = await locationRepo.countActivePlants(id);
  if (plantsCount > 0) {
    throw new AppError('Нельзя удалить локацию с активными растениями', 400);
  }

  await locationRepo.deleteById(id);
  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_TYPES.LOCATION_DELETED,
    entityType: ENTITY_TYPES.LOCATION,
    entityId: id,
    details: null,
  });
}

async function requireLocation(nurseryId, id) {
  const location = await locationRepo.findByNurseryAndId(nurseryId, id);
  if (!location) {
    throw new AppError('Локация не найдена', 404);
  }

  return location;
}

async function ensureParentValid(nurseryId, parentId, childType, selfId = null) {
  if (!parentId) {
    return;
  }

  if (selfId && selfId === parentId) {
    throw new AppError('Локация не может быть родителем самой себе', 400);
  }

  const parent = await locationRepo.findByNurseryAndId(nurseryId, parentId);
  if (!parent) {
    throw new AppError('Родительская локация не найдена в этом питомнике', 400);
  }

  if (TYPE_LEVEL[parent.type] + 1 !== TYPE_LEVEL[childType]) {
    throw new AppError('Нарушена иерархия локаций area -> section -> row -> place', 400);
  }
}

function buildTree(locations) {
  const nodes = new Map(
    locations.map((location) => [location.id, { ...location, children: [] }])
  );
  const roots = [];

  for (const node of nodes.values()) {
    if (!node.parent_id) {
      roots.push(node);
      continue;
    }

    const parent = nodes.get(node.parent_id);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
