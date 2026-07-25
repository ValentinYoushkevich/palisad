import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  api,
  createFullFixture,
  createOwnerWithNursery,
  db,
  uniqueEmail,
} from './helpers.js';

// Э4 — owner-ручки лидов «хочу план» (/api/plan-requests).
//
// Только OWNER (requireAuth + requireRole). POST создаёт заявку с дуп-гардом на
// ОТКРЫТУЮ (status='new') заявку того же аккаунта на тот же план. GET /my — свои
// заявки со статусами и именем плана.

// Вставляет платный (активный) план; slug уникален на каждый вызов.
async function insertPaidPlan(overrides = {}) {
  const [plan] = await db('plans')
    .insert({
      name: overrides.name ?? 'Paid',
      slug: overrides.slug ?? `paid-${uniqueEmail('p').split('@')[0]}`,
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
    })
    .returning('*');
  return plan;
}

describe('Э4 — owner-ручки лидов «хочу план»', () => {
  describe('POST /api/plan-requests', () => {
    it('валидный planId → 201, строка status=new с верными полями и comment', async () => {
      const ctx = await createOwnerWithNursery();
      const paid = await insertPaidPlan();

      const res = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: paid.id, comment: 'хочу этот план' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('new');
      expect(res.body.account_id).toBe(ctx.account.id);
      expect(res.body.plan_id).toBe(paid.id);
      expect(res.body.comment).toBe('хочу этот план');

      const rows = await db('plan_requests').where({ account_id: ctx.account.id });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('new');
      expect(rows[0].plan_id).toBe(paid.id);
      expect(rows[0].comment).toBe('хочу этот план');
    });

    it('без comment → 201, comment=null', async () => {
      const ctx = await createOwnerWithNursery();
      const paid = await insertPaidPlan();

      const res = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: paid.id });

      expect(res.status).toBe(201);
      expect(res.body.comment).toBeNull();
    });

    it('дубль открытой заявки на тот же план → 409, вторая строка не создана', async () => {
      const ctx = await createOwnerWithNursery();
      const paid = await insertPaidPlan();

      const first = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: paid.id });
      expect(first.status).toBe(201);

      const second = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: paid.id });
      expect(second.status).toBe(409);

      const rows = await db('plan_requests')
        .where({ account_id: ctx.account.id, plan_id: paid.id });
      expect(rows).toHaveLength(1);
    });

    it('разные планы одним аккаунтом → обе создаются (не 409)', async () => {
      const ctx = await createOwnerWithNursery();
      const planA = await insertPaidPlan({ name: 'A', slug: `a-${uniqueEmail('p').split('@')[0]}` });
      const planB = await insertPaidPlan({ name: 'B', slug: `b-${uniqueEmail('p').split('@')[0]}` });

      const resA = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: planA.id });
      const resB = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: planB.id });

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);

      const rows = await db('plan_requests').where({ account_id: ctx.account.id });
      expect(rows).toHaveLength(2);
    });

    it('несуществующий planId → 404', async () => {
      const ctx = await createOwnerWithNursery();

      const res = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: randomUUID() });
      expect(res.status).toBe(404);

      const rows = await db('plan_requests').where({ account_id: ctx.account.id });
      expect(rows).toHaveLength(0);
    });

    it('после обработки заявки админом (processed) можно создать новую на тот же план → 201', async () => {
      const ctx = await createOwnerWithNursery();
      const paid = await insertPaidPlan();

      const first = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: paid.id });
      expect(first.status).toBe(201);

      // Обработка (как это делает админ Э3): new → processed.
      await db('plan_requests')
        .where({ id: first.body.id })
        .update({ status: 'processed', processed_at: db.fn.now() });

      const second = await api()
        .post('/api/plan-requests')
        .set('Cookie', ctx.cookie)
        .send({ planId: paid.id });
      expect(second.status).toBe(201);

      const rows = await db('plan_requests')
        .where({ account_id: ctx.account.id, plan_id: paid.id });
      expect(rows).toHaveLength(2);
    });
  });

  describe('GET /api/plan-requests/my', () => {
    it('возвращает только свои заявки (+ plan_name)', async () => {
      const paid = await insertPaidPlan({ name: 'Business' });

      const accA = await createOwnerWithNursery();
      const accB = await createOwnerWithNursery();

      // A: две заявки (на один план — вторую делаем processed, чтобы обойти дуп-гард).
      await db('plan_requests').insert({
        account_id: accA.account.id,
        plan_id: paid.id,
        status: 'processed',
        processed_at: db.fn.now(),
      });
      await db('plan_requests').insert({
        account_id: accA.account.id,
        plan_id: paid.id,
        status: 'new',
      });
      // B: одна заявка.
      await db('plan_requests').insert({
        account_id: accB.account.id,
        plan_id: paid.id,
        status: 'new',
      });

      const resA = await api().get('/api/plan-requests/my').set('Cookie', accA.cookie);
      expect(resA.status).toBe(200);
      expect(resA.body).toHaveLength(2);
      expect(resA.body.every((r) => r.account_id === accA.account.id)).toBe(true);
      expect(resA.body.every((r) => r.plan_name === 'Business')).toBe(true);

      const resB = await api().get('/api/plan-requests/my').set('Cookie', accB.cookie);
      expect(resB.status).toBe(200);
      expect(resB.body).toHaveLength(1);
      expect(resB.body[0].account_id).toBe(accB.account.id);
    });
  });

  describe('гарды доступа', () => {
    it('не-owner (worker/agronomist/observer) → POST и GET /my → 403', async () => {
      const ctx = await createFullFixture();
      const paid = await insertPaidPlan();

      const staff = [ctx.worker, ctx.agronomist, ctx.observer];
      const calls = [];
      for (const s of staff) {
        calls.push(
          api().post('/api/plan-requests').set('Cookie', s.cookie).send({ planId: paid.id })
        );
        calls.push(api().get('/api/plan-requests/my').set('Cookie', s.cookie));
      }
      const results = await Promise.all(calls);
      for (const res of results) {
        expect(res.status).toBe(403);
      }
    });

    it('без токена → 401', async () => {
      const post = await api().post('/api/plan-requests').send({ planId: randomUUID() });
      expect(post.status).toBe(401);

      const get = await api().get('/api/plan-requests/my');
      expect(get.status).toBe(401);
    });
  });
});
