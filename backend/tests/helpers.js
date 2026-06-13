import request from 'supertest';

import app from '../app.js';
import db from '@/config/knex.js';
import { signAccess } from '@/utils/jwt.js';

export const STRONG_PASSWORD = 'Passw0rd!23';

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@palisad.test`;
}

export function api() {
  return request(app);
}

// Из массива Set-Cookie берём только пары name=value и собираем заголовок Cookie.
// (supertest.agent с sameSite=strict куки не сохраняет — поэтому передаём вручную.)
export function toCookieHeader(setCookie) {
  return (setCookie ?? []).map((c) => c.split(';')[0]).join('; ');
}

export function register(email, password, name = 'User') {
  return api().post('/api/auth/register').send({ email, password, name });
}

export async function loginCookie(email, password) {
  const res = await api().post('/api/auth/login').send({ email, password });
  return { cookie: toCookieHeader(res.headers['set-cookie']), res };
}

// Регистрирует владельца, создаёт питомник, перелогинивается (чтобы в JWT попал
// nurseryId). Возвращает cookie-заголовок и записи account/nursery/owner.
export async function createOwnerWithNursery(overrides = {}) {
  const email = overrides.email ?? uniqueEmail('owner');
  const password = overrides.password ?? STRONG_PASSWORD;

  await register(email, password, overrides.name ?? 'Owner');
  let { cookie } = await loginCookie(email, password);
  await api()
    .post('/api/nurseries')
    .set('Cookie', cookie)
    .send({ name: overrides.nurseryName ?? 'Test Nursery', address: 'Test street 1' });
  ({ cookie } = await loginCookie(email, password));

  const account = await db('accounts').where({ email }).first();
  const nursery = await db('nurseries').where({ account_id: account.id }).first();
  const owner = await db('users').where({ nursery_id: nursery.id, role: 'owner' }).first();

  return { cookie, email, password, account, nursery, owner, nurseryId: nursery.id };
}

// Cookie-заголовок для произвольной роли (staff не логинятся через API — токен
// подписываем сервером напрямую, как в scripts/acceptance-check.mjs).
export function authCookie({ accountId, userId, nurseryId, role }) {
  return `access_token=${signAccess({ accountId, userId, nurseryId, role })}`;
}

// Создаёт staff-пользователя через API (от имени owner) и возвращает { user, cookie }.
export async function createStaff(ctx, role, extra = {}) {
  const res = await api()
    .post(`/api/nurseries/${ctx.nurseryId}/users`)
    .set('Cookie', ctx.cookie)
    .send({ name: `${role} user`, role, password: 'Staff123!', email: uniqueEmail(role), ...extra });
  const user = res.body;
  const cookie = authCookie({
    accountId: ctx.account.id,
    userId: user.id,
    nurseryId: ctx.nurseryId,
    role,
  });
  return { user, cookie };
}

// Полная фикстура: владелец + три staff-роли, лимиты плана подняты.
export async function createFullFixture() {
  await setFreePlan({ user_limit: 50, plant_limit: 1000 });
  const ctx = await createOwnerWithNursery();
  ctx.agronomist = await createStaff(ctx, 'agronomist');
  ctx.worker = await createStaff(ctx, 'worker');
  ctx.observer = await createStaff(ctx, 'observer');
  return ctx;
}

export async function setFreePlan(patch) {
  await db('plans').where({ slug: 'free' }).update(patch);
}

export function systemMovementType(slug) {
  return db('movement_types').where({ slug, is_system: true }).first();
}

export function systemContainerType(code) {
  return db('container_types').where({ code, is_system: true }).first();
}

export { db };
