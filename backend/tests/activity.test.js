import { beforeEach, describe, expect, it } from 'vitest';

import * as activityRepo from '@/repositories/activityLog.repository.js';
import { api, createFullFixture, db, systemMovementType } from './helpers.js';

describe('M13 — Лента активности', () => {
  let ctx;
  let activityBase;

  beforeEach(async () => {
    ctx = await createFullFixture();
    activityBase = `/api/nurseries/${ctx.nurseryId}/activity`;
  });

  async function makePlant(variety = 'Act plant') {
    return (await api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({ variety })).body;
  }

  it('создание растения пишет лог plant.created', async () => {
    const plant = await makePlant();
    const log = await db('activity_logs')
      .where({ nursery_id: ctx.nurseryId, event_type: 'plant.created', entity_id: plant.id })
      .first();
    expect(log).toBeTruthy();
  });

  it('движение пишет корректный тип лога', async () => {
    const plant = await makePlant();
    const transfer = await systemMovementType('transfer');
    const locBase = `/api/nurseries/${ctx.nurseryId}/locations`;
    const area = (await api().post(locBase).set('Cookie', ctx.cookie).send({ name: 'A', type: 'area' })).body;
    await api()
      .post(`/api/nurseries/${ctx.nurseryId}/plants/${plant.id}/movements`)
      .set('Cookie', ctx.cookie)
      .send({ typeId: transfer.id, toLocationId: area.id });
    const log = await db('activity_logs').where({ nursery_id: ctx.nurseryId }).where('event_type', 'like', 'movement.%').first();
    expect(log).toBeTruthy();
  });

  it('лента доступна всем ролям (observer → 200)', async () => {
    const res = await api().get(activityBase).set('Cookie', ctx.observer.cookie);
    expect(res.status).toBe(200);
  });

  it('фильтр по userId работает', async () => {
    await makePlant();
    const res = await api().get(`${activityBase}?userId=${ctx.owner.id}`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    const logs = res.body.data ?? res.body;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.user_id === ctx.owner.id)).toBe(true);
  });

  it('фильтр по eventType работает', async () => {
    await makePlant();
    const res = await api().get(`${activityBase}?eventType=plant.created`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    const logs = res.body.data ?? res.body;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.event_type === 'plant.created')).toBe(true);
  });

  it('пагинация ленты работает', async () => {
    for (let i = 0; i < 5; i += 1) {
      await makePlant(`P${i}`);
    }
    const p1 = await api().get(`${activityBase}?page=1&perPage=3`).set('Cookie', ctx.cookie);
    const p2 = await api().get(`${activityBase}?page=2&perPage=3`).set('Cookie', ctx.cookie);
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    const a1 = p1.body.data ?? p1.body;
    const a2 = p2.body.data ?? p2.body;
    expect(a1).toHaveLength(3);
    expect(a1[0].id).not.toBe(a2[0]?.id);
  });

  // B21 — пагинация журнала валидируется/зажимается: perPage ≤100, мусор → дефолт.
  it('perPage=1000000 зажимается до 100', async () => {
    await makePlant();
    const res = await api().get(`${activityBase}?perPage=1000000`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body.perPage).toBe(100);
    expect((res.body.data ?? res.body).length).toBeLessThanOrEqual(100);
  });

  it('page=abc не роняет 500 (дефолт page=1)', async () => {
    await makePlant();
    const res = await api().get(`${activityBase}?page=abc`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
  });

  it('cleanup удаляет записи старше 2 лет', async () => {
    const [inserted] = await db('activity_logs')
      .insert({
        nursery_id: ctx.nurseryId,
        user_id: ctx.owner.id,
        event_type: 'plant.created',
        entity_type: 'plant',
        entity_id: null,
        details: null,
        created_at: '2020-01-01T00:00:00Z',
      })
      .returning('id');
    const id = inserted.id ?? inserted;
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    await activityRepo.deleteOlderThan(twoYearsAgo);
    const after = await db('activity_logs').where({ id }).first();
    expect(after).toBeFalsy();
  });
});
