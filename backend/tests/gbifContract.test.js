import { afterEach, describe, expect, it, vi } from 'vitest';

import { mapGbifSpecies, searchSpecies } from '@/services/gbif.client.js';

// T10 — контракт-тест GBIF-клиента. Фиксирует РЕАЛЬНУЮ форму ответа GBIF
// GET /species/search (усечённую до используемых полей) и проверяет, что клиент
// маппит её во внутреннюю форму. Если GBIF переименует/уберёт поля (key,
// scientificName, canonicalName, taxonomicStatus, family, genus, ...) — тест упадёт,
// и дрейф контракта будет замечен, а не молча сломает поиск/привязку видов.
//
// Важное отличие от search/match: GBIF /species/search отдаёт результат под ключом
// `key` (не `usageKey`) и статус в поле `taxonomicStatus` (не `status`). mapGbifSpecies
// обязан покрывать именно эти имена — иначе gbifId/статус потеряются.
const GBIF_SEARCH_RESPONSE = {
  offset: 0,
  limit: 20,
  endOfRecords: false,
  count: 1,
  results: [
    {
      key: 3189834,
      nubKey: 3189834,
      nameKey: 5386213,
      taxonID: 'gbif:3189834',
      kingdom: 'Plantae',
      phylum: 'Tracheophyta',
      order: 'Sapindales',
      family: 'Sapindaceae',
      genus: 'Acer',
      species: 'Acer platanoides',
      kingdomKey: 6,
      phylumKey: 7707728,
      classKey: 220,
      orderKey: 933,
      familyKey: 6657,
      genusKey: 3189866,
      speciesKey: 3189834,
      scientificName: 'Acer platanoides L.',
      canonicalName: 'Acer platanoides',
      authorship: 'L.',
      nameType: 'SCIENTIFIC',
      rank: 'SPECIES',
      taxonomicStatus: 'ACCEPTED',
      origin: 'SOURCE',
      numDescendants: 12,
      numOccurrences: 0,
      habitats: [],
      nomenclaturalStatus: [],
      threatStatuses: [],
      descriptions: [],
      vernacularNames: [],
      higherClassificationMap: {},
      synonym: false,
      class: 'Magnoliopsida',
    },
  ],
};

describe('T10 — контракт GBIF /species/search', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searchSpecies извлекает массив results из ответа GBIF', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => GBIF_SEARCH_RESPONSE,
    });

    const results = await searchSpecies('Acer platanoides', 10);
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe(3189834);
  });

  it('searchSpecies формирует ожидаемый запрос к GBIF (endpoint + params)', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => GBIF_SEARCH_RESPONSE,
    });

    await searchSpecies('Acer', 7);
    const calledUrl = String(spy.mock.calls[0][0]);
    expect(calledUrl).toContain('/species/search');
    expect(calledUrl).toContain('q=Acer');
    expect(calledUrl).toContain('rank=SPECIES');
    expect(calledUrl).toContain('status=ACCEPTED');
    expect(calledUrl).toContain('limit=7');
  });

  it('mapGbifSpecies маппит форму GBIF во внутреннюю (только используемые поля)', () => {
    const [raw] = GBIF_SEARCH_RESPONSE.results;
    const mapped = mapGbifSpecies(raw);

    // Внутренняя форма: ровно те поля, что реально потребляются сервисом/репозиторием.
    expect(mapped).toEqual({
      gbifUsageKey: 3189834,
      scientificName: 'Acer platanoides L.',
      canonicalName: 'Acer platanoides',
      authorship: 'L.',
      rank: 'SPECIES',
      taxonomicStatus: 'ACCEPTED',
      family: 'Sapindaceae',
      genus: 'Acer',
    });
  });
});
