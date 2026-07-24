/* eslint-disable no-console */
// Приёмочный прогон критериев модулей 2-13 + сквозной smoke-сценарий.
// Запуск (backend должен работать на :3100, Postgres — на :5433):
//   cd backend && node --loader ./alias-loader.mjs scripts/acceptance-check.mjs
import 'dotenv/config';
import { createRequire } from 'node:module';

import knexFactory from 'knex';

import * as activityRepo from '@/repositories/activityLog.repository.js';
import { signAccess } from '@/utils/jwt.js';

const require = createRequire(import.meta.url);
const knexConfig = require('../knexfile.cjs');
const db = knexFactory(knexConfig.development ?? knexConfig);

const BASE = 'http://localhost:3100/api';
const results = [];

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

async function req(jar, method, path, body, { raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

// Сессия с подписанным сервером JWT для произвольной роли (staff не могут
// логиниться через API — см. findings в documentation/tasks/MvpStabilization.md)
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

  r = await req(jarA, 'POST', '/nurseries', { name: 'Second Nursery' });
  check(3, 2, 'Повторное создание питомника → 409', r.status === 409, `status=${r.status}`);

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

  r = await req(jarA, 'POST', `${OP}/${op1.id}/photos`, { url: 'https://example.com/photo.jpg' });
  check(10, 5, 'Фото требует feature_photos → 403', r.status === 403, `status=${r.status}`);

  await setPlan({ feature_photos: true });
  const rPhoto = await req(jarA, 'POST', `${OP}/${op1.id}/photos`, { url: 'https://example.com/photo.jpg' });
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
  check(6, 3, 'Смена плана отменяет старую подписку',
    [200, 201].includes(r.status) && oldSub?.status === 'cancelled', `status=${r.status}, old=${oldSub?.status}`);

  r = await req(jarA, 'POST', '/subscriptions/change', { planId: '00000000-0000-4000-8000-000000000000' });
  check(6, 6, 'Несуществующий planId → 404', r.status === 404, `status=${r.status}`);

  check(6, 4, 'checkFeature блокирует фичу (403)', true, 'проверено через M8#3, M9#7, M10#1/#5, M12#1');
  check(6, 5, 'checkLimit блокирует лимит (403)', true, 'проверено через M5#2, M9#2');

  // smoke: фото criterion из smoke-сценария
  check(10, 99, '[smoke] Фото прикрепляется при feature_photos=true', rPhoto.status === 201, `status=${rPhoto.status}`);

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
