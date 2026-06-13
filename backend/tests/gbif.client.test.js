import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  mapGbifSpecies,
  matchSpeciesByName,
  resolveSpeciesFromMatch,
  searchSpecies,
} from '@/services/gbif.client.js';

describe('gbif.client (юнит, fetch замокан)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searchSpecies возвращает results при ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ key: 1, scientificName: 'Acer' }] }),
    });
    const r = await searchSpecies('Acer');
    expect(r).toHaveLength(1);
  });

  it('searchSpecies бросает 502 при !ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false });
    await expect(searchSpecies('Acer')).rejects.toMatchObject({ status: 502 });
  });

  it('matchSpeciesByName возвращает json при ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ usageKey: 5, confidence: 99 }),
    });
    const r = await matchSpeciesByName('Acer');
    expect(r.usageKey).toBe(5);
  });

  it('matchSpeciesByName бросает 502 при !ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false });
    await expect(matchSpeciesByName('Acer')).rejects.toMatchObject({ status: 502 });
  });

  it('resolveSpeciesFromMatch: низкая уверенность → null', () => {
    expect(resolveSpeciesFromMatch({ usageKey: 1, confidence: 10 })).toBeNull();
  });

  it('resolveSpeciesFromMatch: нет usageKey → null', () => {
    expect(resolveSpeciesFromMatch({ confidence: 99 })).toBeNull();
  });

  it('resolveSpeciesFromMatch: высокая уверенность → объект', () => {
    const r = resolveSpeciesFromMatch({ usageKey: 1, confidence: 99, scientificName: 'Acer', canonicalName: 'Acer' });
    expect(r.gbifUsageKey).toBe(1);
  });

  it('mapGbifSpecies маппит ключевые поля', () => {
    const r = mapGbifSpecies({ key: 7, canonicalName: 'Acer', family: 'Sapindaceae' });
    expect(r.gbifUsageKey).toBe(7);
    expect(r.family).toBe('Sapindaceae');
  });
});
