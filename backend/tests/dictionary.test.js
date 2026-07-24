import { describe, expect, it, vi } from 'vitest';

import * as gbifClient from '@/services/gbif.client.js';
import {
  api,
  createOwnerWithNursery,
  db,
  setFreePlan,
  systemContainerType,
  systemMovementType,
} from './helpers.js';

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

// GBIF мокаем: сеть в тестах не дёргаем, ответ детерминирован. Чистые функции
// (resolveSpeciesFromMatch, mapGbifSpecies) оставляем настоящими.
vi.mock('@/services/gbif.client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchSpecies: vi.fn(async () => [ACER]),
    matchSpeciesByName: vi.fn(async () => ({ confidence: 99, ...ACER })),
  };
});

describe('M8 — Справочники', () => {
  it('поиск подсказок (GBIF) и добавление вида', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}`;

    const search = await api().get(`${base}/species/search?q=Acer`).set('Cookie', ctx.cookie);
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body)).toBe(true);

    const attach = await api()
      .post(`${base}/species/attach-by-name`)
      .set('Cookie', ctx.cookie)
      .send({ scientific_name: 'Acer platanoides', display_name_ru: 'Клён остролистный' });
    expect(attach.status).toBe(201);
    const created = await db('nursery_species').where({ nursery_id: ctx.nurseryId });
    expect(created).toHaveLength(1);
  });

  it('дубль вида в питомнике не создаётся', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}`;
    const payload = { scientific_name: 'Acer platanoides', display_name_ru: 'Клён остролистный' };
    await api().post(`${base}/species/attach-by-name`).set('Cookie', ctx.cookie).send(payload);
    const res = await api().post(`${base}/species/attach-by-name`).set('Cookie', ctx.cookie).send(payload);
    expect(res.body.alreadyExists === true || res.status === 409).toBe(true);
    const rows = await db('nursery_species').where({ nursery_id: ctx.nurseryId });
    expect(rows).toHaveLength(1);
  });

  it('список видов → 200', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api().get(`/api/nurseries/${ctx.nurseryId}/species`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
  });

  // B19 — сбой GBIF не должен ронять весь поиск: локальные результаты отдаются, статус 200.
  it('сбой GBIF → /species/search отдаёт локальные результаты (200, не 502)', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}`;
    // Локальный вид, который найдётся без участия GBIF.
    await api()
      .post(`${base}/species/attach-by-name`)
      .set('Cookie', ctx.cookie)
      .send({ scientific_name: 'Acer platanoides', display_name_ru: 'Клён остролистный' });

    // Теперь внешний GBIF-поиск падает.
    gbifClient.searchSpecies.mockRejectedValueOnce(new Error('GBIF unavailable'));

    const res = await api().get(`${base}/species/search?q=Acer`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('теги требуют feature_tags → 403', async () => {
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ feature_tags: false });
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/tags`)
      .set('Cookie', ctx.cookie)
      .send({ name: 'Blocked', color: '#FF0000' });
    expect(res.status).toBe(403);
  });

  it('CRUD тегов', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}/tags`;
    const create = await api().post(base).set('Cookie', ctx.cookie).send({ name: 'Tag A', color: '#00FF00' });
    expect(create.status).toBe(201);
    const tagId = create.body.id;
    expect(tagId).toBeTruthy();

    const update = await api().patch(`${base}/${tagId}`).set('Cookie', ctx.cookie).send({ name: 'Tag B' });
    expect(update.status).toBe(200);

    const del = await api().delete(`${base}/${tagId}`).set('Cookie', ctx.cookie);
    expect(del.status).toBe(200);
    const row = await db('tags').where({ id: tagId }).first();
    expect(row.is_active).toBe(false);

    const list = await api().get(base).set('Cookie', ctx.cookie);
    expect(list.status).toBe(200);
  });

  it('системные movement_types защищены', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}/movement-types`;
    const sys = await systemMovementType('sale');
    const patch = await api().patch(`${base}/${sys.id}`).set('Cookie', ctx.cookie).send({ name: 'Hack' });
    const del = await api().delete(`${base}/${sys.id}`).set('Cookie', ctx.cookie);
    expect(patch.status).toBe(403);
    expect(del.status).toBe(403);
  });

  it('CRUD пользовательских movement_types', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}/movement-types`;
    const create = await api()
      .post(base)
      .set('Cookie', ctx.cookie)
      .send({ name: 'Custom Move', slug: `cm-${Date.now()}`, sets_status: 'growing' });
    expect(create.status).toBe(201);
    const id = create.body.id;
    const patch = await api().patch(`${base}/${id}`).set('Cookie', ctx.cookie).send({ name: 'Renamed' });
    expect(patch.status).toBe(200);
    const del = await api().delete(`${base}/${id}`).set('Cookie', ctx.cookie);
    expect(del.status).toBe(200);

    const list = await api().get(base).set('Cookie', ctx.cookie);
    expect(list.status).toBe(200);
  });

  it('системные container_types защищены', async () => {
    const ctx = await createOwnerWithNursery();
    const base = `/api/nurseries/${ctx.nurseryId}/container-types`;
    const sys = await systemContainerType('P9');
    const patch = await api().patch(`${base}/${sys.id}`).set('Cookie', ctx.cookie).send({ name: 'Hack' });
    const del = await api().delete(`${base}/${sys.id}`).set('Cookie', ctx.cookie);
    expect(patch.status).toBe(403);
    expect(del.status).toBe(403);
  });

  it('удаление используемого container type — мягкое (is_active=false)', async () => {
    const ctx = await createOwnerWithNursery();
    const ctBase = `/api/nurseries/${ctx.nurseryId}/container-types`;
    const create = await api()
      .post(ctBase)
      .set('Cookie', ctx.cookie)
      .send({ code: `CUST-${Date.now()}`, name: 'Custom Pot', container_kind: 'pot', volume_liters: 7 });
    expect(create.status).toBe(201);
    const custom = create.body;

    await api()
      .post(`/api/nurseries/${ctx.nurseryId}/plants`)
      .set('Cookie', ctx.cookie)
      .send({ containerId: custom.id, variety: 'CT user' });

    const del = await api().delete(`${ctBase}/${custom.id}`).set('Cookie', ctx.cookie);
    expect(del.status).toBe(200);
    const row = await db('container_types').where({ id: custom.id }).first();
    expect(row.is_active).toBe(false);

    const list = await api().get(ctBase).set('Cookie', ctx.cookie);
    expect(list.status).toBe(200);
  });
});
