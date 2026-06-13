import { describe, expect, it } from 'vitest';

import {
  api,
  createFullFixture,
  createOwnerWithNursery,
  db,
  setFreePlan,
  systemContainerType,
} from './helpers.js';

function plantsBase(ctx) {
  return `/api/nurseries/${ctx.nurseryId}/plants`;
}

async function createPlant(ctx, body = {}) {
  const res = await api().post(plantsBase(ctx)).set('Cookie', ctx.cookie).send({ variety: 'V', ...body });
  return res;
}

describe('M9 — Реестр растений', () => {
  it('создание генерирует qr_code и numeric_code', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await createPlant(ctx, { variety: 'Globosum' });
    expect(res.status).toBe(201);
    expect(res.body.qr_code).toBeTruthy();
    expect(res.body.numeric_code).toBeTruthy();
  });

  it('лимит растений соблюдается (403)', async () => {
    const ctx = await createOwnerWithNursery();
    await createPlant(ctx);
    const count = await db('plants').where({ nursery_id: ctx.nurseryId }).whereNull('deleted_at').count('id as c').then((r) => Number(r[0].c));
    await setFreePlan({ plant_limit: count });
    const res = await createPlant(ctx, { variety: 'Over' });
    expect(res.status).toBe(403);
  });

  it('поиск по QR и numeric code', async () => {
    const ctx = await createOwnerWithNursery();
    const plant = (await createPlant(ctx)).body;
    const byQr = await api().get(`${plantsBase(ctx)}/by-qr/${plant.qr_code}`).set('Cookie', ctx.cookie);
    const byCode = await api().get(`${plantsBase(ctx)}/by-code/${plant.numeric_code}`).set('Cookie', ctx.cookie);
    expect(byQr.status).toBe(200);
    expect(byQr.body.id).toBe(plant.id);
    expect(byCode.status).toBe(200);
    expect(byCode.body.id).toBe(plant.id);
  });

  it('поиск по несуществующему QR → 404', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api().get(`${plantsBase(ctx)}/by-qr/PAL-NOPE`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(404);
  });

  it('мягкое удаление не физическое', async () => {
    const ctx = await createOwnerWithNursery();
    const plant = (await createPlant(ctx)).body;
    const res = await api().delete(`${plantsBase(ctx)}/${plant.id}`).set('Cookie', ctx.cookie);
    expect([200, 204]).toContain(res.status);
    const row = await db('plants').where({ id: plant.id }).first();
    expect(row).toBeTruthy();
    expect(row.deleted_at).not.toBeNull();
  });

  it('восстановление только owner', async () => {
    const ctx = await createFullFixture();
    const plant = (await api().post(plantsBase(ctx)).set('Cookie', ctx.cookie).send({ variety: 'R' })).body;
    await api().delete(`${plantsBase(ctx)}/${plant.id}`).set('Cookie', ctx.cookie);

    const byAgro = await api().patch(`${plantsBase(ctx)}/${plant.id}/restore`).set('Cookie', ctx.agronomist.cookie);
    expect(byAgro.status).toBe(403);
    const byOwner = await api().patch(`${plantsBase(ctx)}/${plant.id}/restore`).set('Cookie', ctx.cookie);
    expect(byOwner.status).toBe(200);
  });

  it('bulk-create создаёт N растений с разными QR', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .post(`${plantsBase(ctx)}/bulk`)
      .set('Cookie', ctx.cookie)
      .send({ count: 5, template: { variety: 'Bulk' } });
    expect(res.status).toBe(201);
    const rows = await db('plants').where({ nursery_id: ctx.nurseryId, variety: 'Bulk' });
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((p) => p.qr_code)).size).toBe(5);
  });

  it('теги растений требуют feature_tags → 403', async () => {
    const ctx = await createOwnerWithNursery();
    const plant = (await createPlant(ctx)).body;
    const tag = (await api().post(`/api/nurseries/${ctx.nurseryId}/tags`).set('Cookie', ctx.cookie).send({ name: 'T', color: '#00FF00' })).body;
    await setFreePlan({ feature_tags: false });
    const res = await api().post(`${plantsBase(ctx)}/${plant.id}/tags/${tag.id}`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(403);
  });

  it('добавление и удаление тега растения (feature on)', async () => {
    const ctx = await createOwnerWithNursery();
    const plant = (await createPlant(ctx)).body;
    const tag = (await api().post(`/api/nurseries/${ctx.nurseryId}/tags`).set('Cookie', ctx.cookie).send({ name: 'T2', color: '#0000FF' })).body;
    const add = await api().post(`${plantsBase(ctx)}/${plant.id}/tags/${tag.id}`).set('Cookie', ctx.cookie);
    expect([200, 204]).toContain(add.status);
    const withTags = await api().get(`${plantsBase(ctx)}/${plant.id}`).set('Cookie', ctx.cookie);
    expect(withTags.body.tags.some((t) => t.id === tag.id)).toBe(true);
    const remove = await api().delete(`${plantsBase(ctx)}/${plant.id}/tags/${tag.id}`).set('Cookie', ctx.cookie);
    expect([200, 204]).toContain(remove.status);
  });

  it('фильтрация по контейнеру и numeric code', async () => {
    const ctx = await createOwnerWithNursery();
    const ct = await systemContainerType('P9');
    const plant = (await createPlant(ctx, { containerId: ct.id })).body;
    const res = await api()
      .get(`${plantsBase(ctx)}?containerId=${ct.id}&numericCode=${plant.numeric_code}`)
      .set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    const items = res.body.data ?? res.body;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(plant.id);
  });

  it('пагинация работает', async () => {
    const ctx = await createOwnerWithNursery();
    for (let i = 0; i < 5; i += 1) {
      await createPlant(ctx, { variety: `P${i}` });
    }
    const page1 = await api().get(`${plantsBase(ctx)}?page=1&perPage=2`).set('Cookie', ctx.cookie);
    const page2 = await api().get(`${plantsBase(ctx)}?page=2&perPage=2`).set('Cookie', ctx.cookie);
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page2.body.data.length).toBeGreaterThanOrEqual(1);
    expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
    expect(page1.body.total).toBe(5);
  });

  it('обновление растения → 200', async () => {
    const ctx = await createOwnerWithNursery();
    const plant = (await createPlant(ctx)).body;
    const res = await api()
      .patch(`${plantsBase(ctx)}/${plant.id}`)
      .set('Cookie', ctx.cookie)
      .send({ variety: 'Updated', notes: 'note' });
    expect(res.status).toBe(200);
  });

  it('поиск по тексту (search) → 200', async () => {
    const ctx = await createOwnerWithNursery();
    await createPlant(ctx, { variety: 'Sakura special' });
    const res = await api().get(`${plantsBase(ctx)}?search=Sakura`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    const items = res.body.data ?? res.body;
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('растение не найдено по id → 404', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .get(`${plantsBase(ctx)}/00000000-0000-4000-8000-000000000000`)
      .set('Cookie', ctx.cookie);
    expect(res.status).toBe(404);
  });
});
