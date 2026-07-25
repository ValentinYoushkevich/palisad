import { describe, expect, it } from 'vitest';

import {
  api,
  authCookie,
  createOwnerWithNursery,
  db,
  uniqueEmail,
} from './helpers.js';

// Э2 — активация лицензионного кода (POST /api/subscriptions/activate-code).
//
// Самый ответственный путь биллинга: безопасность (единый 404 без оракула о причине),
// гонки (атомарный UPDATE issued→activated + advisory-lock на аккаунт), стакание/смена
// плана в одной транзакции.
//
// Rate-limit: на роут навешен activateCodeLimiter (RATE_LIMIT_ACTIVATE_MAX, в проде ~10).
// В тест-окружении потолок поднят до 1_000_000, поэтому честный 429-тест здесь невозможен
// без хрупкой манипуляции env на уровне загрузки модуля — не воспроизводим его в сьюте,
// лимитер проверяется вручную/в проде (см. authLimiter, тот же образец).

const ACTIVATION_ERROR = 'Код недействителен или уже использован';
const DAY_MS = 24 * 60 * 60 * 1000;

// Вставляет платный план (по умолчанию активный). slug уникален на каждый вызов.
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

async function insertCode({ code, planId, durationDays = 30, status = 'issued' }) {
  const [row] = await db('license_codes')
    .insert({ code, plan_id: planId, duration_days: durationDays, status })
    .returning('*');
  return row;
}

// Приводит аккаунт к одной активной подписке нужного плана (гасит trial/free/прочее).
// expiresInDays === null → бессрочная (expires_at NULL, как у free).
async function setActiveSubscription(accountId, planId, expiresInDays) {
  await db('subscriptions')
    .where({ account_id: accountId })
    .whereIn('status', ['trial', 'active'])
    .update({ status: 'cancelled', cancelled_at: db.fn.now() });
  const [sub] = await db('subscriptions')
    .insert({
      account_id: accountId,
      plan_id: planId,
      status: 'active',
      expires_at:
        expiresInDays === null
          ? null
          : db.raw("now() + (? * interval '1 day')", [expiresInDays]),
    })
    .returning('*');
  return sub;
}

function daysFromNow(expiresAt) {
  return (new Date(expiresAt).getTime() - Date.now()) / DAY_MS;
}

async function activeSubs(accountId) {
  return db('subscriptions')
    .where({ account_id: accountId })
    .whereIn('status', ['trial', 'active']);
}

describe('Э2 — активация лицензионного кода', () => {
  it('1. валидный код → 200, активная подписка нужного плана, expires_at ≈ now()+duration', async () => {
    const ctx = await createOwnerWithNursery();
    const paid = await insertPaidPlan();
    await insertCode({ code: 'ABCD-EFGH-JKLM', planId: paid.id, durationDays: 30 });

    const res = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'ABCD-EFGH-JKLM' });

    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe(paid.id);
    expect(res.body.status).toBe('active');
    expect(res.body.expires_at).not.toBeNull();
    // ≈ через 30 дней (дельта на исполнение теста/таймзону).
    expect(daysFromNow(res.body.expires_at)).toBeGreaterThan(29.9);
    expect(daysFromNow(res.body.expires_at)).toBeLessThan(30.1);

    const active = await activeSubs(ctx.account.id);
    expect(active).toHaveLength(1);
    expect(active[0].plan_id).toBe(paid.id);
  });

  it('2. нормализация: нижний регистр + пробелы вместо дефисов активируют тот же код', async () => {
    const ctx = await createOwnerWithNursery();
    const paid = await insertPaidPlan();
    await insertCode({ code: 'ABCD-EFGH-JKLM', planId: paid.id, durationDays: 15 });

    const res = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: '  abcd efgh jklm  ' });

    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe(paid.id);
    const code = await db('license_codes').where({ code: 'ABCD-EFGH-JKLM' }).first();
    expect(code.status).toBe('activated');
    expect(code.activated_by_account_id).toBe(ctx.account.id);
  });

  it('3. несуществующий код → 404; повторная активация того же кода → 404 с ТЕМ ЖЕ текстом (без оракула)', async () => {
    const ctx = await createOwnerWithNursery();
    const paid = await insertPaidPlan();
    await insertCode({ code: 'ABCD-EFGH-JKLM', planId: paid.id });

    const missing = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'ZZZZ-ZZZZ-ZZZZ' });
    expect(missing.status).toBe(404);

    const first = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'ABCD-EFGH-JKLM' });
    expect(first.status).toBe(200);

    const second = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'ABCD-EFGH-JKLM' });
    expect(second.status).toBe(404);

    // «нет кода» и «уже активирован» неразличимы — один и тот же текст.
    expect(missing.body.error).toBe(ACTIVATION_ERROR);
    expect(second.body.error).toBe(ACTIVATION_ERROR);
    expect(missing.body.error).toBe(second.body.error);
  });

  it('4. гонка: два параллельных запроса одним кодом → ровно один 200 и один 404; код активирован один раз, expires_at не удвоен', async () => {
    const ctx = await createOwnerWithNursery();
    const paid = await insertPaidPlan();
    await insertCode({ code: 'RACE-2345-JKLM', planId: paid.id, durationDays: 30 });

    const [a, b] = await Promise.all([
      api()
        .post('/api/subscriptions/activate-code')
        .set('Cookie', ctx.cookie)
        .send({ code: 'RACE-2345-JKLM' }),
      api()
        .post('/api/subscriptions/activate-code')
        .set('Cookie', ctx.cookie)
        .send({ code: 'RACE-2345-JKLM' }),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 404]);

    // Код активирован РОВНО один раз.
    const codes = await db('license_codes').where({ code: 'RACE-2345-JKLM' });
    expect(codes).toHaveLength(1);
    expect(codes[0].status).toBe('activated');

    // Подписка получила duration один раз (не удвоено): ровно одна active, ≈ now()+30д.
    const active = await activeSubs(ctx.account.id);
    expect(active).toHaveLength(1);
    expect(active[0].plan_id).toBe(paid.id);
    expect(daysFromNow(active[0].expires_at)).toBeGreaterThan(29.9);
    expect(daysFromNow(active[0].expires_at)).toBeLessThan(30.1);
  });

  it('5. стакание того же плана: expires_at увеличивается ровно на duration_days', async () => {
    const ctx = await createOwnerWithNursery();
    const paid = await insertPaidPlan();
    const before = await setActiveSubscription(ctx.account.id, paid.id, 10);
    await insertCode({ code: 'STAK-2345-JKLM', planId: paid.id, durationDays: 30 });

    const res = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'STAK-2345-JKLM' });
    expect(res.status).toBe(200);
    // та же подписка продлена (id не изменился).
    expect(res.body.id).toBe(before.id);

    const after = await db('subscriptions').where({ id: before.id }).first();
    const addedDays =
      (new Date(after.expires_at).getTime() - new Date(before.expires_at).getTime()) / DAY_MS;
    expect(addedDays).toBeGreaterThan(29.95);
    expect(addedDays).toBeLessThan(30.05);

    // по-прежнему ровно одна активная подписка.
    const active = await activeSubs(ctx.account.id);
    expect(active).toHaveLength(1);
  });

  it('6. смена плана: активный план A → код плана B → A cancelled, новая active B ≈ now()+duration', async () => {
    const ctx = await createOwnerWithNursery();
    const planA = await insertPaidPlan({ name: 'A' });
    const planB = await insertPaidPlan({ name: 'B' });
    const subA = await setActiveSubscription(ctx.account.id, planA.id, 20);
    await insertCode({ code: 'PLAN-BCDE-2345', planId: planB.id, durationDays: 30 });

    const res = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'PLAN-BCDE-2345' });
    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe(planB.id);
    expect(daysFromNow(res.body.expires_at)).toBeGreaterThan(29.9);

    const old = await db('subscriptions').where({ id: subA.id }).first();
    expect(old.status).toBe('cancelled');

    const active = await activeSubs(ctx.account.id);
    expect(active).toHaveLength(1);
    expect(active[0].plan_id).toBe(planB.id);
  });

  it('7. активация на trial (свежий аккаунт): trial cancelled, новая active платного плана', async () => {
    const ctx = await createOwnerWithNursery();
    // свежий аккаунт зарегистрирован с trial-подпиской.
    const trial = await db('subscriptions')
      .where({ account_id: ctx.account.id, status: 'trial' })
      .first();
    expect(trial).toBeTruthy();

    const paid = await insertPaidPlan();
    await insertCode({ code: 'TRAL-2345-JKLM', planId: paid.id, durationDays: 30 });

    const res = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'TRAL-2345-JKLM' });
    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe(paid.id);

    const trialAfter = await db('subscriptions').where({ id: trial.id }).first();
    expect(trialAfter.status).toBe('cancelled');

    const active = await activeSubs(ctx.account.id);
    expect(active).toHaveLength(1);
    expect(active[0].plan_id).toBe(paid.id);
  });

  it('8. активация на free (бессрочная active): free cancelled, новая active платного плана', async () => {
    const ctx = await createOwnerWithNursery();
    const freePlan = await db('plans').where({ slug: 'free' }).first();
    const free = await setActiveSubscription(ctx.account.id, freePlan.id, null);
    expect(free.expires_at).toBeNull();

    const paid = await insertPaidPlan();
    await insertCode({ code: 'FREE-2345-JKLM', planId: paid.id, durationDays: 30 });

    const res = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'FREE-2345-JKLM' });
    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe(paid.id);
    expect(res.body.expires_at).not.toBeNull();

    const freeAfter = await db('subscriptions').where({ id: free.id }).first();
    expect(freeAfter.status).toBe('cancelled');

    const active = await activeSubs(ctx.account.id);
    expect(active).toHaveLength(1);
    expect(active[0].plan_id).toBe(paid.id);
  });

  it('9a. revoked-код → 404', async () => {
    const ctx = await createOwnerWithNursery();
    const paid = await insertPaidPlan();
    await insertCode({ code: 'REVK-2345-JKLM', planId: paid.id, status: 'revoked' });

    const res = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'REVK-2345-JKLM' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe(ACTIVATION_ERROR);
  });

  it('9b. код неактивного плана → 404, транзакция откатилась, код остался issued', async () => {
    const ctx = await createOwnerWithNursery();
    const inactivePlan = await insertPaidPlan({ name: 'Inactive', is_active: false });
    await insertCode({ code: 'NACT-2345-JKLM', planId: inactivePlan.id });

    const res = await api()
      .post('/api/subscriptions/activate-code')
      .set('Cookie', ctx.cookie)
      .send({ code: 'NACT-2345-JKLM' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe(ACTIVATION_ERROR);

    // rollback: код НЕ сгорел, вернулся в issued.
    const code = await db('license_codes').where({ code: 'NACT-2345-JKLM' }).first();
    expect(code.status).toBe('issued');
    expect(code.activated_by_account_id).toBeNull();
  });

  it('10. не-owner (worker/agronomist/observer) → 403', async () => {
    const ctx = await createOwnerWithNursery();
    const paid = await insertPaidPlan();
    await insertCode({ code: 'RLES-2345-JKLM', planId: paid.id });

    for (const role of ['worker', 'agronomist', 'observer']) {
      // JWT с нужной ролью на существующем активном пользователе (requireAuth проходит,
      // requireRole(OWNER) отклоняет). Код валиден — важно, что 403 до бизнес-логики.
      const cookie = authCookie({
        accountId: ctx.account.id,
        userId: ctx.owner.id,
        nurseryId: ctx.nurseryId,
        role,
      });
      const res = await api()
        .post('/api/subscriptions/activate-code')
        .set('Cookie', cookie)
        .send({ code: 'RLES-2345-JKLM' });
      expect(res.status).toBe(403);
    }

    // код не тронут (роль отклонена до активации).
    const code = await db('license_codes').where({ code: 'RLES-2345-JKLM' }).first();
    expect(code.status).toBe('issued');
  });

  it('11. без токена → 401', async () => {
    const res = await api()
      .post('/api/subscriptions/activate-code')
      .send({ code: 'ABCD-EFGH-JKLM' });
    expect(res.status).toBe(401);
  });
});
