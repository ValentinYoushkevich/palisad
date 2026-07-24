import * as containerTypeRepo from '@/repositories/containerType.repository.js';
import * as movementTypeRepo from '@/repositories/movementType.repository.js';
import * as nurserySpeciesRepo from '@/repositories/nurserySpecies.repository.js';
import * as speciesCatalogRepo from '@/repositories/speciesCatalog.repository.js';
import * as tagRepo from '@/repositories/tag.repository.js';
import * as gbifClient from '@/services/gbif.client.js';
import { AppError } from '@/utils/AppError.js';
import { checkFeature } from '@/utils/planGuards.js';

export async function getSpecies(nurseryId) {
  const rows = await nurserySpeciesRepo.findAll(nurseryId);
  return rows.map(mapNurserySpeciesToApi);
}

export async function searchSpecies(nurseryId, q) {
  const query = String(q ?? '').trim();
  if (query.length < 2) {
    return [];
  }

  // GBIF — внешний источник: его недоступность/таймаут не должны ронять весь поиск.
  // allSettled даёт деградировать до локальных результатов вместо 502 (B19). Локальные
  // источники (наша БД) при сбое — реальная ошибка, её пробрасываем.
  const [localResult, catalogResult, gbifResult] = await Promise.allSettled([
    nurserySpeciesRepo.searchByQuery(nurseryId, query),
    speciesCatalogRepo.searchByQuery(query, 20),
    gbifClient.searchSpecies(query, 10),
  ]);

  if (localResult.status === 'rejected') {
    throw localResult.reason;
  }
  if (catalogResult.status === 'rejected') {
    throw catalogResult.reason;
  }

  const localSpecies = localResult.value;
  const catalogMatches = catalogResult.value;
  const gbifMatches = gbifResult.status === 'fulfilled' ? gbifResult.value : [];

  const suggestions = [];
  const seen = new Set();

  function pushCandidate(item) {
    const gbifId = Number(item?.gbifUsageKey ?? item?.gbif_usage_key ?? 0);
    const scientificName = String(item?.scientificName ?? item?.scientific_name ?? '').trim();
    if (!gbifId || !scientificName) {
      return;
    }
    const key = `${gbifId}:${scientificName.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    suggestions.push({
      gbifId,
      scientificName,
      family: item?.family ?? item?.gbif_family ?? null,
      genus: item?.genus ?? item?.gbif_genus ?? null,
    });
  }

  localSpecies.forEach((item) =>
    pushCandidate({
      gbif_usage_key: item.gbif_usage_key,
      scientific_name: item.scientific_name,
      family: item.family,
      genus: item.genus,
    })
  );
  catalogMatches.forEach(pushCandidate);
  gbifMatches.forEach((item) => pushCandidate(gbifClient.mapGbifSpecies(item)));

  return suggestions.slice(0, 20);
}

export async function attachSpeciesByName(nurseryId, data) {
  const scientificName = String(data.scientific_name ?? '').trim();
  const displayNameRu = String(data.display_name_ru ?? '').trim();
  if (!scientificName) {
    throw new AppError('Латинское название обязательно', 400);
  }
  if (!displayNameRu) {
    throw new AppError('Русское название обязательно', 400);
  }

  let source = 'local';
  let catalog = await speciesCatalogRepo.findByScientificNameExact(scientificName);
  if (!catalog) {
    catalog = await resolveCatalogSpecies(scientificName);
    source = 'gbif';
  }

  const existing = await nurserySpeciesRepo.findByCatalogId(nurseryId, catalog.id);
  if (existing) {
    return { ...mapNurserySpeciesToApi(existing), alreadyExists: true, source: 'local' };
  }

  const created = await nurserySpeciesRepo.create({
    nursery_id: nurseryId,
    species_catalog_id: catalog.id,
    display_name_ru: displayNameRu,
    is_active: true,
  });

  const hydrated = await nurserySpeciesRepo.findById(nurseryId, created.id);
  return { ...mapNurserySpeciesToApi(hydrated), alreadyExists: false, source };
}

export async function updateSpecies(nurseryId, id, data) {
  const current = await nurserySpeciesRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Вид не найден', 404);
  }

  const updated = await nurserySpeciesRepo.updateById(id, data);
  const hydrated = await nurserySpeciesRepo.findById(nurseryId, updated.id);
  return mapNurserySpeciesToApi(hydrated);
}

export async function deleteSpecies(nurseryId, id) {
  const current = await nurserySpeciesRepo.findById(nurseryId, id);
  if (!current) {
    throw new AppError('Вид не найден', 404);
  }

  const updated = await nurserySpeciesRepo.updateById(id, { is_active: false });
  const hydrated = await nurserySpeciesRepo.findById(nurseryId, updated.id);
  return mapNurserySpeciesToApi(hydrated);
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

  // B23: теперь countUsedByPlants реально определяет ветку (раньше обе ветки были
  // идентичны — мягкое удаление независимо от использования). Контейнер, привязанный к
  // растениям, физически удалять нельзя (у растений повисла бы ссылка на неактивный тип) —
  // деактивируем (контракт приёмки M8#6). Неиспользуемый удаляем физически.
  const used = await containerTypeRepo.countUsedByPlants(id);
  if (used > 0) {
    return containerTypeRepo.updateById(id, { is_active: false });
  }

  await containerTypeRepo.deleteById(id);
  return { id, deleted: true };
}

async function resolveCatalogSpecies(scientificName) {
  const match = await gbifClient.matchSpeciesByName(scientificName);
  let normalized = gbifClient.resolveSpeciesFromMatch(match);

  if (!normalized) {
    const fallback = await gbifClient.searchSpecies(scientificName, 10);
    normalized = pickFallbackSpecies(scientificName, fallback);
  }

  if (!normalized?.gbifUsageKey || !normalized?.scientificName) {
    throw new AppError('Вид не найден в GBIF', 404, 'GBIF_MATCH_NOT_FOUND');
  }

  const existing = await speciesCatalogRepo.findByUsageKey(normalized.gbifUsageKey);
  if (existing) {
    return speciesCatalogRepo.updateById(existing.id, {
      scientific_name: normalized.scientificName,
      canonical_name: normalized.canonicalName,
      authorship: normalized.authorship,
      rank: normalized.rank,
      taxonomic_status: normalized.taxonomicStatus,
      family: normalized.family,
      genus: normalized.genus,
      source: 'gbif',
    });
  }

  return speciesCatalogRepo.create({
    gbif_usage_key: normalized.gbifUsageKey,
    scientific_name: normalized.scientificName,
    canonical_name: normalized.canonicalName,
    authorship: normalized.authorship,
    rank: normalized.rank,
    taxonomic_status: normalized.taxonomicStatus,
    family: normalized.family,
    genus: normalized.genus,
    source: 'gbif',
  });
}

function pickFallbackSpecies(query, candidates) {
  const normalizedQuery = String(query).trim().toLowerCase();
  const mapped = candidates
    .map((item) => gbifClient.mapGbifSpecies(item))
    .filter((item) => Boolean(item.gbifUsageKey && item.scientificName));

  const exact = mapped.find((item) => item.scientificName.toLowerCase() === normalizedQuery);
  return exact || mapped[0] || null;
}

function mapNurserySpeciesToApi(row) {
  return {
    id: row.id,
    nursery_id: row.nursery_id,
    species_catalog_id: row.species_catalog_id,
    gbif_id: row.gbif_usage_key,
    scientific_name: row.scientific_name,
    canonical_name: row.canonical_name,
    display_name_ru: row.display_name_ru,
    gbif_family: row.family,
    gbif_genus: row.genus,
    rank: row.rank,
    taxonomic_status: row.taxonomic_status,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
