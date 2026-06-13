import { describe, expect, it } from 'vitest';

import {
  api,
  createOwnerWithNursery,
  db,
  loginCookie,
  register,
  STRONG_PASSWORD,
  uniqueEmail,
} from './helpers.js';

describe('M3 — Питомник', () => {
  it('питомник не найден до создания → 404', async () => {
    const email = uniqueEmail('owner');
    await register(email, STRONG_PASSWORD, 'Owner');
    const { cookie } = await loginCookie(email, STRONG_PASSWORD);
    const res = await api().get('/api/nurseries/my').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('создание питомника создаёт owner-пользователя (201)', async () => {
    const email = uniqueEmail('owner');
    await register(email, STRONG_PASSWORD, 'Owner');
    const { cookie } = await loginCookie(email, STRONG_PASSWORD);
    const res = await api()
      .post('/api/nurseries')
      .set('Cookie', cookie)
      .send({ name: 'My Nursery', address: 'Street 1' });
    expect(res.status).toBe(201);
    const account = await db('accounts').where({ email }).first();
    const nursery = await db('nurseries').where({ account_id: account.id }).first();
    const owner = await db('users').where({ nursery_id: nursery.id, role: 'owner' }).first();
    expect(owner).toBeTruthy();
  });

  it('повторное создание питомника → 409', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .post('/api/nurseries')
      .set('Cookie', ctx.cookie)
      .send({ name: 'Second Nursery' });
    expect(res.status).toBe(409);
  });

  it('получение питомника → 200', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api().get('/api/nurseries/my').set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ctx.nurseryId);
  });

  it('обновление питомника обновляет updated_at', async () => {
    const ctx = await createOwnerWithNursery();
    const before = await db('nurseries').where({ id: ctx.nurseryId }).first();
    await new Promise((r) => setTimeout(r, 15));
    const res = await api()
      .patch('/api/nurseries/my')
      .set('Cookie', ctx.cookie)
      .send({ name: 'Updated Nursery' });
    expect(res.status).toBe(200);
    const after = await db('nurseries').where({ id: ctx.nurseryId }).first();
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
  });

  it('без токена → 401', async () => {
    const res = await api().get('/api/nurseries/my');
    expect(res.status).toBe(401);
  });
});
