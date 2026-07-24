import { describe, expect, it } from 'vitest';

import {
  api,
  createOwnerWithNursery,
  db,
  loginCookie,
  loginStaff,
  setFreePlan,
  uniqueEmail,
} from './helpers.js';

// B11 — полноценный staff-логин через POST /api/auth/login и оживший RBAC.
// В отличие от rbac.test.js (там cookie подписывается напрямую через authCookie),
// здесь сотрудники ЛОГИНЯТСЯ по-настоящему — email/пароль → JWT с реальной ролью.

const TEMP_PASSWORD = 'Staff123!';
const NEW_PASSWORD = 'NewStaff!99';

// Создаёт сотрудника через staff-API (от имени owner) с известными email/паролем,
// чтобы тест мог залогиниться настоящим логином.
async function createStaffLogin(ctx, role, overrides = {}) {
  const email = overrides.email ?? uniqueEmail(role);
  const password = overrides.password ?? TEMP_PASSWORD;
  const res = await api()
    .post(`/api/nurseries/${ctx.nurseryId}/users`)
    .set('Cookie', ctx.cookie)
    .send({ name: `${role} user`, role, email, password });
  return { user: res.body, email, password };
}

describe('B11 — staff-логин и RBAC', () => {
  it('сотрудник логинится и получает свою реальную роль', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'agronomist');

    const { res } = await loginStaff({ email: staff.email, password: staff.password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('agronomist');
    expect(res.body.user.email).toBe(staff.email);
    expect(res.body.user.nursery_id).toBe(ctx.nurseryId);
    // Свежесозданный сотрудник обязан сменить временный пароль.
    expect(res.body.mustChangePassword).toBe(true);
  });

  it('неверный пароль сотрудника → 401', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'worker');

    const { res } = await loginStaff({ email: staff.email, password: 'WrongPass9!' });
    expect(res.status).toBe(401);
  });

  it('неактивный сотрудник → 401 (тем же сообщением, существование не палится)', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'worker');

    await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/users/${staff.user.id}/status`)
      .set('Cookie', ctx.cookie);

    const { res } = await loginStaff({ email: staff.email, password: staff.password });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Неверный email или пароль');
  });

  it('сотрудник с must_change_password меняет временный пароль и логинится заново', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'agronomist');

    const first = await loginStaff({ email: staff.email, password: staff.password });
    expect(first.res.status).toBe(200);
    expect(first.res.body.mustChangePassword).toBe(true);

    const change = await api()
      .post('/api/auth/change-password')
      .set('Cookie', first.cookie)
      .send({ currentPassword: staff.password, newPassword: NEW_PASSWORD });
    expect(change.status).toBe(200);

    // Старый временный пароль больше не подходит.
    const oldLogin = await loginStaff({ email: staff.email, password: staff.password });
    expect(oldLogin.res.status).toBe(401);

    // Новый пароль работает, флаг снят у ИМЕННО этого сотрудника.
    const relogin = await loginStaff({ email: staff.email, password: NEW_PASSWORD });
    expect(relogin.res.status).toBe(200);
    expect(relogin.res.body.mustChangePassword).toBe(false);
    const dbUser = await db('users').where({ id: staff.user.id }).first();
    expect(dbUser.must_change_password).toBe(false);

    // Пароль владельца не задет сменой пароля сотрудника (различение принципала).
    const ownerRelogin = await loginCookie(ctx.email, ctx.password);
    expect(ownerRelogin.res.status).toBe(200);
    expect(ownerRelogin.res.body.user.role).toBe('owner');
  });

  it('смена пароля сотрудником с неверным текущим паролем → 400', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'observer');
    const login = await loginStaff({ email: staff.email, password: staff.password });

    const res = await api()
      .post('/api/auth/change-password')
      .set('Cookie', login.cookie)
      .send({ currentPassword: 'TotallyWrong9!', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('смена пароля деактивированным сотрудником → 404', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'agronomist');
    const login = await loginStaff({ email: staff.email, password: staff.password });

    await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/users/${staff.user.id}/status`)
      .set('Cookie', ctx.cookie);

    const res = await api()
      .post('/api/auth/change-password')
      .set('Cookie', login.cookie)
      .send({ currentPassword: staff.password, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(404);
  });

  it('ролевой гейт: observer на запись → 403, agronomist → 201 (реальные логины)', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const observer = await createStaffLogin(ctx, 'observer');
    const agronomist = await createStaffLogin(ctx, 'agronomist');

    const observerLogin = await loginStaff({ email: observer.email, password: observer.password });
    const denied = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/locations`)
      .set('Cookie', observerLogin.cookie)
      .send({ name: 'Denied Area', type: 'area' });
    expect(denied.status).toBe(403);

    const agroLogin = await loginStaff({ email: agronomist.email, password: agronomist.password });
    const allowed = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/locations`)
      .set('Cookie', agroLogin.cookie)
      .send({ name: 'Allowed Area', type: 'area' });
    expect(allowed.status).toBe(201);
  });

  it('сотрудник видит только свой питомник; чужой питомник того же аккаунта → 403', async () => {
    await setFreePlan({ user_limit: 10, nursery_limit: 5 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'agronomist');

    // Второй питомник того же владельца.
    await api()
      .post('/api/nurseries')
      .set('Cookie', ctx.cookie)
      .send({ name: 'Second Nursery', address: 'Second street 2' });
    const second = await db('nurseries')
      .where({ account_id: ctx.account.id })
      .whereNot({ id: ctx.nurseryId })
      .first();

    const staffLogin = await loginStaff({ email: staff.email, password: staff.password });

    const own = await api()
      .get(`/api/nurseries/${ctx.nurseryId}/locations`)
      .set('Cookie', staffLogin.cookie);
    expect(own.status).toBe(200);

    const foreign = await api()
      .get(`/api/nurseries/${second.id}/locations`)
      .set('Cookie', staffLogin.cookie);
    expect(foreign.status).toBe(403);
  });

  it('refresh сотрудника сохраняет staff-контекст (роль/nursery), а не owner', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'worker');
    const login = await loginStaff({ email: staff.email, password: staff.password });

    const refreshed = await api().post('/api/auth/refresh').set('Cookie', login.cookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.role).toBe('worker');
    expect(refreshed.body.user.nursery_id).toBe(ctx.nurseryId);
    expect(refreshed.body.mustChangePassword).toBe(true);
  });

  it('деактивированный сотрудник не продлит сессию через refresh → 401', async () => {
    await setFreePlan({ user_limit: 10 });
    const ctx = await createOwnerWithNursery();
    const staff = await createStaffLogin(ctx, 'worker');
    const login = await loginStaff({ email: staff.email, password: staff.password });

    await api()
      .patch(`/api/nurseries/${ctx.nurseryId}/users/${staff.user.id}/status`)
      .set('Cookie', ctx.cookie);

    const refreshed = await api().post('/api/auth/refresh').set('Cookie', login.cookie);
    expect(refreshed.status).toBe(401);
  });

  it('owner-логин не сломан', async () => {
    const ctx = await createOwnerWithNursery();
    const { res } = await loginCookie(ctx.email, ctx.password);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('owner');
    expect(res.body.user.email).toBe(ctx.email);
  });
});
