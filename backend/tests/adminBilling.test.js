import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { api, createOwnerWithNursery, db, uniqueEmail } from './helpers.js';

// Э3 — платформенный админ-API биллинга (/api/admin/*).
//
// Роутер смонтирован ВНЕ nursery-скоупа: requireAuth + requirePlatformAdmin + adminLimiter.
// Ключевое свойство requirePlatformAdmin — флаг is_platform_admin читается из БД на КАЖДЫЙ
// запрос (не из JWT), поэтому снятие флага действует немедленно по тому же токену.
//
// Rate-limit: adminLimiter (RATE_LIMIT_ADMIN_MAX, в проде ~100). В test-окружении потолок
// поднят до 1_000_000, честный 429-тест здесь не воспроизводим (см. authLimiter/activate).

const CODE_FORMAT = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

// Вставляет платный план (активный). slug уникален на каждый вызов.
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

// Owner + питомник, затем поднятие флага is_platform_admin в БД (тот же cookie/токен).
async function createPlatformAdmin(overrides = {}) {
  const ctx = await createOwnerWithNursery(overrides);
  await db('accounts').where({ id: ctx.account.id }).update({ is_platform_admin: true });
  return ctx;
}

describe('Э3 — платформенный админ-API биллинга', () => {
  describe('гард requirePlatformAdmin', () => {
    it('owner без флага → все /api/admin/* → 403', async () => {
      const ctx = await createOwnerWithNursery();
      const paid = await insertPaidPlan();

      const calls = [
        api().post('/api/admin/license-codes').set('Cookie', ctx.cookie)
          .send({ planId: paid.id, durationDays: 30 }),
        api().get('/api/admin/license-codes').set('Cookie', ctx.cookie),
        api().post(`/api/admin/license-codes/${randomUUID()}/revoke`).set('Cookie', ctx.cookie),
        api().get('/api/admin/plan-requests').set('Cookie', ctx.cookie),
        api().post(`/api/admin/plan-requests/${randomUUID()}/process`).set('Cookie', ctx.cookie),
      ];
      const results = await Promise.all(calls);
      for (const res of results) {
        expect(res.status).toBe(403);
      }
    });

    it('без токена → 401', async () => {
      const res = await api().get('/api/admin/license-codes');
      expect(res.status).toBe(401);
    });

    it('owner с флагом (обновили в БД) → работают', async () => {
      const ctx = await createPlatformAdmin();
      const res = await api().get('/api/admin/license-codes').set('Cookie', ctx.cookie);
      expect(res.status).toBe(200);
    });

    it('снятие флага действует немедленно (тот же cookie/токен)', async () => {
      const ctx = await createPlatformAdmin();

      const ok = await api().get('/api/admin/license-codes').set('Cookie', ctx.cookie);
      expect(ok.status).toBe(200);

      await db('accounts').where({ id: ctx.account.id }).update({ is_platform_admin: false });

      const denied = await api().get('/api/admin/license-codes').set('Cookie', ctx.cookie);
      expect(denied.status).toBe(403);
    });
  });

  describe('POST /api/admin/license-codes', () => {
    it('count=3 → выпускает 3 уникальных issued-кода нужного плана/срока', async () => {
      const ctx = await createPlatformAdmin();
      const paid = await insertPaidPlan();

      const res = await api()
        .post('/api/admin/license-codes')
        .set('Cookie', ctx.cookie)
        .send({ planId: paid.id, durationDays: 45, note: 'batch', count: 3 });

      expect([200, 201]).toContain(res.status);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);

      const codes = res.body.map((c) => c.code);
      expect(new Set(codes).size).toBe(3);
      for (const code of codes) {
        expect(code).toMatch(CODE_FORMAT);
      }

      const rows = await db('license_codes').where({ plan_id: paid.id });
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.status).toBe('issued');
        expect(row.plan_id).toBe(paid.id);
        expect(row.duration_days).toBe(45);
        expect(row.note).toBe('batch');
        expect(row.issued_by_account_id).toBe(ctx.account.id);
      }
    });

    it('без count → выпускает 1 код (дефолт)', async () => {
      const ctx = await createPlatformAdmin();
      const paid = await insertPaidPlan();

      const res = await api()
        .post('/api/admin/license-codes')
        .set('Cookie', ctx.cookie)
        .send({ planId: paid.id, durationDays: 30 });

      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].note).toBeNull();
    });

    it('несуществующий planId → 404', async () => {
      const ctx = await createPlatformAdmin();
      const res = await api()
        .post('/api/admin/license-codes')
        .set('Cookie', ctx.cookie)
        .send({ planId: randomUUID(), durationDays: 30 });
      expect(res.status).toBe(404);

      const rows = await db('license_codes');
      expect(rows).toHaveLength(0);
    });

    it('невалидное тело (count=0 / durationDays<=0) → 400', async () => {
      const ctx = await createPlatformAdmin();
      const paid = await insertPaidPlan();

      const bad1 = await api().post('/api/admin/license-codes').set('Cookie', ctx.cookie)
        .send({ planId: paid.id, durationDays: 30, count: 0 });
      expect(bad1.status).toBe(400);

      const bad2 = await api().post('/api/admin/license-codes').set('Cookie', ctx.cookie)
        .send({ planId: paid.id, durationDays: -5 });
      expect(bad2.status).toBe(400);
    });
  });

  describe('GET /api/admin/license-codes', () => {
    it('пагинация (page/perPage/total) + фильтр по status', async () => {
      const ctx = await createPlatformAdmin();
      const paid = await insertPaidPlan();

      // 5 issued кодов.
      for (let i = 0; i < 5; i += 1) {
        await db('license_codes').insert({
          code: `ISSU-000${i}-JKLM`,
          plan_id: paid.id,
          duration_days: 30,
          status: 'issued',
        });
      }
      // 2 revoked кода.
      for (let i = 0; i < 2; i += 1) {
        await db('license_codes').insert({
          code: `REVK-000${i}-JKLM`,
          plan_id: paid.id,
          duration_days: 30,
          status: 'revoked',
        });
      }

      const page1 = await api()
        .get('/api/admin/license-codes?page=1&perPage=3')
        .set('Cookie', ctx.cookie);
      expect(page1.status).toBe(200);
      expect(page1.body.total).toBe(7);
      expect(page1.body.page).toBe(1);
      expect(page1.body.perPage).toBe(3);
      expect(page1.body.data).toHaveLength(3);

      const page3 = await api()
        .get('/api/admin/license-codes?page=3&perPage=3')
        .set('Cookie', ctx.cookie);
      expect(page3.body.data).toHaveLength(1);

      const issuedOnly = await api()
        .get('/api/admin/license-codes?status=issued')
        .set('Cookie', ctx.cookie);
      expect(issuedOnly.body.total).toBe(5);
      expect(issuedOnly.body.data.every((c) => c.status === 'issued')).toBe(true);
    });

    it('email активировавшего: у activated — email, у issued — null', async () => {
      const ctx = await createPlatformAdmin();
      const paid = await insertPaidPlan();

      // Отдельный аккаунт-активатор (свой email).
      const activator = await createOwnerWithNursery();

      await db('license_codes').insert({
        code: 'ACTV-2345-JKLM',
        plan_id: paid.id,
        duration_days: 30,
        status: 'activated',
        activated_by_account_id: activator.account.id,
        activated_at: db.fn.now(),
      });
      await db('license_codes').insert({
        code: 'ISSU-2345-JKLM',
        plan_id: paid.id,
        duration_days: 30,
        status: 'issued',
      });

      const res = await api().get('/api/admin/license-codes').set('Cookie', ctx.cookie);
      expect(res.status).toBe(200);

      const activated = res.body.data.find((c) => c.code === 'ACTV-2345-JKLM');
      const issued = res.body.data.find((c) => c.code === 'ISSU-2345-JKLM');
      expect(activated.activated_by_email).toBe(activator.email);
      expect(issued.activated_by_email).toBeNull();
    });
  });

  describe('POST /api/admin/license-codes/:id/revoke', () => {
    it('issued-код → 200 revoked', async () => {
      const ctx = await createPlatformAdmin();
      const paid = await insertPaidPlan();
      const [code] = await db('license_codes')
        .insert({ code: 'RVOK-2345-JKLM', plan_id: paid.id, duration_days: 30, status: 'issued' })
        .returning('*');

      const res = await api()
        .post(`/api/admin/license-codes/${code.id}/revoke`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('revoked');

      const row = await db('license_codes').where({ id: code.id }).first();
      expect(row.status).toBe('revoked');
    });

    it('уже activated → 409', async () => {
      const ctx = await createPlatformAdmin();
      const paid = await insertPaidPlan();
      const [code] = await db('license_codes')
        .insert({
          code: 'AACT-2345-JKLM',
          plan_id: paid.id,
          duration_days: 30,
          status: 'activated',
          activated_by_account_id: ctx.account.id,
        })
        .returning('*');

      const res = await api()
        .post(`/api/admin/license-codes/${code.id}/revoke`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(409);
    });

    it('уже revoked → 409', async () => {
      const ctx = await createPlatformAdmin();
      const paid = await insertPaidPlan();
      const [code] = await db('license_codes')
        .insert({ code: 'ARVK-2345-JKLM', plan_id: paid.id, duration_days: 30, status: 'revoked' })
        .returning('*');

      const res = await api()
        .post(`/api/admin/license-codes/${code.id}/revoke`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(409);
    });

    it('несуществующий id → 409', async () => {
      const ctx = await createPlatformAdmin();
      const res = await api()
        .post(`/api/admin/license-codes/${randomUUID()}/revoke`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/admin/plan-requests', () => {
    it('список с account_email/plan_name/plan_slug, фильтр status и пагинация', async () => {
      const ctx = await createPlatformAdmin();
      const requester = await createOwnerWithNursery();
      const paid = await insertPaidPlan({ name: 'Business', slug: 'business-x' });

      const [newReq] = await db('plan_requests')
        .insert({
          account_id: requester.account.id,
          plan_id: paid.id,
          comment: 'хочу business',
          status: 'new',
        })
        .returning('*');
      await db('plan_requests').insert({
        account_id: requester.account.id,
        plan_id: paid.id,
        status: 'processed',
        processed_at: db.fn.now(),
      });

      const all = await api().get('/api/admin/plan-requests').set('Cookie', ctx.cookie);
      expect(all.status).toBe(200);
      expect(all.body.total).toBe(2);

      const found = all.body.data.find((r) => r.id === newReq.id);
      expect(found.account_email).toBe(requester.email);
      expect(found.plan_name).toBe('Business');
      expect(found.plan_slug).toBe('business-x');

      const newOnly = await api()
        .get('/api/admin/plan-requests?status=new&page=1&perPage=10')
        .set('Cookie', ctx.cookie);
      expect(newOnly.body.total).toBe(1);
      expect(newOnly.body.page).toBe(1);
      expect(newOnly.body.perPage).toBe(10);
      expect(newOnly.body.data).toHaveLength(1);
      expect(newOnly.body.data[0].status).toBe('new');
    });
  });

  describe('POST /api/admin/plan-requests/:id/process', () => {
    it('new → 200 processed', async () => {
      const ctx = await createPlatformAdmin();
      const requester = await createOwnerWithNursery();
      const paid = await insertPaidPlan();
      const [req] = await db('plan_requests')
        .insert({ account_id: requester.account.id, plan_id: paid.id, status: 'new' })
        .returning('*');

      const res = await api()
        .post(`/api/admin/plan-requests/${req.id}/process`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('processed');

      const row = await db('plan_requests').where({ id: req.id }).first();
      expect(row.status).toBe('processed');
      expect(row.processed_at).not.toBeNull();
    });

    it('повторная обработка → 409', async () => {
      const ctx = await createPlatformAdmin();
      const requester = await createOwnerWithNursery();
      const paid = await insertPaidPlan();
      const [req] = await db('plan_requests')
        .insert({ account_id: requester.account.id, plan_id: paid.id, status: 'new' })
        .returning('*');

      const first = await api()
        .post(`/api/admin/plan-requests/${req.id}/process`)
        .set('Cookie', ctx.cookie);
      expect(first.status).toBe(200);

      const second = await api()
        .post(`/api/admin/plan-requests/${req.id}/process`)
        .set('Cookie', ctx.cookie);
      expect(second.status).toBe(409);
    });

    it('несуществующий id → 409', async () => {
      const ctx = await createPlatformAdmin();
      const res = await api()
        .post(`/api/admin/plan-requests/${randomUUID()}/process`)
        .set('Cookie', ctx.cookie);
      expect(res.status).toBe(409);
    });
  });

  describe('изоляция от nursery-контекста', () => {
    it('admin-ручки работают без nurseryId в пути и не зависят от nursery-контекста', async () => {
      // Флаг ставим ПРЯМО на аккаунт, у которого нет питомника (owner без createNursery).
      const email = uniqueEmail('admin');
      await api().post('/api/auth/register').send({ email, password: 'Passw0rd!23', name: 'Adm' });
      const account = await db('accounts').where({ email }).first();
      await db('accounts').where({ id: account.id }).update({ is_platform_admin: true });

      const login = await api().post('/api/auth/login').send({ email, password: 'Passw0rd!23' });
      const cookie = (login.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');

      // login отдаёт is_platform_admin на фронт.
      expect(login.body.user.is_platform_admin).toBe(true);

      const paid = await insertPaidPlan();
      const issue = await api()
        .post('/api/admin/license-codes')
        .set('Cookie', cookie)
        .send({ planId: paid.id, durationDays: 30, count: 2 });
      expect([200, 201]).toContain(issue.status);
      expect(issue.body).toHaveLength(2);

      const list = await api().get('/api/admin/license-codes').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(2);
    });
  });
});
