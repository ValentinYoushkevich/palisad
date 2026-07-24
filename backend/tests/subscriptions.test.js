import { describe, expect, it } from 'vitest';

import { api, createOwnerWithNursery, db, uniqueEmail } from './helpers.js';

function planRow(overrides = {}) {
  return {
    name: 'Paid',
    slug: `paid-${uniqueEmail('p').split('@')[0]}`,
    plant_limit: 10000,
    user_limit: 100,
    nursery_limit: 5,
    feature_tags: true,
    feature_operations: true,
    feature_qr: true,
    feature_photos: true,
    feature_export: true,
    is_active: true,
    ...overrides,
  };
}

describe('M6 — Подписки', () => {
  it('текущая подписка с деталями плана', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api().get('/api/subscriptions/current').set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    expect(res.body.status).toBeTruthy();
    expect(res.body.plant_limit).toBeDefined();
  });

  it('список планов — только активные', async () => {
    const ctx = await createOwnerWithNursery();
    const [inactive] = await db('plans').insert(planRow({ name: 'Inactive', is_active: false })).returning('*');
    const res = await api().get('/api/subscriptions/plans').set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
    const plans = res.body.items ?? res.body;
    expect(plans.some((p) => p.id === inactive.id)).toBe(false);
  });

  // B12: смена тарифа отключена (self-service апгрейд без оплаты недопустим, биллинга нет).
  // Эндпоинт остаётся смонтированным, но всегда 403 и без побочных эффектов.
  it('смена тарифа недоступна → 403, старая подписка не тронута', async () => {
    const ctx = await createOwnerWithNursery();
    const oldSub = await db('subscriptions').where({ account_id: ctx.account.id }).first();
    const [paid] = await db('plans').insert(planRow()).returning('*');
    const res = await api()
      .post('/api/subscriptions/change')
      .set('Cookie', ctx.cookie)
      .send({ planId: paid.id });
    expect(res.status).toBe(403);
    const previous = await db('subscriptions').where({ id: oldSub.id }).first();
    // подписка НЕ отменена: смена плана не выполняется вовсе.
    expect(previous.status).toBe(oldSub.status);
  });

  // Даже валидный, но неизвестный planId → 403 (гард B12 срабатывает до поиска плана).
  it('смена тарифа: любой planId → 403', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api()
      .post('/api/subscriptions/change')
      .set('Cookie', ctx.cookie)
      .send({ planId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(403);
  });

  it('GET /api/plans (alias) → 200', async () => {
    const ctx = await createOwnerWithNursery();
    const res = await api().get('/api/plans').set('Cookie', ctx.cookie);
    expect(res.status).toBe(200);
  });

  it('подписка без токена → 401', async () => {
    const res = await api().get('/api/subscriptions/current');
    expect(res.status).toBe(401);
  });
});
