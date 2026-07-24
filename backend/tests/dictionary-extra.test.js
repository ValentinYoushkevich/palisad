import { describe, expect, it, vi } from 'vitest';

import * as gbifClient from '@/services/gbif.client.js';
import { api, createOwnerWithNursery, db } from './helpers.js';

const ACER = {
  usageKey: 3189834,
  scientificName: 'Acer platanoides L.',
  canonicalName: 'Acer platanoides',
  authorship: 'L.',
  rank: 'SPECIES',
  status: 'ACCEPTED',
  family: 'Sapindaceae',
  genus: 'Acer',
};

vi.mock('@/services/gbif.client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchSpecies: vi.fn(async () => [ACER]),
    matchSpeciesByName: vi.fn(async () => ({ confidence: 99, ...ACER })),
  };
});

async function attach(ctx, body) {
  return api()
    .post(`/api/nurseries/${ctx.nurseryId}/species/attach-by-name`)
    .set('Cookie', ctx.cookie)
    .send(body);
}

describe('M8 — Справочники (доп. ветки)', () => {
  it('createSpecies (POST /species) → 200/201', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/species`)
      .set('Cookie', ctx.cookie)
      .send({ scientific_name: 'Acer platanoides', display_name_ru: 'Клён' });
    expect(res.status).toBe(201);
  });

  it('update и delete вида', async () => {
    const ctx = await createOwnerWithNursery();
    const created = (await attach(ctx, { scientific_name: 'Acer platanoides', display_name_ru: 'Клён' })).body;
    const id = created.id;
    const base = `/api/nurseries/${ctx.nurseryId}/species`;

    const upd = await api().patch(`${base}/${id}`).set('Cookie', ctx.cookie).send({ display_name_ru: 'Клён остролистный' });
    expect(upd.status).toBe(200);

    const del = await api().delete(`${base}/${id}`).set('Cookie', ctx.cookie);
    expect(del.status).toBe(200);
    const row = await db('nursery_species').where({ id }).first();
    expect(row.is_active).toBe(false);
  });

  it('update несуществующего вида → 404', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/species/00000000-0000-4000-8000-000000000000`)
      .set('Cookie', ctx.cookie)
      .send({ display_name_ru: 'X' });
    expect(res.status).toBe(404);
  });

  it('attach через fallback (низкая уверенность match → searchSpecies)', async () => {
    const ctx = await createOwnerWithNursery();
    vi.mocked(gbifClient.matchSpeciesByName).mockResolvedValueOnce({ confidence: 10, ...ACER });
    const res = await attach(ctx, { scientific_name: 'Acer platanoides', display_name_ru: 'Клён' });
    expect(res.status).toBe(201);
  });

  it('attach: вид не найден в GBIF → 404', async () => {
    const ctx = await createOwnerWithNursery();
    vi.mocked(gbifClient.matchSpeciesByName).mockResolvedValueOnce({ confidence: 10 });
    vi.mocked(gbifClient.searchSpecies).mockResolvedValueOnce([]);
    const res = await attach(ctx, { scientific_name: 'Unknownus speciesus', display_name_ru: 'Нет' });
    expect(res.status).toBe(404);
  });

  it('attach без русского имени → 400', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await attach(ctx, { scientific_name: 'Acer platanoides' });
    expect(res.status).toBe(400);
  });

  it('дубль slug у movement_type → 409 (errorHandler 23505)', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}/movement-types`;
    const slug = `dup-${Date.now()}`;
    await api().post(base).set('Cookie', ctx.cookie).send({ name: 'One', slug });
    const res = await api().post(base).set('Cookie', ctx.cookie).send({ name: 'Two', slug });
    expect(res.status).toBe(409);
  });

  it('дубль code у container_type → 409 (errorHandler 23505)', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}/container-types`;
    const code = `DUP-${Date.now()}`;
    await api().post(base).set('Cookie', ctx.cookie).send({ code, name: 'One', container_kind: 'pot' });
    const res = await api().post(base).set('Cookie', ctx.cookie).send({ code, name: 'Two', container_kind: 'pot' });
    expect(res.status).toBe(409);
  });
});
