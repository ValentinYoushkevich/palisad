import { beforeEach, describe, expect, it } from 'vitest';

import { api, createFullFixture } from './helpers.js';

async function buildHierarchy(ctx) {
  const base = `/api/nurseries/${ctx.nurseryId}/locations`;
  const area = (await api().post(base).set('Cookie', ctx.cookie).send({ name: 'Участок 1', type: 'area' })).body;
  const section = (await api().post(base).set('Cookie', ctx.cookie).send({ name: 'Секция 1', type: 'section', parentId: area.id })).body;
  const row = (await api().post(base).set('Cookie', ctx.cookie).send({ name: 'Ряд 1', type: 'row', parentId: section.id })).body;
  const placeRes = await api().post(base).set('Cookie', ctx.cookie).send({ name: 'Место 1', type: 'place', parentId: row.id });
  return { base, area, section, row, place: placeRes.body, placeRes };
}

describe('M7 — Локации', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await createFullFixture();
  });

  it('поддерживается уровень place', async () => {
    const { place, placeRes } = await buildHierarchy(ctx);
    expect(placeRes.status).toBe(201);
    expect(place.type).toBe('place');
  });

  it('дерево возвращает 4 уровня', async () => {
    const { base, area, place } = await buildHierarchy(ctx);
    const res = await api().get(`${base}/tree`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    const root = res.body.find((a) => a.id === area.id);
    const depth4 = root?.children?.[0]?.children?.[0]?.children?.[0];
    expect(depth4?.id).toBe(place.id);
  });

  it('удаление при дочерних узлах запрещено → 400', async () => {
    const { base, area } = await buildHierarchy(ctx);
    const res = await api().delete(`${base}/${area.id}`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(400);
  });

  it('удаление локации с растениями запрещено → 400', async () => {
    const { base, place } = await buildHierarchy(ctx);
    await api()
      .post(`/api/nurseries/${ctx.nurseryId}/plants`)
      .set('Cookie', ctx.cookie)
      .send({ locationId: place.id, variety: 'In place' });
    const res = await api().delete(`${base}/${place.id}`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(400);
  });

  it('worker/observer не могут менять структуру → 403', async () => {
    const { base, area } = await buildHierarchy(ctx);
    const worker = await api().post(base).set('Cookie', ctx.worker.cookie).send({ name: 'W', type: 'area' });
    const observer = await api().patch(`${base}/${area.id}`).set('Cookie', ctx.observer.cookie).send({ name: 'O' });
    expect(worker.status).toBe(403);
    expect(observer.status).toBe(403);
  });

  it('ребёнок под «местом» запрещён → 400', async () => {
    const { base, place } = await buildHierarchy(ctx);
    const res = await api()
      .post(base)
      .set('Cookie', ctx.cookie)
      .send({ name: 'Bad child', type: 'row', parentId: place.id });
    expect(res.status).toBe(400);
  });

  it('нарушение уровней (area под section) → 400', async () => {
    const { base, section } = await buildHierarchy(ctx);
    const res = await api()
      .post(base)
      .set('Cookie', ctx.cookie)
      .send({ name: 'Bad area', type: 'area', parentId: section.id });
    expect(res.status).toBe(400);
  });

  it('успешное удаление пустой локации → 200/204', async () => {
    const base = `/api/nurseries/${ctx.nurseryId}/locations`;
    const area = (await api().post(base).set('Cookie', ctx.cookie).send({ name: 'Lonely', type: 'area' })).body;
    const res = await api().delete(`${base}/${area.id}`).set('Cookie', ctx.cookie);
    expect([200, 204]).toContain(res.status);
  });

  it('список локаций → 200', async () => {
    await buildHierarchy(ctx);
    const res = await api().get(`/api/nurseries/${ctx.nurseryId}/locations`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });
});
