import { describe, expect, it } from 'vitest';

import {
  api,
  createOwnerWithNursery,
  createStaff,
  db,
  loginCookie,
  register,
  setFreePlan,
  STRONG_PASSWORD,
  toCookieHeader,
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

  // B22: PATCH питомника закрыт для не-структурных ролей (раньше без requireRole).
  it('observer не может переименовать питомник → 403, owner может', async () => {
    await setFreePlan({ user_limit: 50 });
    const ctx = await createOwnerWithNursery();
    const { cookie } = await createStaff(ctx, 'observer');
    const denied = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}`)
      .set('Cookie', cookie)
      .send({ name: 'Hacked Name' });
    expect(denied.status).toBe(403);

    // и через /my — гейт роли в контроллере updateMyNursery
    const deniedMy = await api()
      .patch('/api/nurseries/my')
      .set('Cookie', cookie)
      .send({ name: 'Hacked My' });
    expect(deniedMy.status).toBe(403);

    const ok = await api()
      .patch(`/api/nurseries/${ctx.nurseryId}`)
      .set('Cookie', ctx.cookie)
      .send({ name: 'Legit Rename' });
    expect(ok.status).toBe(200);
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

  it('создание второго питомника → 201 и он становится активным', async () => {
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ nursery_limit: 5 });

    const res = await api()
      .post('/api/nurseries')
      .set('Cookie', ctx.cookie)
      .send({ name: 'Second Nursery', address: 'St 2' });
    expect(res.status).toBe(201);

    const cookie2 = toCookieHeader(res.headers['set-cookie']);
    const my = await api().get('/api/nurseries/my').set('Cookie', cookie2);
    expect(my.body.name).toBe('Second Nursery');
  });

  it('GET /nurseries возвращает все питомники аккаунта', async () => {
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ nursery_limit: 5 });
    await api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'Second' });

    const res = await api().get('/api/nurseries').set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('switch переключает активный питомник', async () => {
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ nursery_limit: 5 });
    const created = await api()
      .post('/api/nurseries')
      .set('Cookie', ctx.cookie)
      .send({ name: 'Second' });
    const cookie2 = toCookieHeader(created.headers['set-cookie']);

    const sw = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/switch`)
      .set('Cookie', cookie2);
    expect(sw.status).toBe(200);

    const cookieBack = toCookieHeader(sw.headers['set-cookie']);
    const my = await api().get('/api/nurseries/my').set('Cookie', cookieBack);
    expect(my.body.id).toBe(ctx.nurseryId);
  });

  it('switch на чужой питомник → 404', async () => {
    const a = await createOwnerWithNursery();
    const b = await createOwnerWithNursery();
    const res = await api()
      .post(`/api/nurseries/${b.nurseryId}/switch`)
      .set('Cookie', a.cookie);
    expect(res.status).toBe(404);
  });

  it('доступ к ресурсам неактивного своего питомника без switch → 403', async () => {
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ nursery_limit: 5 });
    const created = await api()
      .post('/api/nurseries')
      .set('Cookie', ctx.cookie)
      .send({ name: 'Second' });
    const cookie2 = toCookieHeader(created.headers['set-cookie']); // активен второй

    const res = await api()
      .get(`/api/nurseries/${ctx.nurseryId}/plants`)
      .set('Cookie', cookie2);
    expect(res.status).toBe(403);
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

describe('M3 — Лимит питомников по плану', () => {
  it('достигнут лимит питомников → 403', async () => {
    await setFreePlan({ nursery_limit: 1 });
    const ctx = await createOwnerWithNursery(); // уже 1 питомник
    const res = await api()
      .post('/api/nurseries')
      .set('Cookie', ctx.cookie)
      .send({ name: 'Second' });
    expect(res.status).toBe(403);
  });

  it('nursery_limit = null → ограничения нет', async () => {
    await setFreePlan({ nursery_limit: null });
    const ctx = await createOwnerWithNursery();
    const r2 = await api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'N2' });
    const r3 = await api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'N3' });
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);
  });

  it('лимит учитывает текущее число питомников', async () => {
    await setFreePlan({ nursery_limit: 2 });
    const ctx = await createOwnerWithNursery(); // 1
    const r2 = await api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'N2' });
    expect(r2.status).toBe(201); // 2-й в пределах лимита
    const r3 = await api()
      .post('/api/nurseries')
      .set('Cookie', toCookieHeader(r2.headers['set-cookie']))
      .send({ name: 'N3' });
    expect(r3.status).toBe(403); // 3-й сверх лимита
  });
});
