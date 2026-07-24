import { describe, expect, it } from 'vitest';

import {
  api,
  createOwnerWithNursery,
  db,
  setFreePlan,
  uniqueEmail,
} from './helpers.js';

// T5 / B10 — гонки лимитов плана под конкуренцией.
//
// Проверяем TOCTOU: два ПАРАЛЛЕЛЬНЫХ запроса на создание при остатке ровно в 1 до
// лимита должны дать РОВНО один 201 и один 403. Без advisory-lock'а в транзакции
// (planGuards.lockAccount) оба запроса читают одинаковый count до вставок и оба
// проходят проверку — лимит пробивается. Эти тесты падают на старом коде и зелены
// после исправления.
//
// План free — общий на всю БД, но tests/setup.js в beforeEach возвращает его к
// дефолтам, поэтому правки лимита здесь не протекают в другие файлы.

function countStatuses(responses) {
  return {
    created: responses.filter((r) => r.status === 201).length,
    forbidden: responses.filter((r) => r.status === 403).length,
  };
}

describe('T5 — конкурентные лимиты плана (B10)', () => {
  it('plant_limit: два параллельных создания растения при остатке 1 → ровно один 201', async () => {
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ plant_limit: 1 });

    const responses = await Promise.all([
      api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({}),
      api().post(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', ctx.cookie).send({}),
    ]);

    expect(countStatuses(responses)).toEqual({ created: 1, forbidden: 1 });

    const count = await db('plants')
      .where({ nursery_id: ctx.nurseryId })
      .whereNull('deleted_at')
      .count('id as c')
      .then((rows) => Number(rows[0].c));
    expect(count).toBe(1);
  });

  it('nursery_limit: два параллельных создания питомника при остатке 1 → ровно один 201', async () => {
    // createOwnerWithNursery уже создал 1 питомник; поднимаем лимит до 2 → остаток 1.
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ nursery_limit: 2 });

    const responses = await Promise.all([
      api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'N-A', address: 'a' }),
      api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'N-B', address: 'b' }),
    ]);

    expect(countStatuses(responses)).toEqual({ created: 1, forbidden: 1 });

    const count = await db('nurseries')
      .where({ account_id: ctx.account.id })
      .count('id as c')
      .then((rows) => Number(rows[0].c));
    expect(count).toBe(2);
  });

  it('user_limit: два параллельных создания сотрудника при остатке 1 → ровно один 201', async () => {
    // Owner-пользователь уже есть (count=1); лимит 2 → остаток 1.
    const ctx = await createOwnerWithNursery();
    await setFreePlan({ user_limit: 2 });

    const body = (email) => ({ name: 'Staff', role: 'worker', password: 'Staff123!', email });
    const responses = await Promise.all([
      api()
        .post(`/api/nurseries/${ctx.nurseryId}/users`)
        .set('Cookie', ctx.cookie)
        .send(body(uniqueEmail('c1'))),
      api()
        .post(`/api/nurseries/${ctx.nurseryId}/users`)
        .set('Cookie', ctx.cookie)
        .send(body(uniqueEmail('c2'))),
    ]);

    expect(countStatuses(responses)).toEqual({ created: 1, forbidden: 1 });

    const count = await db('users')
      .where({ nursery_id: ctx.nurseryId })
      .count('id as c')
      .then((rows) => Number(rows[0].c));
    expect(count).toBe(2);
  });
});
