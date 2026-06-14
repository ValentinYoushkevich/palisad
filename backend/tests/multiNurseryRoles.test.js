import { describe, expect, it } from 'vitest';

import {
  api, createOwnerWithNursery, createStaff, db, setFreePlan, toCookieHeader,
} from './helpers.js';

describe('MultiNursery — изоляция ролей per-nursery', () => {
  it('сотрудник питомника A отсутствует в питомнике B', async () => {
    await setFreePlan({ nursery_limit: 5, user_limit: 50 });
    const ctx = await createOwnerWithNursery(); // активен питомник A (ctx.nurseryId)

    // сотрудник в A
    const { user: agroA } = await createStaff(ctx, 'agronomist');

    // создаём питомник B (становится активным), запоминаем его cookie/id
    const createB = await api()
      .post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'Nursery B' });
    const cookieB = toCookieHeader(createB.headers['set-cookie']);
    const nurseryB = createB.body;

    // список сотрудников B не содержит agroA
    const usersB = await api()
      .get(`/api/nurseries/${nurseryB.id}/users`).set('Cookie', cookieB);
    expect(usersB.status).toBe(200);
    expect(usersB.body.some((u) => u.id === agroA.id)).toBe(false);

    // владелец — owner в обоих питомниках (отдельные ряды users)
    const ownersA = await db('users').where({ nursery_id: ctx.nurseryId, role: 'owner' });
    const ownersB = await db('users').where({ nursery_id: nurseryB.id, role: 'owner' });
    expect(ownersA.length).toBe(1);
    expect(ownersB.length).toBe(1);
    expect(ownersA[0].id).not.toBe(ownersB[0].id);
  });
});
