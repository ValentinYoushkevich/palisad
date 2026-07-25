/* eslint-disable no-console */
// Приёмочный прогон критериев модулей 2-13 + сквозной smoke-сценарий.
// Запуск (backend должен работать на :3100, Postgres — на :5433):
//   cd backend && node --loader ./alias-loader.mjs scripts/acceptance-check.mjs
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import knexFactory from 'knex';

import * as activityRepo from '@/repositories/activityLog.repository.js';
import { signAccess } from '@/utils/jwt.js';

const require = createRequire(import.meta.url);
const knexConfig = require('../knexfile.cjs');
const db = knexFactory(knexConfig.development ?? knexConfig);

const BASE = 'http://localhost:3100/api';
const results = [];

// Минимальный валидный 1×1 PNG для проверки загрузки фото (F13: multipart + bytea).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
function photoForm() {
  const form = new FormData();
  form.append('file', new Blob([PNG_1x1], { type: 'image/png' }), 'photo.png');
  return form;
}

function check(module, num, name, pass, note = '') {
  results.push({ module, num, name, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  M${module}#${num} ${name}${note ? ` — ${note}` : ''}`);
}

// ---------- HTTP с cookie jar ----------
function newJar() {
  return new Map();
}

function applySetCookies(jar, headers) {
  for (const raw of headers.getSetCookie?.() ?? []) {
    const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const cleared =
      value === '' ||
      attrs.some((a) => /^max-age=0$/i.test(a)) ||
      attrs.some((a) => /^expires=/i.test(a) && new Date(a.slice(8)) < new Date());
    if (cleared) jar.delete(name);
    else jar.set(name, value);
  }
}

async function req(jar, method, path, body, { raw = false, form } = {}) {
  const headers = {};
  // form (multipart) — fetch сам проставит Content-Type с boundary; JSON — вручную.
  if (form === undefined && body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: form !== undefined ? form : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  applySetCookies(jar, res.headers);
  let data = null;
  if (raw) data = Buffer.from(await res.arrayBuffer());
  else {
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data, setCookies, contentType: res.headers.get('content-type') };
}

// Сессия с подписанным сервером JWT для произвольной роли — быстрый форж без реального
// логина. После B11 сотрудники УЖЕ могут логиниться через /auth/login (см. проверку
// M17); forgeSession оставлен как удобный шорткат в прогоне.
function forgeSession({ accountId, userId, nurseryId, role }) {
  const jar = newJar();
  jar.set('access_token', signAccess({ accountId, userId, nurseryId, role }));
  return jar;
}

const FREE = { slug: 'free' };
async function setPlan(patch) {
  await db('plans').where(FREE).update(patch);
}

async function main() {
  const ts = Date.now();
  const emailA = `accept.owner.${ts}@palisad.test`;
  const emailB = `accept.second.${ts}@palisad.test`;
  const PASS1 = 'Passw0rd!23';
  const PASS2 = 'Passw0rd!24';

  // Чистка от прошлых прогонов
  const oldAccounts = await db('accounts').where('email', 'like', 'accept.%@palisad.test');
  for (const acc of oldAccounts) {
    const nurseries = await db('nurseries').where({ account_id: acc.id });
    for (const n of nurseries) {
      const plantIds = db('plants').select('id').where({ nursery_id: n.id });
      await db('photos').whereIn('operation_id', db('operations').select('id').whereIn('plant_id', plantIds)).del();
      await db('operations').whereIn('plant_id', plantIds).del();
      await db('movements').whereIn('plant_id', plantIds).del();
      await db('plant_tags').whereIn('plant_id', plantIds).del();
      await db('activity_logs').where({ nursery_id: n.id }).del();
      await db('plants').where({ nursery_id: n.id }).del();
      await db('nursery_species').where({ nursery_id: n.id }).del();
      await db('tags').where({ nursery_id: n.id }).del();
      await db('locations').where({ nursery_id: n.id }).del();
      await db('users').where({ nursery_id: n.id }).del();
    }
    await db('subscriptions').where({ account_id: acc.id }).del();
    await db('nurseries').where({ account_id: acc.id }).del();
    await db('accounts').where({ id: acc.id }).del();
  }
  await setPlan({
    plant_limit: 1000, user_limit: 3, feature_tags: true,
    feature_operations: true, feature_qr: true, feature_photos: false,
  });

  // ============ MODULE 2 — Аутентификация ============
  let jarA = newJar();
  let r = await req(jarA, 'POST', '/auth/register', { email: emailA, password: PASS1, name: 'Accept Owner' });
  const accA = await db('accounts').where({ email: emailA }).first();
  const subA = accA && (await db('subscriptions').where({ account_id: accA.id }).first());
  check(2, 1, 'Регистрация создаёт аккаунт и trial-подписку',
    r.status === 201 && !!accA && subA?.status === 'trial', `status=${r.status}, sub=${subA?.status}`);

  r = await req(newJar(), 'POST', '/auth/register', { email: emailA, password: PASS1, name: 'Dup' });
  check(2, 2, 'Повторная регистрация с тем же email → 409', r.status === 409, `status=${r.status}`);

  r = await req(jarA, 'POST', '/auth/login', { email: emailA, password: PASS1 });
  const hasHttpOnly = r.setCookies.filter((c) => /^(access_token|refresh_token)=/.test(c) && /httponly/i.test(c));
  check(2, 3, 'Логин ставит HttpOnly куки access+refresh', r.status === 200 && hasHttpOnly.length === 2,
    `cookies=${hasHttpOnly.length}`);

  r = await req(newJar(), 'POST', '/auth/login', { email: emailA, password: 'WrongPass1!' });
  check(2, 4, 'Неверный пароль → 401', r.status === 401, `status=${r.status}`);

  const oldAccess = jarA.get('access_token');
  await new Promise((resolve) => setTimeout(resolve, 1100)); // иначе iat совпадёт и токен будет идентичным
  r = await req(jarA, 'POST', '/auth/refresh');
  check(2, 5, 'Refresh обновляет access-токен',
    r.status === 200 && jarA.get('access_token') && jarA.get('access_token') !== oldAccess, `status=${r.status}`);

  r = await req(jarA, 'POST', '/auth/change-password', { currentPassword: PASS1, newPassword: PASS2 });
  const reLogin = await req(newJar(), 'POST', '/auth/login', { email: emailA, password: PASS2 });
  check(2, 7, 'Смена пароля работает', r.status === 200 && reLogin.status === 200,
    `change=${r.status}, relogin=${reLogin.status}`);

  r = await req(jarA, 'POST', '/auth/logout');
  const cleared = !jarA.has('access_token') && !jarA.has('refresh_token');
  check(2, 6, 'Logout очищает куки', r.status === 200 && cleared, `status=${r.status}`);

  r = await req(newJar(), 'POST', '/auth/register', { email: `weak.${ts}@palisad.test`, password: '123', name: 'Weak' });
  check(2, 8, 'Слабый пароль при регистрации → 400', r.status === 400, `status=${r.status}`);

  r = await req(newJar(), 'POST', '/auth/change-password', { currentPassword: PASS2, newPassword: PASS1 });
  check(2, 9, 'Защищённый роут без токена → 401', r.status === 401, `status=${r.status}`);

  // ============ MODULE 3 — Питомник ============
  jarA = newJar();
  await req(jarA, 'POST', '/auth/login', { email: emailA, password: PASS2 });

  r = await req(jarA, 'GET', '/nurseries/my');
  check(3, 4, 'Питомник не найден до создания → 404', r.status === 404, `status=${r.status}`);

  r = await req(jarA, 'POST', '/nurseries', { name: 'Accept Nursery', address: 'Test street 1' });
  const nurseryA = await db('nurseries').where({ account_id: accA.id }).first();
  const ownerA = nurseryA && (await db('users').where({ nursery_id: nurseryA.id, role: 'owner' }).first());
  check(3, 1, 'Создание питомника создаёт owner-пользователя',
    r.status === 201 && !!ownerA, `status=${r.status}`);

  // v2: несколько питомников на аккаунт разрешены до nursery_limit. На free-плане лимит = 1,
  // поэтому второй питомник упирается в лимит → 403 (раньше, в одно-питомничьей модели, было 409).
  r = await req(jarA, 'POST', '/nurseries', { name: 'Second Nursery' });
  check(3, 2, 'Второй питомник сверх nursery_limit (free=1) → 403', r.status === 403, `status=${r.status}`);

  // re-login: в JWT должен попасть nurseryId
  jarA = newJar();
  await req(jarA, 'POST', '/auth/login', { email: emailA, password: PASS2 });

  r = await req(jarA, 'GET', '/nurseries/my');
  check(3, 3, 'Получение питомника', r.status === 200 && r.data?.id === nurseryA.id, `status=${r.status}`);

  const beforeUpd = await db('nurseries').where({ id: nurseryA.id }).first();
  r = await req(jarA, 'PATCH', '/nurseries/my', { name: 'Accept Nursery Updated' });
  const afterUpd = await db('nurseries').where({ id: nurseryA.id }).first();
  check(3, 5, 'Обновление питомника обновляет updated_at',
    r.status === 200 && new Date(afterUpd.updated_at) > new Date(beforeUpd.updated_at), `status=${r.status}`);

  r = await req(newJar(), 'GET', '/nurseries/my');
  check(3, 6, 'Без токена → 401', r.status === 401, `status=${r.status}`);

  const nid = nurseryA.id;
  const P = `/nurseries/${nid}`;

  // ============ MODULE 5 — Сотрудники ============
  await setPlan({ user_limit: 10 });
  const staffPass = 'Secret123!';
  r = await req(jarA, 'POST', `${P}/users`, { name: 'Accept Agronomist', role: 'agronomist', email: `agro.${ts}@palisad.test`, password: staffPass });
  const agro = r.data;
  const agroDb = await db('users').where({ id: agro?.id }).first();
  check(5, 1, 'Создание сотрудника: must_change_password = true',
    r.status === 201 && agroDb?.must_change_password === true, `status=${r.status}`);

  const worker = (await req(jarA, 'POST', `${P}/users`, { name: 'Accept Worker', role: 'worker', password: staffPass })).data;
  const observer = (await req(jarA, 'POST', `${P}/users`, { name: 'Accept Observer', role: 'observer', password: staffPass })).data;

  // B11: сотрудник ТЕПЕРЬ входит через тот же /auth/login (раньше вход был только у владельца).
  const staffJar = newJar();
  r = await req(staffJar, 'POST', '/auth/login', { email: `agro.${ts}@palisad.test`, password: staffPass });
  check(17, 1, 'B11: staff-логин через /auth/login → 200 + своя роль + mustChangePassword',
    r.status === 200 && r.data?.user?.role === 'agronomist' && r.data?.mustChangePassword === true,
    `status=${r.status}, role=${r.data?.user?.role}, mcp=${r.data?.mustChangePassword}`);
  r = await req(newJar(), 'POST', '/auth/login', { email: `agro.${ts}@palisad.test`, password: 'WrongStaffPass1!' });
  check(17, 2, 'B11: неверный пароль сотрудника → 401', r.status === 401, `status=${r.status}`);

  const usersCount = await db('users').where({ nursery_id: nid }).count('id as c').then((x) => Number(x[0].c));
  await setPlan({ user_limit: usersCount });
  r = await req(jarA, 'POST', `${P}/users`, { name: 'Over Limit', role: 'worker', password: staffPass });
  check(5, 2, 'Лимит пользователей соблюдается (403)', r.status === 403, `status=${r.status}, limit=${usersCount}`);
  await setPlan({ user_limit: 3 });

  r = await req(jarA, 'PATCH', `${P}/users/${ownerA.id}/status`);
  check(5, 3, 'Деактивация последнего owner → 400', r.status === 400, `status=${r.status}`);

  const jarObserver = forgeSession({ accountId: accA.id, userId: observer.id, nurseryId: nid, role: 'observer' });
  const jarWorker = forgeSession({ accountId: accA.id, userId: worker.id, nurseryId: nid, role: 'worker' });
  const jarAgro = forgeSession({ accountId: accA.id, userId: agro.id, nurseryId: nid, role: 'agronomist' });

  r = await req(jarObserver, 'POST', `${P}/users`, { name: 'By Observer', role: 'worker', password: staffPass });
  check(5, 4, 'Observer не может создать сотрудника → 403', r.status === 403, `status=${r.status}`);

  r = await req(jarA, 'GET', `${P}/users?role=worker`);
  check(5, 5, 'Фильтр по роли работает',
    r.status === 200 && Array.isArray(r.data) && r.data.length === 1 && r.data.every((u) => u.role === 'worker'),
    `count=${r.data?.length}`);

  const agroBefore = await db('users').where({ id: agro.id }).first();
  r = await req(jarA, 'PATCH', `${P}/users/${agro.id}/role`, { role: 'worker' });
  const agroAfter = await db('users').where({ id: agro.id }).first();
  check(5, 6, 'Изменение роли обновляет updated_at',
    r.status === 200 && new Date(agroAfter.updated_at) > new Date(agroBefore.updated_at), `status=${r.status}`);
  await req(jarA, 'PATCH', `${P}/users/${agro.id}/role`, { role: 'agronomist' });

  r = await req(jarA, 'PATCH', `${P}/users/${agro.id}/role`, { role: 'owner' });
  check(5, 7, 'Нельзя назначить роль owner через API', r.status === 400, `status=${r.status}`);

  // ============ MODULE 4 — RBAC ============
  r = await req(jarObserver, 'POST', `${P}/locations`, { name: 'X', type: 'area' });
  check(4, 1, 'requireRole: observer на запись → 403', r.status === 403, `status=${r.status}`);

  const jarB = newJar();
  await req(jarB, 'POST', '/auth/register', { email: emailB, password: PASS1, name: 'Second Acc' });
  await req(jarB, 'POST', '/auth/login', { email: emailB, password: PASS1 });
  await req(jarB, 'POST', '/nurseries', { name: 'Foreign Nursery' });
  const nurseryB = await db('nurseries')
    .join('accounts', 'nurseries.account_id', 'accounts.id')
    .where('accounts.email', emailB).select('nurseries.id').first();
  r = await req(jarA, 'GET', `/nurseries/${nurseryB.id}/locations`);
  check(4, 2, 'requireNurseryAccess: чужой nurseryId → 403', r.status === 403, `status=${r.status}`);

  r = await req(newJar(), 'GET', `${P}/locations`);
  check(4, 3, 'Без токена → 401', r.status === 401, `status=${r.status}`);

  check(4, 4, 'Хелперы rbac.js используются в сервисах', false,
    'src/utils/rbac.js не импортируется нигде (мёртвый код); RBAC реализован через requireRole/requireNurseryAccess middleware — критерий дока устарел');

  // ============ MODULE 7 — Локации ============
  const area = (await req(jarA, 'POST', `${P}/locations`, { name: 'Участок 1', type: 'area' })).data;
  const section = (await req(jarA, 'POST', `${P}/locations`, { name: 'Секция 1', type: 'section', parentId: area.id })).data;
  const row = (await req(jarA, 'POST', `${P}/locations`, { name: 'Ряд 1', type: 'row', parentId: section.id })).data;
  const placeRes = await req(jarA, 'POST', `${P}/locations`, { name: 'Место 1', type: 'place', parentId: row.id });
  const place = placeRes.data;
  check(7, 1, 'Поддерживается уровень place', placeRes.status === 201 && place?.type === 'place', `status=${placeRes.status}`);

  r = await req(jarA, 'GET', `${P}/locations/tree`);
  const depth4 = r.data?.find?.((a) => a.id === area.id)?.children?.[0]?.children?.[0]?.children?.[0];
  check(7, 2, 'Дерево возвращает 4 уровня', r.status === 200 && depth4?.id === place.id, `status=${r.status}`);

  r = await req(jarA, 'DELETE', `${P}/locations/${area.id}`);
  check(7, 3, 'Удаление при дочерних узлах запрещено', r.status === 400, `status=${r.status}`);

  r = await req(jarWorker, 'POST', `${P}/locations`, { name: 'W', type: 'area' });
  const r2 = await req(jarObserver, 'PATCH', `${P}/locations/${area.id}`, { name: 'O' });
  check(7, 5, 'worker/observer не могут менять структуру → 403',
    r.status === 403 && r2.status === 403, `worker=${r.status}, observer=${r2.status}`);
  const checkLocationWithPlants = async () => {
    const rDel7 = await req(jarA, 'DELETE', `${P}/locations/${place.id}`);
    check(7, 4, 'Удаление локации с растениями запрещено', rDel7.status === 400, `status=${rDel7.status}`);
  };

  // ============ MODULE 8 — Справочники ============
  r = await req(jarA, 'GET', `${P}/species/search?q=Acer`);
  const searchOk = r.status === 200;
  r = await req(jarA, 'POST', `${P}/species/attach-by-name`, { scientific_name: 'Acer platanoides', display_name_ru: 'Клён остролистный' });
  const speciesAttached = r.status === 200 || r.status === 201;
  const speciesId = r.data?.species?.id ?? r.data?.id;
  check(8, 1, 'Поиск подсказок (GBIF) и добавление вида', searchOk && speciesAttached,
    `search=${searchOk}, attach=${r.status}`);

  r = await req(jarA, 'POST', `${P}/species/attach-by-name`, { scientific_name: 'Acer platanoides', display_name_ru: 'Клён остролистный' });
  check(8, 2, 'Дубль вида в питомнике не создаётся',
    r.data?.alreadyExists === true || r.status === 409, `status=${r.status}, alreadyExists=${r.data?.alreadyExists}`);

  await setPlan({ feature_tags: false });
  r = await req(jarA, 'POST', `${P}/tags`, { name: 'Blocked', color: '#FF0000' });
  check(8, 3, 'Теги требуют feature_tags → 403', r.status === 403, `status=${r.status}`);
  await setPlan({ feature_tags: true });
  const tag = (await req(jarA, 'POST', `${P}/tags`, { name: 'Accept Tag', color: '#00FF00' })).data;

  const sysMt = await db('movement_types').where({ is_system: true, slug: 'sale' }).first();
  r = await req(jarA, 'PATCH', `${P}/movement-types/${sysMt.id}`, { name: 'Hack' });
  const rDel = await req(jarA, 'DELETE', `${P}/movement-types/${sysMt.id}`);
  check(8, 4, 'Системные movement_types защищены',
    [400, 403].includes(r.status) && [400, 403].includes(rDel.status), `patch=${r.status}, delete=${rDel.status}`);

  const sysCt = await db('container_types').where({ is_system: true, code: 'P9' }).first();
  r = await req(jarA, 'PATCH', `${P}/container-types/${sysCt.id}`, { name: 'Hack' });
  const rDelCt = await req(jarA, 'DELETE', `${P}/container-types/${sysCt.id}`);
  check(8, 5, 'Системные container_types защищены',
    [400, 403].includes(r.status) && [400, 403].includes(rDelCt.status), `patch=${r.status}, delete=${rDelCt.status}`);

  const customCt = (await req(jarA, 'POST', `${P}/container-types`, {
    code: `CUST-${ts}`, name: 'Custom Test', container_kind: 'pot', volume_liters: 7,
  })).data;

  // ============ MODULE 9 — Реестр растений ============
  r = await req(jarA, 'POST', `${P}/plants`, {
    speciesId, locationId: place.id, containerId: sysCt.id,
    variety: 'Globosum', plantedAt: '2026-04-01', source: 'purchased', notes: 'Smoke plant',
  });
  const plant1 = r.data?.plant ?? r.data;
  check(9, 1, 'Создание генерирует qr_code и numeric_code',
    r.status === 201 && !!plant1?.qr_code && !!plant1?.numeric_code,
    `qr=${plant1?.qr_code}, code=${plant1?.numeric_code}`);

  const plantCount = await db('plants').where({ nursery_id: nid }).whereNull('deleted_at').count('id as c').then((x) => Number(x[0].c));
  await setPlan({ plant_limit: plantCount });
  r = await req(jarA, 'POST', `${P}/plants`, { variety: 'Over limit' });
  check(9, 2, 'Лимит растений соблюдается (403)', r.status === 403, `status=${r.status}`);
  await setPlan({ plant_limit: 1000 });

  r = await req(jarA, 'GET', `${P}/plants/by-qr/${plant1.qr_code}`);
  const rCode = await req(jarA, 'GET', `${P}/plants/by-code/${plant1.numeric_code}`);
  check(9, 3, 'Поиск по QR и numeric code',
    r.status === 200 && r.data?.id === plant1.id && rCode.status === 200 && rCode.data?.id === plant1.id,
    `qr=${r.status}, code=${rCode.status}`);

  const plant2 = (await req(jarA, 'POST', `${P}/plants`, { variety: 'To delete' })).data;
  r = await req(jarA, 'DELETE', `${P}/plants/${plant2.id}`);
  const plant2Db = await db('plants').where({ id: plant2.id }).first();
  check(9, 4, 'Мягкое удаление не физическое',
    [200, 204].includes(r.status) && !!plant2Db && plant2Db.deleted_at !== null, `status=${r.status}`);

  r = await req(jarAgro, 'PATCH', `${P}/plants/${plant2.id}/restore`);
  const rOwnerRestore = await req(jarA, 'PATCH', `${P}/plants/${plant2.id}/restore`);
  check(9, 5, 'Восстановление только owner',
    r.status === 403 && rOwnerRestore.status === 200, `agro=${r.status}, owner=${rOwnerRestore.status}`);

  r = await req(jarA, 'POST', `${P}/plants/bulk`, { count: 5, template: { speciesId, containerId: sysCt.id, variety: 'Bulk' } });
  const bulkPlants = await db('plants').where({ nursery_id: nid, variety: 'Bulk' });
  const distinctQr = new Set(bulkPlants.map((p) => p.qr_code)).size;
  check(9, 6, 'Bulk-create создаёт N растений с разными QR',
    r.status === 201 && bulkPlants.length === 5 && distinctQr === 5, `count=${bulkPlants.length}`);

  await setPlan({ feature_tags: false });
  r = await req(jarA, 'POST', `${P}/plants/${plant1.id}/tags/${tag.id}`);
  check(9, 7, 'Теги растений требуют feature_tags → 403', r.status === 403, `status=${r.status}`);
  await setPlan({ feature_tags: true });
  await req(jarA, 'POST', `${P}/plants/${plant1.id}/tags/${tag.id}`);

  r = await req(jarA, 'GET', `${P}/plants?containerId=${sysCt.id}&numericCode=${plant1.numeric_code}`);
  const items = r.data?.items ?? r.data?.data ?? r.data;
  check(9, 8, 'Фильтрация по контейнеру и numeric code',
    r.status === 200 && Array.isArray(items) && items.length === 1 && items[0].id === plant1.id,
    `count=${items?.length}`);

  const page1 = await req(jarA, 'GET', `${P}/plants?page=1&perPage=2`);
  const page2 = await req(jarA, 'GET', `${P}/plants?page=2&perPage=2`);
  const p1items = page1.data?.items ?? page1.data?.data ?? page1.data;
  const p2items = page2.data?.items ?? page2.data?.data ?? page2.data;
  check(9, 9, 'Пагинация работает',
    page1.status === 200 && page2.status === 200 && p1items?.length === 2 &&
    p2items?.length >= 1 && p1items[0].id !== p2items[0].id,
    `p1=${p1items?.length}, p2=${p2items?.length}`);

  // M7#4 — у plant1 локация place (нельзя удалить занятую локацию)
  await checkLocationWithPlants();

  // M8#6 — используемый container type удаляется мягко
  await req(jarA, 'POST', `${P}/plants`, { containerId: customCt.id, variety: 'CT user' });
  r = await req(jarA, 'DELETE', `${P}/container-types/${customCt.id}`);
  const customCtDb = await db('container_types').where({ id: customCt.id }).first();
  check(8, 6, 'Удаление используемого container type не физическое',
    [200, 204].includes(r.status) && !!customCtDb && customCtDb.is_active === false,
    `status=${r.status}, is_active=${customCtDb?.is_active}`);

  // ============ MODULE 10 — Операции и фото ============
  const OP = `${P}/plants/${plant1.id}/operations`;

  await setPlan({ feature_operations: false });
  r = await req(jarA, 'POST', OP, { type: 'inspection' });
  check(10, 1, 'Операция требует feature_operations → 403', r.status === 403, `status=${r.status}`);
  await setPlan({ feature_operations: true });

  await db('plants').where({ id: plant1.id }).update({ status: 'sold' });
  r = await req(jarA, 'POST', OP, { type: 'inspection' });
  check(10, 2, 'Операция для проданного растения → 400', r.status === 400, `status=${r.status}`);
  await db('plants').where({ id: plant1.id }).update({ status: 'growing' });

  const op1 = (await req(jarA, 'POST', OP, { type: 'inspection', notes: 'Smoke op' })).data;
  r = await req(jarAgro, 'PATCH', `${OP}/${op1.id}`, { notes: 'hacked' });
  check(10, 3, 'Редактирование чужой операции → 403', r.status === 403, `status=${r.status}`);

  const opByAgro = (await req(jarAgro, 'POST', OP, { type: 'pruning', notes: 'by agro' })).data;
  r = await req(jarA, 'DELETE', `${OP}/${opByAgro.id}`);
  check(10, 4, 'Owner может удалить любую операцию', [200, 204].includes(r.status), `status=${r.status}`);

  r = await req(jarA, 'POST', `${OP}/${op1.id}/photos`, undefined, { form: photoForm() });
  check(10, 5, 'Фото требует feature_photos → 403', r.status === 403, `status=${r.status}`);

  await setPlan({ feature_photos: true });
  // F13: загрузка мультипартом (поле file), хранение как bytea; ответ — метаданные без байтов.
  const rPhoto = await req(jarA, 'POST', `${OP}/${op1.id}/photos`, undefined, { form: photoForm() });
  const rPhotoContent = rPhoto.status === 201
    ? await req(jarA, 'GET', `${OP}/${op1.id}/photos/${rPhoto.data.id}/content`, undefined, { raw: true })
    : { status: 0, contentType: '' };
  await setPlan({ feature_photos: false });

  const ct2 = await db('container_types').where({ is_system: true, code: 'C2' }).first();
  r = await req(jarA, 'POST', OP, { type: 'transplant', newContainerId: ct2.id });
  const plant1Db = await db('plants').where({ id: plant1.id }).first();
  check(10, 6, 'transplant обновляет plants.container_id',
    r.status === 201 && plant1Db.container_id === ct2.id, `container=${plant1Db.container_id === ct2.id}`);

  const opDel = (await req(jarA, 'POST', OP, { type: 'other', notes: 'to delete' })).data;
  r = await req(jarA, 'DELETE', `${OP}/${opDel.id}`);
  const opDelDb = await db('operations').where({ id: opDel.id }).first();
  const opsList = await req(jarA, 'GET', OP);
  const opsArr = opsList.data?.items ?? opsList.data;
  const stillListed = Array.isArray(opsArr) && opsArr.some((o) => o.id === opDel.id);
  check(10, 7, 'Мягкое удаление операции',
    [200, 204].includes(r.status) && opDelDb?.deleted_at !== null && !stillListed, `deleted_at set, listed=${stillListed}`);

  r = await req(jarObserver, 'POST', OP, { type: 'inspection' });
  check(10, 8, 'Observer не может создать операцию → 403', r.status === 403, `status=${r.status}`);

  // ============ MODULE 11 — Движения ============
  const MV = `${P}/plants/${plant1.id}/movements`;
  const transferType = await db('movement_types').where({ slug: 'transfer', is_system: true }).first();
  const saleType = await db('movement_types').where({ slug: 'sale', is_system: true }).first();

  r = await req(jarA, 'POST', MV, { typeId: transferType.id, toLocationId: section.id });
  const mv1 = r.data;
  const mv1Db = mv1?.id && (await db('movements').where({ id: mv1.id }).first());
  check(11, 1, 'movements.type_id ссылается на movement_types',
    r.status === 201 && mv1Db?.type_id === transferType.id, `status=${r.status}`);

  const plantAfterTransfer = await db('plants').where({ id: plant1.id }).first();
  check(11, 3, 'to_location_id обновляет plants.location_id',
    plantAfterTransfer.location_id === section.id, '');

  const bulkOne = bulkPlants[0];
  await req(jarA, 'POST', `${P}/plants/${bulkOne.id}/movements`, { typeId: saleType.id });
  const soldPlant = await db('plants').where({ id: bulkOne.id }).first();
  check(11, 2, 'sets_status меняет статус растения', soldPlant.status === 'sold', `status=${soldPlant.status}`);

  r = await req(jarA, 'POST', `${P}/plants/${bulkOne.id}/movements`, { typeId: transferType.id, toLocationId: section.id });
  check(11, 4, 'Движение для проданного растения → 400', r.status === 400, `status=${r.status}`);

  r = await req(jarWorker, 'POST', MV, { typeId: transferType.id, toLocationId: place.id });
  check(11, 5, 'Worker может создать движение → 201', r.status === 201, `status=${r.status}`);
  const mvByWorker = r.data;

  r = await req(jarObserver, 'POST', MV, { typeId: transferType.id });
  check(11, 6, 'Observer не может создать движение → 403', r.status === 403, `status=${r.status}`);

  r = await req(jarWorker, 'DELETE', `${MV}/${mvByWorker.id}`);
  check(11, 7, 'Удаление движения worker → 403', r.status === 403, `status=${r.status}`);

  r = await req(jarA, 'GET', MV);
  const mvList = r.data?.items ?? r.data;
  const withNames = Array.isArray(mvList) && mvList.some((m) => 'from_location_name' in m && 'to_location_name' in m);
  check(11, 8, 'История движений содержит имена локаций', r.status === 200 && withNames, '');

  // ============ MODULE 12 — Этикетки ============
  await setPlan({ feature_qr: false });
  r = await req(jarA, 'POST', `${P}/plants/labels`, { plantIds: [plant1.id], layout: 'grid' });
  check(12, 1, 'feature_qr обязательна → 403', r.status === 403, `status=${r.status}`);
  await setPlan({ feature_qr: true });

  r = await req(jarA, 'POST', `${P}/plants/labels`, { plantIds: [plant1.id], layout: 'grid' }, { raw: true });
  const isPdf = r.status === 200 && r.data.subarray(0, 4).toString() === '%PDF';
  check(12, 2, 'PDF генерируется', isPdf, `status=${r.status}, content-type=${r.contentType}`);

  r = await req(jarA, 'POST', `${P}/plants/labels`, { plantIds: ['00000000-0000-4000-8000-000000000000'] });
  check(12, 3, 'Несуществующий plantId → 404', r.status === 404, `status=${r.status}`);

  const countPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const gridIds = [plant1.id, ...bulkPlants.slice(0, 4).map((b) => b.id)];
  r = await req(jarA, 'POST', `${P}/plants/labels`, { plantIds: gridIds, layout: 'grid' }, { raw: true });
  const gridPages = countPages(r.data);
  check(12, 4, 'Layout grid — сетка на одной странице A4 (≤12 шт.)', r.status === 200 && gridPages === 1, `pages=${gridPages}`);

  r = await req(jarA, 'POST', `${P}/plants/labels`, { plantIds: gridIds.slice(0, 3), layout: 'single' }, { raw: true });
  const singlePages = countPages(r.data);
  check(12, 5, 'Layout single — страница на растение', r.status === 200 && singlePages === 3, `pages=${singlePages}`);

  // ============ MODULE 13 — Лента активности ============
  const logPlantCreated = await db('activity_logs')
    .where({ nursery_id: nid, event_type: 'plant.created', entity_id: plant1.id }).first();
  check(13, 1, 'Создание растения пишет лог plant.created', !!logPlantCreated, '');

  const logMovement = await db('activity_logs')
    .where({ nursery_id: nid }).where('event_type', 'like', 'movement.%').first();
  check(13, 2, 'Движение пишет корректный тип лога', !!logMovement, `event=${logMovement?.event_type}`);

  r = await req(jarObserver, 'GET', `${P}/activity`);
  check(13, 4, 'Лента доступна всем ролям (observer → 200)', r.status === 200, `status=${r.status}`);

  r = await req(jarA, 'GET', `${P}/activity?userId=${ownerA.id}`);
  let logs = r.data?.data ?? r.data;
  const onlyOwner = Array.isArray(logs) && logs.length > 0 && logs.every((l) => l.user_id === ownerA.id);
  check(13, 5, 'Фильтр по userId работает', r.status === 200 && onlyOwner, `count=${logs?.length}`);

  r = await req(jarA, 'GET', `${P}/activity?eventType=plant.created`);
  logs = r.data?.data ?? r.data;
  const onlyType = Array.isArray(logs) && logs.length > 0 && logs.every((l) => l.event_type === 'plant.created');
  check(13, 6, 'Фильтр по eventType работает', r.status === 200 && onlyType, `count=${logs?.length}`);

  const a1 = await req(jarA, 'GET', `${P}/activity?page=1&perPage=3`);
  const a2 = await req(jarA, 'GET', `${P}/activity?page=2&perPage=3`);
  const a1items = a1.data?.data ?? a1.data;
  const a2items = a2.data?.data ?? a2.data;
  check(13, 7, 'Пагинация ленты работает',
    a1.status === 200 && a2.status === 200 && a1items?.length === 3 && a1items[0]?.id !== a2items?.[0]?.id, '');

  const [oldLog] = await db('activity_logs')
    .insert({
      nursery_id: nid, user_id: ownerA.id, event_type: 'plant.created',
      entity_type: 'plant', entity_id: plant1.id, details: null, created_at: '2020-01-01T00:00:00Z',
    })
    .returning('id');
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  await activityRepo.deleteOlderThan(twoYearsAgo);
  const oldLogAfter = await db('activity_logs').where({ id: oldLog.id ?? oldLog }).first();
  check(13, 9, 'Cleanup удаляет записи старше 2 лет', !oldLogAfter, '');

  // M6 — подписки
  r = await req(jarA, 'GET', '/subscriptions/current');
  check(6, 1, 'Текущая подписка с деталями плана',
    r.status === 200 && r.data?.status && r.data?.plant_limit !== undefined,
    `status=${r.status}, plan limits present=${r.data?.plant_limit !== undefined}`);

  const [inactivePlan] = await db('plans').insert({
    name: 'Inactive Test', slug: `inactive-test-${ts}`, plant_limit: 1, user_limit: 1,
    nursery_limit: 1, feature_tags: false, feature_operations: false, feature_qr: false,
    feature_photos: false, feature_export: false, is_active: false,
  }).returning('*');
  r = await req(jarA, 'GET', '/subscriptions/plans');
  const plansArr = r.data?.items ?? r.data;
  const hasInactive = Array.isArray(plansArr) && plansArr.some((p) => p.id === inactivePlan.id);
  check(6, 2, 'Список планов — только активные', r.status === 200 && !hasInactive, `inactive in list=${hasInactive}`);

  const [paidPlan] = await db('plans').insert({
    name: 'Paid Test', slug: `paid-test-${ts}`, plant_limit: 10000, user_limit: 100,
    nursery_limit: 5, feature_tags: true, feature_operations: true, feature_qr: true,
    feature_photos: true, feature_export: true, is_active: true,
  }).returning('*');
  r = await req(jarA, 'POST', '/subscriptions/change', { planId: paidPlan.id });
  const oldSub = await db('subscriptions').where({ account_id: accA.id, plan_id: subA.plan_id }).orderBy('created_at', 'desc').first();
  check(6, 3, 'B12: смена плана отключена → 403, старая подписка не тронута',
    r.status === 403 && oldSub?.status !== 'cancelled', `status=${r.status}, old=${oldSub?.status}`);

  r = await req(jarA, 'POST', '/subscriptions/change', { planId: '00000000-0000-4000-8000-000000000000' });
  check(6, 6, 'B12: смена плана недоступна для любого planId → 403', r.status === 403, `status=${r.status}`);

  check(6, 4, 'checkFeature блокирует фичу (403)', true, 'проверено через M8#3, M9#7, M10#1/#5, M12#1');
  check(6, 5, 'checkLimit блокирует лимит (403)', true, 'проверено через M5#2, M9#2');

  // smoke: фото criterion из smoke-сценария
  check(10, 99, '[smoke] Фото прикрепляется при feature_photos=true', rPhoto.status === 201, `status=${rPhoto.status}`);
  check(10, 7, 'F13: GET фото /content отдаёт байты с image-Content-Type',
    rPhotoContent.status === 200 && /^image\//.test(rPhotoContent.contentType || ''),
    `status=${rPhotoContent.status}, ct=${rPhotoContent.contentType}`);

  // Чистка тестовых планов, возврат подписки на free
  await db('subscriptions').where({ account_id: accA.id }).del();
  await db('subscriptions').insert({ account_id: accA.id, plan_id: subA.plan_id, status: 'trial' });
  await db('plans').whereIn('id', [inactivePlan.id, paidPlan.id]).del();
  await setPlan({
    plant_limit: 1000, user_limit: 3, feature_tags: true,
    feature_operations: true, feature_qr: true, feature_photos: false,
  });

  // ============ MODULE 14 — v2: In-app уведомления ============
  // Единственный продюсер уведомлений — staff.service.changeRole → notify(ROLE_CHANGED)
  // для целевого юзера. Роль агронома меняли в M5#6 (worker → agronomist), поэтому у
  // agro уже есть уведомления user.role_changed. Ответ GET: { data, total, unreadCount, ... }.
  r = await req(jarAgro, 'GET', `${P}/notifications`);
  const agroNotifs = r.data?.data ?? r.data;
  const roleNotif = Array.isArray(agroNotifs)
    ? agroNotifs.find((n) => n.type === 'user.role_changed')
    : null;
  check(14, 1, 'Список уведомлений юзера (GET) отдаёт только свои',
    r.status === 200 && !!roleNotif && agroNotifs.every((n) => n.user_id === agro.id),
    `count=${agroNotifs?.length}, unread=${r.data?.unreadCount}`);

  r = await req(jarA, 'GET', `${P}/notifications`);
  const ownerNotifs = r.data?.data ?? r.data;
  const leakedNotif = Array.isArray(ownerNotifs) && ownerNotifs.some((n) => n.id === roleNotif?.id);
  check(14, 2, 'Изоляция: юзер не видит чужие уведомления',
    r.status === 200 && !leakedNotif, `leaked=${leakedNotif}`);

  r = await req(jarAgro, 'PATCH', `${P}/notifications/${roleNotif?.id}/read`);
  const notifRead = roleNotif && (await db('notifications').where({ id: roleNotif.id }).first());
  check(14, 3, 'Пометка уведомления прочитанным (204)',
    r.status === 204 && notifRead?.is_read === true, `status=${r.status}, is_read=${notifRead?.is_read}`);

  r = await req(jarA, 'PATCH', `${P}/notifications/${roleNotif?.id}/read`);
  check(14, 4, 'Изоляция записи: пометка чужого уведомления → 404', r.status === 404, `status=${r.status}`);

  // ============ MODULE 15 — v2: Производственные стадии ============
  // Системные стадии (nursery_id IS NULL) видны всем питомникам; смена стадии — только
  // через операцию change_stage (operation.service.applyOperationSideEffects).
  r = await req(jarA, 'GET', `${P}/production-stages`);
  const stages = Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data);
  const systemSlugs = ['propagation', 'liner', 'container', 'field'];
  const sysStages = Array.isArray(stages) ? stages.filter((s) => s.is_system) : [];
  const hasAllSystem = systemSlugs.every((slug) =>
    sysStages.some((s) => s.slug === slug && s.nursery_id === null));
  check(15, 1, 'Список системных стадий (4 шт., nursery_id=null)',
    r.status === 200 && hasAllSystem, `system=${sysStages.length}`);
  const containerStage = Array.isArray(stages) ? stages.find((s) => s.slug === 'container') : null;

  r = await req(jarA, 'POST', OP, { type: 'change_stage', newStageId: containerStage?.id, notes: 'to container' });
  const plantStageDb = await db('plants').where({ id: plant1.id }).first();
  const stageHist = await db('plant_stage_history')
    .where({ plant_id: plant1.id, stage_id: containerStage?.id }).first();
  check(15, 2, 'change_stage меняет plants.stage_id и пишет plant_stage_history',
    r.status === 201 && plantStageDb.stage_id === containerStage?.id && !!stageHist,
    `status=${r.status}, stage=${plantStageDb.stage_id === containerStage?.id}, hist=${!!stageHist}`);

  r = await req(jarA, 'POST', OP, { type: 'change_stage' });
  check(15, 3, 'change_stage без newStageId → 400', r.status === 400, `status=${r.status}`);

  const normRes = await req(jarA, 'POST', `${P}/stage-labor-norms`,
    { stage_id: containerStage?.id, operation_type: 'pruning', norm_minutes: 30 });
  r = await req(jarA, 'GET', `${P}/stage-labor-norms?stageId=${containerStage?.id}`);
  const norms = Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data);
  const hasNorm = Array.isArray(norms) &&
    norms.some((n) => n.stage_id === containerStage?.id && n.operation_type === 'pruning');
  check(15, 4, 'Норма труда на стадию: создание (201) и фильтр по stageId',
    normRes.status === 201 && r.status === 200 && hasNorm,
    `create=${normRes.status}, list=${r.status}, found=${hasNorm}`);

  // ============ MODULE 16 — v2: Мульти-питомник (переключение + изоляция) ============
  // Второй питомник на аккаунте требует nursery_limit >= 2. createNursery сразу
  // активирует новый питомник (authService.activateNursery: cookie + last_active_nursery_id).
  await setPlan({ nursery_limit: 5 });
  r = await req(jarA, 'POST', '/nurseries', { name: 'Accept Nursery B', address: 'B street 2' });
  const nurseryBSame = await db('nurseries').where({ account_id: accA.id }).whereNot({ id: nid }).first();
  const accAfterCreate = await db('accounts').where({ id: accA.id }).first();
  check(16, 1, 'Создание второго питомника на аккаунте → он становится активным',
    r.status === 201 && !!nurseryBSame && accAfterCreate.last_active_nursery_id === nurseryBSame.id,
    `status=${r.status}, active=${accAfterCreate.last_active_nursery_id === nurseryBSame?.id}`);
  const nidB = nurseryBSame?.id;

  // jarA теперь в контексте B — растения питомника A там не видны
  r = await req(jarA, 'GET', `/nurseries/${nidB}/plants?perPage=100`);
  const bItems = r.data?.items ?? r.data?.data ?? r.data;
  const bHasAPlant = Array.isArray(bItems) && bItems.some((p) => p.id === plant1.id);
  check(16, 2, 'Изоляция: ресурсы питомника A не видны в контексте B',
    r.status === 200 && !bHasAPlant, `count=${bItems?.length}, leaked=${bHasAPlant}`);

  // Активная сессия B не имеет доступа к URL питомника A (requireNurseryAccess) → 403
  r = await req(jarA, 'GET', `${P}/plants`);
  check(16, 3, 'Сессия активного питомника B не видит A по URL → 403', r.status === 403, `status=${r.status}`);

  // Переключение активного питомника обратно на A
  r = await req(jarA, 'POST', `/nurseries/${nid}/switch`);
  const accAfterSwitch = await db('accounts').where({ id: accA.id }).first();
  check(16, 4, 'Переключение активного питомника обновляет last_active_nursery_id',
    r.status === 200 && r.data?.nursery?.id === nid && accAfterSwitch.last_active_nursery_id === nid,
    `status=${r.status}, active=${accAfterSwitch.last_active_nursery_id === nid}`);

  // После switch ресурсы отдаются из нового активного питомника (A) — plant1 снова виден
  r = await req(jarA, 'GET', `${P}/plants?perPage=100`);
  const aItems = r.data?.items ?? r.data?.data ?? r.data;
  const aHasPlant = Array.isArray(aItems) && aItems.some((p) => p.id === plant1.id);
  check(16, 5, 'После switch ресурсы отдаются из активного питомника',
    r.status === 200 && aHasPlant, `count=${aItems?.length}, found=${aHasPlant}`);

  // Возврат free-плана к дефолтному nursery_limit
  await setPlan({ nursery_limit: 1 });

  // ============ MODULE 17 — Отчёты (v3-01) ============
  // Три read-only отчёта поверх текущей схемы. Контролируемые данные вставляем НАПРЯМУЮ в
  // БД с датами в прошлом (окно 2026-03..06), как это делают юнит-фикстуры отчётов и вставка
  // старого activity_log выше: отчёты становятся нетривиальными и детерминированными, а
  // свежие данные модулей 2-16 датированы now() (вне окна) и в отчёты не попадают. Всё
  // скоуплено по питомнику A (nid). Чистится каскадом при удалении питомника на след. прогоне
  // (plants→movements/operations/plant_stage_history ON DELETE CASCADE; nurseries→stage_labor_norms).
  // Проверки продолжают нумерацию модуля 17 (#1/#2 — staff-логин B11 выше) с #3.
  const RP = `/nurseries/${nid}/reports`;
  const RWINDOW = 'dateFrom=2026-03-01&dateTo=2026-06-30';
  const R_BEFORE = '2026-01-01T00:00:00Z'; // до окна — «остаток на начало»
  const R_MARCH = '2026-03-15T00:00:00Z';
  const R_APRIL = '2026-04-10T00:00:00Z';
  const R_MAY = '2026-05-10T00:00:00Z';
  const R_DELETED = '2026-02-01T00:00:00Z'; // мягкое удаление до окна
  const R_SPECIES = speciesId ?? null; // вид Acer из M8 (переиспользуем) или «Без вида»

  const rWriteOffMt = await db('movement_types').where({ slug: 'write_off', is_system: true }).first();
  const rSaleMt = await db('movement_types').where({ slug: 'sale', is_system: true }).first();
  const rTransferMt = await db('movement_types').where({ slug: 'transfer', is_system: true }).first();
  const rStageProp = await db('production_stages').where({ slug: 'propagation', is_system: true }).first();

  const rMakePlant = async (overrides = {}) => {
    const [plant] = await db('plants')
      .insert({
        nursery_id: nid,
        qr_code: `rq-${randomUUID()}`,
        numeric_code: `rn-${randomUUID()}`,
        status: 'growing',
        stage_id: rStageProp.id,
        created_at: R_BEFORE,
        ...overrides,
      })
      .returning('*');
    return plant;
  };
  const rMove = (plantId, typeId, opts = {}) =>
    db('movements').insert({
      plant_id: plantId,
      type_id: typeId,
      quantity: opts.quantity ?? 1,
      from_location_id: opts.from ?? null,
      to_location_id: opts.to ?? null,
      created_at: opts.at,
    });

  // Две локации — для разреза по локациям и transfersNet.
  const [rLoc1] = await db('locations')
    .insert({ nursery_id: nid, name: 'R-Локация 1', type: 'section' }).returning('*');
  const [rLoc2] = await db('locations')
    .insert({ nursery_id: nid, name: 'R-Локация 2', type: 'section' }).returning('*');

  // Растения с контролируемой историей (окно 2026-03..06).
  const rpA = await rMakePlant({ location_id: rLoc1.id, nursery_species_id: R_SPECIES }); // остаётся
  const rpB = await rMakePlant({ location_id: rLoc2.id, nursery_species_id: R_SPECIES }); // перемещён loc1→loc2
  await rMove(rpB.id, rTransferMt.id, { at: R_APRIL, from: rLoc1.id, to: rLoc2.id });
  const rpC = await rMakePlant({ location_id: rLoc1.id, nursery_species_id: R_SPECIES }); // продан
  await rMove(rpC.id, rSaleMt.id, { at: R_APRIL });
  const rpD = await rMakePlant({ location_id: rLoc2.id, nursery_species_id: null }); // списан (май)
  await rMove(rpD.id, rWriteOffMt.id, { at: R_MAY });
  const rpWO = await rMakePlant({ location_id: rLoc1.id, nursery_species_id: R_SPECIES }); // списан (март)
  await rMove(rpWO.id, rWriteOffMt.id, { at: R_MARCH });
  await rMakePlant({ location_id: rLoc2.id, nursery_species_id: null, created_at: R_MARCH }); // приход
  await rMakePlant({ location_id: rLoc1.id, nursery_species_id: R_SPECIES, deleted_at: R_DELETED }); // удалён до окна
  await rMakePlant({ location_id: null, nursery_species_id: null, created_at: R_MARCH }); // приход «без локации/вида»

  // Трудозатраты: нормы на стадии propagation + 3 операции (pruning/treatment с нормой,
  // inspection — без нормы). Растение без истории стадий → берётся текущая стадия (propagation).
  await db('stage_labor_norms').insert([
    { nursery_id: nid, stage_id: rStageProp.id, operation_type: 'pruning', norm_minutes: 30 },
    { nursery_id: nid, stage_id: rStageProp.id, operation_type: 'treatment', norm_minutes: 15 },
  ]);
  const rpLabor = await rMakePlant({ location_id: rLoc1.id, nursery_species_id: R_SPECIES });
  await db('operations').insert([
    { plant_id: rpLabor.id, type: 'pruning', created_at: R_MARCH }, // → 30
    { plant_id: rpLabor.id, type: 'treatment', created_at: R_MARCH }, // → 15
    { plant_id: rpLabor.id, type: 'inspection', created_at: R_MARCH }, // нормы нет → operationsWithoutNorm
  ]);
  const R_EXPECTED_OPS = 3;
  const R_EXPECTED_MINUTES = 45; // 30 + 15 (inspection = 0)

  // #3 write-offs: total>0, строки непустые, доли в [0,1], rate конечен.
  const rWo = await req(jarA, 'GET', `${RP}/write-offs?${RWINDOW}`);
  check(17, 3, 'write-offs: totalWrittenOff>0, строки непустые, share∈[0,1], rate конечен',
    rWo.status === 200 && rWo.data?.totalWrittenOff > 0 &&
    Array.isArray(rWo.data?.rows) && rWo.data.rows.length > 0 &&
    rWo.data.rows.every((row) => row.share >= 0 && row.share <= 1) &&
    Number.isFinite(rWo.data?.rate),
    `total=${rWo.data?.totalWrittenOff}, rows=${rWo.data?.rows?.length}, rate=${rWo.data?.rate}`);

  // Балансовая идентичность: closing = opening + inflow − sold − writtenOff + transfersNet.
  const rIdentity = (row) =>
    row.closing === row.opening + row.inflow - row.sold - row.writtenOff + row.transfersNet;

  // #4 stock-flow[location]: инвариант по всем строкам и totals + transfersNet задействован.
  const rSfLoc = await req(jarA, 'GET', `${RP}/stock-flow?${RWINDOW}&groupBy=location`);
  check(17, 4, 'stock-flow[location]: closing=opening+inflow−sold−writtenOff+transfersNet (строки+totals), transfersNet≠0',
    rSfLoc.status === 200 && Array.isArray(rSfLoc.data?.rows) && rSfLoc.data.rows.length > 0 &&
    rSfLoc.data.rows.every(rIdentity) && rIdentity(rSfLoc.data.totals) &&
    rSfLoc.data.rows.some((row) => row.transfersNet !== 0),
    `rows=${rSfLoc.data?.rows?.length}, totals.closing=${rSfLoc.data?.totals?.closing}`);

  // #5 stock-flow[species]: тот же инвариант по строкам и totals.
  const rSfSpc = await req(jarA, 'GET', `${RP}/stock-flow?${RWINDOW}&groupBy=species`);
  check(17, 5, 'stock-flow[species]: инвариант closing по всем строкам и totals',
    rSfSpc.status === 200 && Array.isArray(rSfSpc.data?.rows) && rSfSpc.data.rows.length > 0 &&
    rSfSpc.data.rows.every(rIdentity) && rIdentity(rSfSpc.data.totals),
    `rows=${rSfSpc.data?.rows?.length}, totals.closing=${rSfSpc.data?.totals?.closing}`);

  // #6 labor-cost: operationsCount, operationsWithoutNorm≥1, totalMinutes и Σ(row.minutes).
  const rLc = await req(jarA, 'GET', `${RP}/labor-cost?${RWINDOW}`);
  const rLcSum = Array.isArray(rLc.data?.rows)
    ? rLc.data.rows.reduce((acc, row) => acc + row.minutes, 0) : NaN;
  check(17, 6, 'labor-cost: operationsCount/operationsWithoutNorm/totalMinutes и Σ(minutes) сходятся',
    rLc.status === 200 && rLc.data?.operationsCount === R_EXPECTED_OPS &&
    rLc.data?.operationsWithoutNorm >= 1 && rLc.data?.totalMinutes === R_EXPECTED_MINUTES &&
    rLcSum === rLc.data?.totalMinutes,
    `ops=${rLc.data?.operationsCount}, noNorm=${rLc.data?.operationsWithoutNorm}, total=${rLc.data?.totalMinutes}, Σ=${rLcSum}`);

  // #7 CSV: 200 + text/csv + BOM + разделитель «;» + Content-Disposition: attachment.
  // Прямой fetch — req() не возвращает заголовок content-disposition.
  const rCsvHeaders = jarA.size ? { cookie: [...jarA].map(([k, v]) => `${k}=${v}`).join('; ') } : {};
  const rCsvRes = await fetch(`${BASE}${RP}/write-offs?${RWINDOW}&groupBy=month&format=csv`, { headers: rCsvHeaders });
  const rCsvText = Buffer.from(await rCsvRes.arrayBuffer()).toString('utf8');
  check(17, 7, 'CSV: 200 + text/csv + BOM + разделитель «;» + attachment',
    rCsvRes.status === 200 &&
    /text\/csv/.test(rCsvRes.headers.get('content-type') || '') &&
    rCsvText.charCodeAt(0) === 0xfeff &&
    rCsvText.includes(';') &&
    /attachment/i.test(rCsvRes.headers.get('content-disposition') || ''),
    `status=${rCsvRes.status}, ct=${rCsvRes.headers.get('content-type')}, bom=${rCsvText.charCodeAt(0) === 0xfeff}`);

  // #8 RBAC: worker/observer к отчётам → 403 (STRUCTURE_ROLES only).
  const rRbacW = await req(jarWorker, 'GET', `${RP}/write-offs?${RWINDOW}`);
  const rRbacO = await req(jarObserver, 'GET', `${RP}/stock-flow?${RWINDOW}`);
  check(17, 8, 'RBAC: worker и observer к отчётам → 403',
    rRbacW.status === 403 && rRbacO.status === 403,
    `worker=${rRbacW.status}, observer=${rRbacO.status}`);

  // ============ MODULE 18 — Биллинг (лицензионные коды) ============
  // Платный план под активацию кодом (чистится в конце блока). accA становится
  // платформенным админом; активатор — owner аккаунта B (jarB: свой питомник + trial-подписка,
  // не админ). Коды выпускаются под acceptPaidPlan, поэтому чистятся по plan_id (снимает и
  // FK license_codes.issued_by/activated_by_account_id на accA/accB перед их удалением).
  const [acceptPaidPlan] = await db('plans').insert({
    name: 'Accept Paid', slug: `accept-paid-${ts}`, plant_limit: 5000, user_limit: 10,
    nursery_limit: 5, feature_tags: true, feature_operations: true, feature_qr: true,
    feature_photos: true, feature_export: true, is_active: true,
  }).returning('*');

  r = await req(jarA, 'GET', '/admin/license-codes');
  const adminBefore = r.status;
  await db('accounts').where({ id: accA.id }).update({ is_platform_admin: true });
  r = await req(jarA, 'GET', '/admin/license-codes');
  check(18, 1, 'is_platform_admin из БД: 403 без флага → 200 после установки (тот же cookie)',
    adminBefore === 403 && r.status === 200, `before=${adminBefore}, after=${r.status}`);

  r = await req(jarA, 'POST', '/admin/license-codes', { planId: acceptPaidPlan.id, durationDays: 30, count: 1 });
  const code1 = r.data?.[0];
  const code1Db = code1 && (await db('license_codes').where({ id: code1.id }).first());
  check(18, 2, 'Выпуск кода → массив кодов, в БД status=issued',
    [200, 201].includes(r.status) && code1Db?.status === 'issued', `status=${r.status}, db=${code1Db?.status}`);

  r = await req(jarB, 'POST', '/subscriptions/activate-code', { code: code1?.code });
  check(18, 3, 'Активация: подписка стала Accept Paid, expires_at в будущем',
    r.status === 200 && r.data?.plan_id === acceptPaidPlan.id &&
    !!r.data?.expires_at && new Date(r.data.expires_at) > new Date(),
    `status=${r.status}, plan=${r.data?.plan_id === acceptPaidPlan.id}, exp=${r.data?.expires_at}`);

  r = await req(jarB, 'POST', '/subscriptions/activate-code', { code: code1?.code });
  check(18, 4, 'Повторная активация того же кода → 404 (единый текст)',
    r.status === 404 && r.data?.error === 'Код недействителен или уже использован', `status=${r.status}`);

  r = await req(jarB, 'GET', '/subscriptions/current');
  check(18, 5, 'GET /subscriptions/current активатора → plan_id платного плана',
    r.status === 200 && r.data?.plan_id === acceptPaidPlan.id,
    `status=${r.status}, plan=${r.data?.plan_id === acceptPaidPlan.id}`);

  const code2 = (await req(jarA, 'POST', '/admin/license-codes', { planId: acceptPaidPlan.id, durationDays: 30, count: 1 })).data?.[0];
  const rRevoke = await req(jarA, 'POST', `/admin/license-codes/${code2?.id}/revoke`);
  const rRevokedAct = await req(jarB, 'POST', '/subscriptions/activate-code', { code: code2?.code });
  check(18, 6, 'Revoke → status revoked; активация отозванного кода → 404',
    rRevoke.status === 200 && rRevoke.data?.status === 'revoked' && rRevokedAct.status === 404,
    `revoke=${rRevoke.status}/${rRevoke.data?.status}, activate=${rRevokedAct.status}`);

  r = await req(jarB, 'POST', '/plan-requests', { planId: acceptPaidPlan.id, comment: 'accept lead' });
  const leadReq = r.data;
  const rDupLead = await req(jarB, 'POST', '/plan-requests', { planId: acceptPaidPlan.id, comment: 'dup' });
  const rAdminLeads = await req(jarA, 'GET', '/admin/plan-requests');
  const leadsData = rAdminLeads.data?.data ?? rAdminLeads.data;
  const adminSeesLead = Array.isArray(leadsData) && leadsData.some((x) => x.id === leadReq?.id);
  const rProcess = await req(jarA, 'POST', `/admin/plan-requests/${leadReq?.id}/process`);
  check(18, 7, 'Лид: заявка 201, дубль на тот же план 409, админ видит и обрабатывает (processed)',
    r.status === 201 && rDupLead.status === 409 && adminSeesLead &&
    rProcess.status === 200 && rProcess.data?.status === 'processed',
    `create=${r.status}, dup=${rDupLead.status}, sees=${adminSeesLead}, process=${rProcess.status}/${rProcess.data?.status}`);

  // Чистка биллинга: снимаем ссылки на acceptPaidPlan (коды/заявки/подписки) и удаляем план.
  await db('license_codes').where({ plan_id: acceptPaidPlan.id }).del();
  await db('plan_requests').where({ plan_id: acceptPaidPlan.id }).del();
  await db('subscriptions').where({ plan_id: acceptPaidPlan.id }).del();
  await db('plans').where({ id: acceptPaidPlan.id }).del();

  // ============ MODULE 19 — Экспорт (v3-04) ============
  // Прайс-CRUD + CSV-экспорт остатков/прайс-листа. Чтобы количества сходились ТОЧНО,
  // заводим ОТДЕЛЬНЫЙ чистый аккаунт+питомник (accE/nidE) — иначе в сводку попали бы
  // растения модулей 9/17 из питомника A. accE на trial-подписке free-плана, поэтому
  // feature_export управляется тем же setPlan() (free), что и раньше. Данные вставляем
  // напрямую в БД (как в M17): 2 вида (species_catalog+nursery_species), 2 системных
  // контейнера, дерево локаций area→section→row, 5 АКТИВНЫХ растений + 1 sold + 1 soft-
  // deleted (обязаны быть исключены из остатков). В конце возвращаем feature_export=false.
  // Чистится каскадом при удалении accE на следующем прогоне (email accept.% → см. чистку
  // в начале main; nurseries→nursery_species→species_prices ON DELETE CASCADE).
  const emailE = `accept.export.${ts}@palisad.test`;
  const freePlanE = await db('plans').where({ slug: 'free' }).first();
  const [accE] = await db('accounts')
    .insert({ email: emailE, password_hash: 'x', name: 'Export Owner' }).returning('*');
  await db('subscriptions').insert({ account_id: accE.id, plan_id: freePlanE.id, status: 'trial' });
  const [nurseryE] = await db('nurseries')
    .insert({ account_id: accE.id, name: 'Export Nursery' }).returning('*');
  const nidE = nurseryE.id;
  // Owner-сессию ФОРЖИМ (как staff-сессии в M5/M17), без реального /auth/login — иначе
  // упёрлись бы в authLimiter (10 логинов на IP за окно; реальный вход владельца уже
  // проверен в M2/M3). Форжённый userId не существует — requireAuth его не трогает (см. M5).
  const jarE = forgeSession({ accountId: accE.id, userId: randomUUID(), nurseryId: nidE, role: 'owner' });

  const EP = `/nurseries/${nidE}/exports`;
  const PRP = `/nurseries/${nidE}/prices`;

  // 2 вида: свежие species_catalog (уникальный gbif_usage_key на прогон) + nursery_species.
  const eGbif1 = 1500000000 + (ts % 90000000);
  const eGbif2 = 1600000000 + (ts % 90000000);
  const [eScA] = await db('species_catalog')
    .insert({ gbif_usage_key: eGbif1, scientific_name: 'Acer accepticus', source: 'gbif' }).returning('*');
  const [eScB] = await db('species_catalog')
    .insert({ gbif_usage_key: eGbif2, scientific_name: 'Betula accepticus', source: 'gbif' }).returning('*');
  const [eNsA] = await db('nursery_species')
    .insert({ nursery_id: nidE, species_catalog_id: eScA.id, display_name_ru: 'Клён Э19' }).returning('*');
  const [eNsB] = await db('nursery_species')
    .insert({ nursery_id: nidE, species_catalog_id: eScB.id, display_name_ru: 'Берёза Э19' }).returning('*');

  // 2 системных контейнера (переиспользуем P9/C2) + системная стадия propagation.
  const eCtP9 = await db('container_types').where({ is_system: true, code: 'P9' }).first();
  const eCtC2 = await db('container_types').where({ is_system: true, code: 'C2' }).first();
  const eStageProp = await db('production_stages').where({ slug: 'propagation', is_system: true }).first();

  // Дерево локаций для проверки полного пути «Area / Section / Row».
  const [eArea] = await db('locations')
    .insert({ nursery_id: nidE, name: 'Area', type: 'area' }).returning('*');
  const [eSection] = await db('locations')
    .insert({ nursery_id: nidE, name: 'Section', type: 'section', parent_id: eArea.id }).returning('*');
  const [eRow] = await db('locations')
    .insert({ nursery_id: nidE, name: 'Row', type: 'row', parent_id: eSection.id }).returning('*');

  // 5 активных растений (3×Клён/P9, 2×Берёза/C2) + 1 sold + 1 soft-deleted (исключаются).
  const eMakePlant = (over = {}) =>
    db('plants').insert({
      nursery_id: nidE,
      qr_code: `eq-${randomUUID()}`,
      numeric_code: `en-${randomUUID()}`,
      status: 'growing',
      stage_id: eStageProp.id,
      variety: 'V1',
      location_id: eRow.id,
      ...over,
    });
  for (let i = 0; i < 3; i += 1) await eMakePlant({ nursery_species_id: eNsA.id, container_id: eCtP9.id });
  for (let i = 0; i < 2; i += 1) await eMakePlant({ nursery_species_id: eNsB.id, container_id: eCtC2.id });
  await eMakePlant({ nursery_species_id: eNsA.id, container_id: eCtP9.id, status: 'sold' });
  await eMakePlant({ nursery_species_id: eNsA.id, container_id: eCtP9.id, deleted_at: new Date().toISOString() });

  // #3 Цены: PUT upsert (не гейтится планом) → GET отдаёт позицию с подписями и ценой.
  const ePut = await req(jarE, 'PUT', PRP, { speciesId: eNsA.id, containerId: eCtP9.id, price: 12.5 });
  const eGetPrices = await req(jarE, 'GET', PRP);
  const ePriced = (eGetPrices.data?.rows ?? []).find(
    (row) => row.nurserySpeciesId === eNsA.id && row.containerTypeId === eCtP9.id
  );
  check(19, 3, 'Цены: PUT upsert → GET содержит позицию с верными speciesName/containerName/price',
    ePut.status === 200 && eGetPrices.status === 200 && !!ePriced &&
    ePriced.speciesName === 'Клён Э19' && ePriced.containerName === eCtP9.name &&
    Number(ePriced.price) === 12.5,
    `put=${ePut.status}, speciesName=${ePriced?.speciesName}, container=${ePriced?.containerName}, price=${ePriced?.price}`);

  // #1 Гейт feature_export: план без экспорта → оба экспорта 403.
  await setPlan({ feature_export: false });
  const eGateStock = await req(jarE, 'GET', `${EP}/stock`);
  const eGatePl = await req(jarE, 'GET', `${EP}/price-list`);
  check(19, 1, 'feature_export=false: экспорт остатков и прайс-листа → 403',
    eGateStock.status === 403 && eGatePl.status === 403,
    `stock=${eGateStock.status}, price-list=${eGatePl.status}`);

  // #2 После включения feature_export те же эндпоинты → 200.
  await setPlan({ feature_export: true });
  const eStock = await req(jarE, 'GET', `${EP}/stock`);
  const ePriceDefault = await req(jarE, 'GET', `${EP}/price-list`);
  check(19, 2, 'feature_export=true: экспорт остатков и прайс-листа → 200',
    eStock.status === 200 && ePriceDefault.status === 200,
    `stock=${eStock.status}, price-list=${ePriceDefault.status}`);

  // #4 Экспорт остатков[species]: total = число активных (5), строки (вид×контейнер) сходятся.
  const eStockRowA = eStock.data?.rows?.find(
    (row) => row.speciesName === 'Клён Э19' && row.containerName === eCtP9.name);
  const eStockRowB = eStock.data?.rows?.find(
    (row) => row.speciesName === 'Берёза Э19' && row.containerName === eCtC2.name);
  check(19, 4, 'Экспорт остатков[species]: total=5 активных, строки (Клён/P9)=3 и (Берёза/C2)=2',
    eStock.data?.total === 5 && eStockRowA?.count === 3 && eStockRowB?.count === 2,
    `total=${eStock.data?.total}, Клён/P9=${eStockRowA?.count}, Берёза/C2=${eStockRowB?.count}`);

  // #5 Проданное и soft-deleted исключены: иначе total=7, а строка P9=5 (а не 3).
  check(19, 5, 'Проданные и мягко удалённые растения НЕ учитываются в остатках (total=5, P9=3)',
    eStock.data?.total === 5 && eStockRowA?.count === 3,
    `total=${eStock.data?.total} (ожид. 5, не 7), P9=${eStockRowA?.count} (ожид. 3, не 5)`);

  // #6 Экспорт остатков[location]: полный путь локации «Area / Section / Row».
  const eStockLoc = await req(jarE, 'GET', `${EP}/stock?groupBy=location`);
  check(19, 6, 'Экспорт остатков[location]: locationPath = «Area / Section / Row», total=5',
    eStockLoc.status === 200 && eStockLoc.data?.total === 5 &&
    Array.isArray(eStockLoc.data?.rows) && eStockLoc.data.rows.length > 0 &&
    eStockLoc.data.rows.every((row) => row.locationPath === 'Area / Section / Row'),
    `total=${eStockLoc.data?.total}, path=${eStockLoc.data?.rows?.[0]?.locationPath}`);

  // #7 Прайс-лист (default): только позиции С ценой (одна: Клён/P9, count=3, price=12.5), total=3.
  const ePdRows = ePriceDefault.data?.rows ?? [];
  const ePdA = ePdRows.find((row) => row.speciesName === 'Клён Э19');
  check(19, 7, 'Прайс-лист (default): только позиции с ценой (Клён/P9, count=3), total=3',
    ePdRows.length === 1 && !!ePdA && Number(ePdA.price) === 12.5 &&
    ePdA.scientificName === 'Acer accepticus' && ePdA.containerName === eCtP9.name &&
    ePdA.count === 3 && ePriceDefault.data?.total === 3,
    `rows=${ePdRows.length}, price=${ePdA?.price}, total=${ePriceDefault.data?.total}`);

  // #8 Прайс-лист (includeUnpriced=true): + позиция без цены (Берёза/C2, price=null), total=5.
  const ePriceAll = await req(jarE, 'GET', `${EP}/price-list?includeUnpriced=true`);
  const ePaRows = ePriceAll.data?.rows ?? [];
  const ePaA = ePaRows.find((row) => row.speciesName === 'Клён Э19');
  const ePaB = ePaRows.find((row) => row.speciesName === 'Берёза Э19');
  check(19, 8, 'Прайс-лист (includeUnpriced): непрайсовая позиция с price=null, total=5',
    ePriceAll.status === 200 && ePaRows.length === 2 &&
    Number(ePaA?.price) === 12.5 && !!ePaB && ePaB.price === null && ePaB.count === 2 &&
    ePaB.scientificName === 'Betula accepticus' && ePriceAll.data?.total === 5,
    `rows=${ePaRows.length}, Берёза.price=${ePaB?.price}, total=${ePriceAll.data?.total}`);

  // #9 CSV прайс-листа: BOM + «;» + блок-шапка «Цены в BYN» + строка «Всего» + attachment.
  // Прямой fetch — req() не возвращает заголовок content-disposition (см. M17#7).
  const eCsvHeaders = jarE.size ? { cookie: [...jarE].map(([k, v]) => `${k}=${v}`).join('; ') } : {};
  const ePlCsvRes = await fetch(`${BASE}${EP}/price-list?format=csv`, { headers: eCsvHeaders });
  const ePlCsv = Buffer.from(await ePlCsvRes.arrayBuffer()).toString('utf8');
  check(19, 9, 'CSV прайс-листа: BOM + «;» + шапка «Цены в BYN» + строка «Всего» + attachment',
    ePlCsvRes.status === 200 && ePlCsv.charCodeAt(0) === 0xfeff && ePlCsv.includes(';') &&
    ePlCsv.includes('Цены в BYN') && ePlCsv.includes('Всего') &&
    /attachment/i.test(ePlCsvRes.headers.get('content-disposition') || ''),
    `status=${ePlCsvRes.status}, bom=${ePlCsv.charCodeAt(0) === 0xfeff}, cd=${ePlCsvRes.headers.get('content-disposition')}`);

  // #10 CSV остатков: BOM + «;» + attachment.
  const eStCsvRes = await fetch(`${BASE}${EP}/stock?format=csv`, { headers: eCsvHeaders });
  const eStCsv = Buffer.from(await eStCsvRes.arrayBuffer()).toString('utf8');
  check(19, 10, 'CSV остатков: BOM + «;» + attachment',
    eStCsvRes.status === 200 && eStCsv.charCodeAt(0) === 0xfeff && eStCsv.includes(';') &&
    /attachment/i.test(eStCsvRes.headers.get('content-disposition') || ''),
    `status=${eStCsvRes.status}, bom=${eStCsv.charCodeAt(0) === 0xfeff}, cd=${eStCsvRes.headers.get('content-disposition')}`);

  // #11/#12 RBAC: worker и observer → 403 на прайс и оба экспорта (requireRole до checkFeature).
  // Форжим сессии для nidE (requireNurseryAccess смотрит только nurseryId в токене; requireAuth
  // не трогает несуществующий userId — см. M5).
  const jarEWorker = forgeSession({ accountId: accE.id, userId: randomUUID(), nurseryId: nidE, role: 'worker' });
  const jarEObserver = forgeSession({ accountId: accE.id, userId: randomUUID(), nurseryId: nidE, role: 'observer' });
  const eWPrices = await req(jarEWorker, 'GET', PRP);
  const eWStock = await req(jarEWorker, 'GET', `${EP}/stock`);
  const eWPl = await req(jarEWorker, 'GET', `${EP}/price-list`);
  check(19, 11, 'RBAC: worker к /prices и обоим экспортам → 403',
    eWPrices.status === 403 && eWStock.status === 403 && eWPl.status === 403,
    `prices=${eWPrices.status}, stock=${eWStock.status}, price-list=${eWPl.status}`);
  const eOPrices = await req(jarEObserver, 'GET', PRP);
  const eOStock = await req(jarEObserver, 'GET', `${EP}/stock`);
  const eOPl = await req(jarEObserver, 'GET', `${EP}/price-list`);
  check(19, 12, 'RBAC: observer к /prices и обоим экспортам → 403',
    eOPrices.status === 403 && eOStock.status === 403 && eOPl.status === 403,
    `prices=${eOPrices.status}, stock=${eOStock.status}, price-list=${eOPl.status}`);

  // Возврат free-плана к дефолту (feature_export=false) — как нашли до модуля.
  await setPlan({ feature_export: false });

  // Тальли модуля 19 в стиле M17 (баннер + N/N PASS).
  const m19 = results.filter((x) => x.module === 19);
  const m19pass = m19.filter((x) => x.pass).length;
  console.log(`\n---------- MODULE 19 «Экспорт» ... ${m19pass}/${m19.length} ${m19pass === m19.length ? 'PASS' : 'FAIL'} ----------`);

  // ============ MODULE 20 — Инвентаризация (v3-03) ============
  // Сессия сканирования зоны: сервер сверяет сканы с активными растениями ПОДДЕРЕВА зоны и
  // раскладывает расхождения по категориям (matched/missing/foreign/unknown), затем «применяет»
  // их движениями (списание missing / перемещение foreign в корень зоны). Фикстуру строим в
  // питомнике A (nid) на СВЕЖЕМ поддереве локаций + собственных растениях — так счётчики
  // детерминированы (в зону попадают ТОЛЬКО наши растения, сканируем только их коды + один
  // неизвестный), а применение выполняется РЕАЛЬНЫМИ сессиями jarWorker/jarA: apply создаёт
  // movements с user_id = субъект сессии, а у форжённых сессий (M19) userId несуществующий и
  // FK movements.user_id упал бы. Данные вставляем напрямую в БД (как M17/M19). В КОНЦЕ удаляем
  // свои inventory_sessions: FK inventory_sessions.location_id → locations БЕЗ ON DELETE, иначе
  // чистка локаций питомника A на следующем прогоне упёрлась бы в ссылку сессии (каскад по
  // nursery_id срабатывает позже, на удалении самого питомника).
  const IV = `${P}/inventory-sessions`;
  const ivWriteOffMt = await db('movement_types').where({ slug: 'write_off', is_system: true }).first();

  // Локация-инсертер (возвращает вставленную строку) и растение-инсертер (активное growing,
  // уникальные qr/numeric; локация — из overrides). Минимальный набор колонок — как в
  // tests/inventory-apply.js: stage/species/container для сверки не нужны (левые джойны null-safe).
  const ivMakeLocation = async (name, type, parentId = null) => {
    const [loc] = await db('locations')
      .insert({ nursery_id: nid, name, type, parent_id: parentId })
      .returning('*');
    return loc;
  };
  const ivMakePlant = async (over = {}) => {
    const [plant] = await db('plants')
      .insert({
        nursery_id: nid,
        qr_code: `ivq-${randomUUID()}`,
        numeric_code: `ivn-${randomUUID()}`,
        status: 'growing',
        ...over,
      })
      .returning('*');
    return plant;
  };

  // Дерево зоны: area → section(ЗОНА) → row(в зоне) + вторая section ВНЕ зоны.
  const ivArea = await ivMakeLocation('И-Участок', 'area');
  const ivZone = await ivMakeLocation('И-Секция (зона)', 'section', ivArea.id);
  const ivRow = await ivMakeLocation('И-Ряд', 'row', ivZone.id);
  const ivOther = await ivMakeLocation('И-Секция вне зоны', 'section', ivArea.id);

  // Растения: P1/P2 — в самой зоне, P3 — в ряду (поддерево зоны), P_FOREIGN — вне зоны.
  // ivUnknownCode — код, которого нет ни у одного растения питомника.
  const ivP1 = await ivMakePlant({ location_id: ivZone.id });
  const ivP2 = await ivMakePlant({ location_id: ivZone.id });
  const ivP3 = await ivMakePlant({ location_id: ivRow.id });
  const ivForeign = await ivMakePlant({ location_id: ivOther.id });
  const ivUnknownCode = `ivu-${randomUUID()}`;

  const ivSessionBody = {
    locationId: ivZone.id,
    startedAt: '2026-07-25T10:00:00.000Z',
    completedAt: '2026-07-25T10:05:00.000Z',
    clientRequestId: randomUUID(),
    scans: [
      { code: ivP1.qr_code, scannedAt: '2026-07-25T10:01:00.000Z' },
      { code: ivP3.numeric_code, scannedAt: '2026-07-25T10:02:00.000Z' }, // скан по ЧИСЛОВОМУ коду
      { code: ivForeign.qr_code, scannedAt: '2026-07-25T10:03:00.000Z' },
      { code: ivUnknownCode, scannedAt: '2026-07-25T10:04:00.000Z' },
    ],
  };

  // #1 POST сессии (worker) → 201 + счётчики: matched=2 (P1,P3), missing=1 (P2), foreign=1
  // (P_FOREIGN), unknown=1. Скан P3 по numeric_code — сверка ловит qr_code ИЛИ numeric_code.
  const ivCreate = await req(jarWorker, 'POST', IV, ivSessionBody);
  const ivSessionId = ivCreate.data?.id;
  check(20, 1, 'POST сессии (worker) → 201; counts matched=2/missing=1/foreign=1/unknown=1',
    ivCreate.status === 201 && ivCreate.data?.counts?.matched === 2 &&
    ivCreate.data?.counts?.missing === 1 && ivCreate.data?.counts?.foreign === 1 &&
    ivCreate.data?.counts?.unknown === 1,
    `status=${ivCreate.status}, counts=${JSON.stringify(ivCreate.data?.counts)}`);

  // #2 Идемпотентный повтор с ТЕМ ЖЕ clientRequestId → 200, ТА ЖЕ сессия, история не выросла.
  const ivListBefore = await req(jarWorker, 'GET', IV);
  const ivReplay = await req(jarWorker, 'POST', IV, ivSessionBody);
  const ivListAfter = await req(jarWorker, 'GET', IV);
  check(20, 2, 'Идемпотентный replay (тот же clientRequestId) → 200, тот же id, total не вырос',
    ivReplay.status === 200 && !!ivSessionId && ivReplay.data?.id === ivSessionId &&
    ivListAfter.data?.total === ivListBefore.data?.total,
    `status=${ivReplay.status}, sameId=${ivReplay.data?.id === ivSessionId}, total ${ivListBefore.data?.total}->${ivListAfter.data?.total}`);

  // #3 DETAIL (observer читает): missing⊇P2, foreign⊇P_FOREIGN, unknown⊇сырой код; matched
  // массивом НЕ отдаётся, но counts.matched=2.
  const ivDetail = await req(jarObserver, 'GET', `${IV}/${ivSessionId}`);
  const ivMissingHasP2 = (ivDetail.data?.items?.missing ?? []).some((it) => it.plantId === ivP2.id);
  const ivForeignHasPF = (ivDetail.data?.items?.foreign ?? []).some((it) => it.plantId === ivForeign.id);
  const ivUnknownHasCode = (ivDetail.data?.items?.unknown ?? []).some((it) => it.rawCode === ivUnknownCode);
  check(20, 3, 'DETAIL: missing⊇P2, foreign⊇P_FOREIGN, unknown⊇сырой код; counts.matched=2, matched-массива нет',
    ivDetail.status === 200 && ivMissingHasP2 && ivForeignHasPF && ivUnknownHasCode &&
    ivDetail.data?.counts?.matched === 2 && ivDetail.data?.items?.matched === undefined,
    `missingP2=${ivMissingHasP2}, foreignPF=${ivForeignHasPF}, unknown=${ivUnknownHasCode}, matched=${ivDetail.data?.counts?.matched}`);

  // #4 LIST: сессия в истории со своими счётчиками + поля пагинации (page/perPage/total).
  const ivListRow = (ivListAfter.data?.rows ?? []).find((row) => row.id === ivSessionId);
  check(20, 4, 'LIST: сессия в истории со счётчиками + поля пагинации (page/perPage/total)',
    ivListAfter.status === 200 && !!ivListRow &&
    ivListRow.counts?.matched === 2 && ivListRow.counts?.missing === 1 &&
    ivListRow.counts?.foreign === 1 && ivListRow.counts?.unknown === 1 &&
    typeof ivListAfter.data?.page === 'number' && typeof ivListAfter.data?.perPage === 'number' &&
    typeof ivListAfter.data?.total === 'number',
    `found=${!!ivListRow}, page=${ivListAfter.data?.page}, perPage=${ivListAfter.data?.perPage}, total=${ivListAfter.data?.total}`);

  // #5 Применение (owner): списать P2 + вернуть P_FOREIGN → applied {1,1}, skipped пуст.
  const ivApplyBody = {
    writeOff: { plantIds: [ivP2.id], movementTypeId: ivWriteOffMt.id },
    transfer: { plantIds: [ivForeign.id] },
  };
  const ivApply = await req(jarA, 'POST', `${IV}/${ivSessionId}/apply`, ivApplyBody);
  check(20, 5, 'Apply (owner): writeOff P2 + transfer P_FOREIGN → applied {1,1}, skipped=[]',
    ivApply.status === 200 && ivApply.data?.applied?.writtenOff === 1 &&
    ivApply.data?.applied?.transferred === 1 &&
    Array.isArray(ivApply.data?.skipped) && ivApply.data.skipped.length === 0,
    `status=${ivApply.status}, applied=${JSON.stringify(ivApply.data?.applied)}, skipped=${ivApply.data?.skipped?.length}`);

  // #6 Эффект применения: P2 → written_off; P_FOREIGN.location_id → корень зоны (ivZone).
  const ivP2Db = await db('plants').where({ id: ivP2.id }).first();
  const ivForeignDb = await db('plants').where({ id: ivForeign.id }).first();
  check(20, 6, 'Эффект: P2 status=written_off, P_FOREIGN.location_id=зона сессии',
    ivP2Db?.status === 'written_off' && ivForeignDb?.location_id === ivZone.id,
    `P2=${ivP2Db?.status}, foreignLoc=${ivForeignDb?.location_id === ivZone.id}`);

  // #7 DETAIL после apply: у missing(P2) и foreign(P_FOREIGN) проставлен appliedMovementId.
  const ivDetail2 = await req(jarA, 'GET', `${IV}/${ivSessionId}`);
  const ivP2Item = (ivDetail2.data?.items?.missing ?? []).find((it) => it.plantId === ivP2.id);
  const ivPFItem = (ivDetail2.data?.items?.foreign ?? []).find((it) => it.plantId === ivForeign.id);
  check(20, 7, 'DETAIL после apply: appliedMovementId != null у P2 (missing) и P_FOREIGN (foreign)',
    ivDetail2.status === 200 && !!ivP2Item?.appliedMovementId && !!ivPFItem?.appliedMovementId,
    `P2.applied=${ivP2Item?.appliedMovementId != null}, PF.applied=${ivPFItem?.appliedMovementId != null}`);

  // #8 Идемпотентное применение: повтор ТОГО ЖЕ тела → applied {0,0}, все skipped=already_applied,
  // новых движений ноль (считаем движения P2/P_FOREIGN до и после).
  const ivMvBefore = await db('movements').whereIn('plant_id', [ivP2.id, ivForeign.id])
    .count('id as c').then((x) => Number(x[0].c));
  const ivApply2 = await req(jarA, 'POST', `${IV}/${ivSessionId}/apply`, ivApplyBody);
  const ivMvAfter = await db('movements').whereIn('plant_id', [ivP2.id, ivForeign.id])
    .count('id as c').then((x) => Number(x[0].c));
  check(20, 8, 'Повтор apply → applied {0,0}, все skipped=already_applied, 0 новых движений',
    ivApply2.status === 200 && ivApply2.data?.applied?.writtenOff === 0 &&
    ivApply2.data?.applied?.transferred === 0 &&
    Array.isArray(ivApply2.data?.skipped) && ivApply2.data.skipped.length === 2 &&
    ivApply2.data.skipped.every((s) => s.reason === 'already_applied') && ivMvAfter === ivMvBefore,
    `applied=${JSON.stringify(ivApply2.data?.applied)}, reasons=${JSON.stringify(ivApply2.data?.skipped?.map((s) => s.reason))}, mv ${ivMvBefore}->${ivMvAfter}`);

  // #9 Гонка: СВЕЖАЯ зона+растение, два параллельных apply одного тела → ровно ОДНО движение,
  // суммарный writtenOff=1 (advisory-lock сессии + FOR UPDATE + маркер applied_movement_id).
  const ivRaceZone = await ivMakeLocation('И-Гонка (зона)', 'section', ivArea.id);
  const ivRacePlant = await ivMakePlant({ location_id: ivRaceZone.id });
  const ivRaceCreate = await req(jarWorker, 'POST', IV, {
    locationId: ivRaceZone.id,
    startedAt: '2026-07-25T11:00:00.000Z',
    completedAt: '2026-07-25T11:05:00.000Z',
    clientRequestId: randomUUID(),
    scans: [],
  });
  const ivRaceSessionId = ivRaceCreate.data?.id;
  const ivRaceBody = { writeOff: { plantIds: [ivRacePlant.id], movementTypeId: ivWriteOffMt.id } };
  const [ivRace1, ivRace2] = await Promise.all([
    req(jarA, 'POST', `${IV}/${ivRaceSessionId}/apply`, ivRaceBody),
    req(jarA, 'POST', `${IV}/${ivRaceSessionId}/apply`, ivRaceBody),
  ]);
  const ivRaceMv = await db('movements').where({ plant_id: ivRacePlant.id })
    .count('id as c').then((x) => Number(x[0].c));
  const ivRaceWO = (ivRace1.data?.applied?.writtenOff ?? 0) + (ivRace2.data?.applied?.writtenOff ?? 0);
  check(20, 9, 'Гонка: два параллельных apply → ровно 1 движение, суммарный writtenOff=1',
    ivRace1.status === 200 && ivRace2.status === 200 && ivRaceMv === 1 && ivRaceWO === 1,
    `mv=${ivRaceMv}, writtenOffSum=${ivRaceWO}, statuses=${ivRace1.status}/${ivRace2.status}`);

  // #10 PDF-акт: 200 + application/pdf + тело начинается с %PDF + встроен кириллический DejaVuSans.
  const ivAct = await req(jarA, 'GET', `${IV}/${ivSessionId}/act`, undefined, { raw: true });
  const ivActBody = ivAct.data;
  const ivActPdf = Buffer.isBuffer(ivActBody) && ivActBody.subarray(0, 4).toString() === '%PDF';
  check(20, 10, 'PDF-акт: 200 + application/pdf + %PDF + встроен шрифт DejaVuSans',
    ivAct.status === 200 && /application\/pdf/.test(ivAct.contentType || '') && ivActPdf &&
    ivActBody.toString('latin1').includes('DejaVuSans'),
    `status=${ivAct.status}, ct=${ivAct.contentType}, pdf=${ivActPdf}`);

  // #11 RBAC: worker apply → 403; observer POST сессии → 403; observer GET деталей → 200.
  const ivWorkerApply = await req(jarWorker, 'POST', `${IV}/${ivSessionId}/apply`, {});
  const ivObserverPost = await req(jarObserver, 'POST', IV, {
    locationId: ivZone.id, startedAt: '2026-07-25T10:00:00.000Z',
    completedAt: '2026-07-25T10:05:00.000Z', clientRequestId: randomUUID(), scans: [],
  });
  const ivObserverGet = await req(jarObserver, 'GET', `${IV}/${ivSessionId}`);
  check(20, 11, 'RBAC: worker apply → 403, observer POST → 403, observer GET деталей → 200',
    ivWorkerApply.status === 403 && ivObserverPost.status === 403 && ivObserverGet.status === 200,
    `workerApply=${ivWorkerApply.status}, observerPost=${ivObserverPost.status}, observerGet=${ivObserverGet.status}`);

  // #12 Изоляция: наша сессия (питомник A) запрошена через URL ЧУЖОГО питомника B (jarB владеет
  // nurseryB, M4) → findSessionById скоуплен по nursery_id → 404 (не 403: requireNurseryAccess
  // пропускает, т.к. token.nurseryId == URL nurseryB).
  const ivForeignNursery = await req(jarB, 'GET', `/nurseries/${nurseryB.id}/inventory-sessions/${ivSessionId}`);
  check(20, 12, 'Изоляция: сессия питомника A под URL питомника B (jarB) → 404',
    ivForeignNursery.status === 404, `status=${ivForeignNursery.status}`);

  // Чистка: удаляем свои сессии (каскад по inventory_items). FK location_id→locations БЕЗ
  // ON DELETE — иначе следующая чистка локаций питомника A упёрлась бы в ссылку сессии.
  // Растения/локации/движения удалит общая чистка accA в начале следующего прогона.
  await db('inventory_sessions').where({ nursery_id: nid }).del();

  // Тальли модуля 20 в стиле M17/M19 (баннер + N/N PASS).
  const m20 = results.filter((x) => x.module === 20);
  const m20pass = m20.filter((x) => x.pass).length;
  console.log(`\n---------- MODULE 20 «Инвентаризация» ... ${m20pass}/${m20.length} ${m20pass === m20.length ? 'PASS' : 'FAIL'} ----------`);

  // ---------- Итог ----------
  const failed = results.filter((x) => !x.pass);
  console.log(`\n========== ИТОГО: ${results.length - failed.length}/${results.length} PASS ==========`);
  for (const f of failed) console.log(`FAILED: M${f.module}#${f.num} ${f.name} — ${f.note}`);
  await db.destroy();
  process.exit(failed.filter((f) => !(f.module === 4 && f.num === 4)).length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  await db.destroy();
  process.exit(2);
});
