import { AppError } from '@/utils/AppError.js';

const GBIF_BASE_URL = 'https://api.gbif.org/v1';
const MIN_CONFIDENCE = 90;

export async function matchSpeciesByName(name) {
  const response = await fetch(
    `${GBIF_BASE_URL}/species/match?${new URLSearchParams({ name }).toString()}`
  );
  if (!response.ok) {
    throw new AppError('Не удалось выполнить запрос к GBIF match API', 502, 'GBIF_MATCH_FAILED');
  }

  return response.json();
}

export async function searchSpecies(query, limit = 10) {
  const params = new URLSearchParams({
    q: query,
    rank: 'SPECIES',
    status: 'ACCEPTED',
    limit: String(limit),
  });
  const response = await fetch(`${GBIF_BASE_URL}/species/search?${params.toString()}`);
  if (!response.ok) {
    throw new AppError('Не удалось выполнить запрос к GBIF search API', 502, 'GBIF_SEARCH_FAILED');
  }

  const payload = await response.json();
  return payload?.results || [];
}

export function resolveSpeciesFromMatch(match) {
  const confidence = Number(match?.confidence ?? 0);
  const usageKey = match?.usageKey;
  if (!usageKey || confidence < MIN_CONFIDENCE) {
    return null;
  }

  return mapGbifSpecies(match);
}

export function mapGbifSpecies(item) {
  return {
    gbifUsageKey: item?.usageKey ?? item?.key ?? null,
    scientificName: item?.scientificName || item?.canonicalName || null,
    canonicalName: item?.canonicalName || null,
    authorship: item?.authorship || null,
    rank: item?.rank || null,
    taxonomicStatus: item?.status || item?.taxonomicStatus || null,
    family: item?.family || null,
    genus: item?.genus || null,
  };
}
