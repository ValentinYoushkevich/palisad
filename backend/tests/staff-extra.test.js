import { describe, expect, it } from 'vitest';

import { api, createFullFixture, db } from './helpers.js';

describe('M5 — Сотрудники (доп. ветки)', () => {
  it('получение сотрудника по id → 200', async () => {
    const ctx = await createFullFixture();
    const res = await api()
      .get(`/api/nurseries/${ctx.nurseryId}/users/${ctx.worker.user.id}`)
      .set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ctx.worker.user.id);
  });

  it('сотрудник не найден по id → 404', async () => {
    const ctx = await createFullFixture();
    const res = await api()
      .get(`/api/nurseries/${ctx.nurseryId}/users/00000000-0000-4000-8000-000000000000`)
      .set('Cookie', ctx.cookie);
    expect(res.status).toBe(404);
  });

  it('обновление сотрудника (имя) → 200', async () => {
    const ctx = await createFullFixture();
    const res = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/users/${ctx.worker.user.id}`)
      .set('Cookie', ctx.cookie)
      .send({ name: 'Worker Renamed' });
    expect(res.status).toBe(200);
    const row = await db('users').where({ id: ctx.worker.user.id }).first();
    expect(row.name).toBe('Worker Renamed');
  });

  it('деактивация и реактивация сотрудника', async () => {
    const ctx = await createFullFixture();
    const id = ctx.worker.user.id;
    const off = await api().patch(`/api/nurseries/${ctx.nurseryId}/users/${id}/status`).set('Cookie', ctx.cookie);
    expect(off.status).toBe(200);
    const afterOff = await db('users').where({ id }).first();
    expect(afterOff.is_active).toBe(false);

    const on = await api().patch(`/api/nurseries/${ctx.nurseryId}/users/${id}/status`).set('Cookie', ctx.cookie);
    expect(on.status).toBe(200);
    const afterOn = await db('users').where({ id }).first();
    expect(afterOn.is_active).toBe(true);
  });
});
