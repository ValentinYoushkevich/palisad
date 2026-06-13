import { describe, expect, it } from 'vitest';

import {
  api,
  createFullFixture,
  createOwnerWithNursery,
  db,
  setFreePlan,
  uniqueEmail,
} from './helpers.js';

describe('M5 — Сотрудники', () => {
  it('создание сотрудника: must_change_password = true', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/users`)
      .set('Cookie', ctx.cookie)
      .send({ name: 'Agro One', role: 'agronomist', email: uniqueEmail('agro'), password: 'Secret123!' });
    expect(res.status).toBe(201);
    const dbUser = await db('users').where({ id: res.body.id }).first();
    expect(dbUser.must_change_password).toBe(true);
  });

  it('лимит пользователей соблюдается (403)', async () => {
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ user_limit: 1 }); // owner уже занимает лимит
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/users`)
      .set('Cookie', ctx.cookie)
      .send({ name: 'Over Limit', role: 'worker', password: 'Secret123!' });
    expect(res.status).toBe(403);
  });

  it('деактивация последнего owner → 400', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/users/${ctx.owner.id}/status`)
      .set('Cookie', ctx.cookie);
    expect(res.status).toBe(400);
  });

  it('observer не может создать сотрудника → 403', async () => {
    const ctx = await createFullFixture();
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/users`)
      .set('Cookie', ctx.observer.cookie)
      .send({ name: 'By Observer', role: 'worker', password: 'Secret123!' });
    expect(res.status).toBe(403);
  });

  it('фильтр по роли работает', async () => {
    const ctx = await createFullFixture();
    const res = await api()
      .get(`/api/nurseries/${ctx.nurseryId}/users?role=worker`)
      .set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body.every((u) => u.role === 'worker')).toBe(true);
  });

  it('список сотрудников без фильтра → 200 (>=4)', async () => {
    const ctx = await createFullFixture();
    const res = await api().get(`/api/nurseries/${ctx.nurseryId}/users`).set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });

  it('изменение роли обновляет updated_at', async () => {
    const ctx = await createFullFixture();
    const id = ctx.agronomist.user.id;
    const before = await db('users').where({ id }).first();
    await new Promise((r) => setTimeout(r, 15));
    const res = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/users/${id}/role`)
      .set('Cookie', ctx.cookie)
      .send({ role: 'worker' });
    expect(res.status).toBe(200);
    const after = await db('users').where({ id }).first();
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
  });

  it('нельзя назначить роль owner через API → 400', async () => {
    const ctx = await createFullFixture();
    const res = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/users/${ctx.agronomist.user.id}/role`)
      .set('Cookie', ctx.cookie)
      .send({ role: 'owner' });
    expect(res.status).toBe(400);
  });
});
