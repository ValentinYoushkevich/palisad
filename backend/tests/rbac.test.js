import { describe, expect, it } from 'vitest';

import { api, authCookie, createFullFixture, createOwnerWithNursery } from './helpers.js';

describe('M4 — RBAC', () => {
  it('requireRole: observer на запись → 403', async () => {
    const ctx = await createFullFixture();
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/locations`)
      .set('Cookie', ctx.observer.cookie)
      .send({ name: 'X', type: 'area' });
    expect(res.status).toBe(403);
  });

  it('requireNurseryAccess: чужой nurseryId → 403', async () => {
    const a = await createOwnerWithNursery();
    const b = await createOwnerWithNursery();
    const res = await api().get(`/api/nurseries/${b.nurseryId}/locations`).set('Cookie', a.cookie);
    expect(res.status).toBe(403);
  });

  it('без токена → 401', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api().get(`/api/nurseries/${ctx.nurseryId}/locations`);
    expect(res.status).toBe(401);
  });

  it('недействительный токен → 401', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .get(`/api/nurseries/${ctx.nurseryId}/locations`)
      .set('Cookie', 'access_token=not-a-valid-jwt');
    expect(res.status).toBe(401);
  });

  it('agronomist имеет доступ к структуре (201)', async () => {
    const ctx = await createFullFixture();
    const cookie = authCookie({
      accountId: ctx.account.id,
      userId: ctx.agronomist.user.id,
      nurseryId: ctx.nurseryId,
      role: 'agronomist',
    });
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/locations`)
      .set('Cookie', cookie)
      .send({ name: 'Agro Area', type: 'area' });
    expect(res.status).toBe(201);
  });
});
