import { beforeEach, describe, expect, it } from 'vitest';

import {
  api,
  createOwnerWithNursery,
  loginStaff,
  setFreePlan,
  uniqueEmail,
} from './helpers.js';

// T13 — сводная RBAC-матрица «роль × ключевой эндпоинт». Закрывает пробелы по
// per-role negatives: для каждой роли проверяем и разрешённые, и запрещённые
// маршруты. Все staff-роли входят НАСТОЯЩИМ логином (loginStaff, B11), а не
// напрямую подписанным токеном. Модель ролей (backend/src/constants/roles.constants.js):
//   STRUCTURE_ROLES = owner + agronomist         (структура/справочники/реестр)
//   WRITE_ROLES     = owner + agronomist + worker (движения/операции)
//   STAFF_ROLES     = owner                        (управление сотрудниками)
// observer — только чтение.

const TEMP_PASSWORD = 'Staff123!';
const ALL_ROLES = ['owner', 'agronomist', 'worker', 'observer'];
// Несуществующие, но валидные по форме id — RBAC-гейт роутера срабатывает раньше,
// чем контроллер проверит существование (для запрещённых ролей → 403 в любом случае).
const FAKE_UUID = '00000000-0000-4000-8000-000000000000';

// Создаёт сотрудника нужной роли через staff-API и возвращает cookie реального логина.
async function cookieFor(fixture, role) {
  if (role === 'owner') {
    return fixture.cookie;
  }
  const email = uniqueEmail(role);
  await api()
    .post(`/api/nurseries/${fixture.nurseryId}/users`)
    .set('Cookie', fixture.cookie)
    .send({ name: `${role} user`, role, email, password: TEMP_PASSWORD });
  const { cookie } = await loginStaff({ email, password: TEMP_PASSWORD });
  return cookie;
}

// WRITE-маршруты: allowed — роли, проходящие requireRole-гейт. Остальные → строго 403.
const WRITE_MATRIX = [
  {
    name: 'POST /locations',
    method: 'post',
    path: (id) => `/api/nurseries/${id}/locations`,
    body: { name: 'Area', type: 'area' },
    allowed: ['owner', 'agronomist'],
  },
  {
    name: 'POST /plants',
    method: 'post',
    path: (id) => `/api/nurseries/${id}/plants`,
    body: { variety: 'Matrix variety' },
    allowed: ['owner', 'agronomist'],
  },
  {
    name: 'POST /movement-types (справочник)',
    method: 'post',
    path: (id) => `/api/nurseries/${id}/movement-types`,
    body: { name: 'Custom MT', slug: `mt-${Date.now()}`, sets_status: 'growing' },
    allowed: ['owner', 'agronomist'],
  },
  {
    name: 'POST /tags (справочник)',
    method: 'post',
    path: (id) => `/api/nurseries/${id}/tags`,
    body: { name: 'Matrix tag', color: '#00FF00' },
    allowed: ['owner', 'agronomist'],
  },
  {
    name: 'POST /plants/:id/movements',
    method: 'post',
    path: (id) => `/api/nurseries/${id}/plants/${FAKE_UUID}/movements`,
    body: {},
    allowed: ['owner', 'agronomist', 'worker'],
  },
  {
    name: 'POST /plants/:id/operations',
    method: 'post',
    path: (id) => `/api/nurseries/${id}/plants/${FAKE_UUID}/operations`,
    body: {},
    allowed: ['owner', 'agronomist', 'worker'],
  },
  {
    name: 'POST /users (сотрудники)',
    method: 'post',
    path: (id) => `/api/nurseries/${id}/users`,
    body: { name: 'New staff', role: 'worker', email: 'matrix.staff@palisad.test', password: TEMP_PASSWORD },
    allowed: ['owner'],
  },
];

// READ-маршруты: роль-гейта нет — доступны всем аутентифицированным ролям питомника.
const READ_MATRIX = [
  { name: 'GET /locations', path: (id) => `/api/nurseries/${id}/locations` },
  { name: 'GET /plants', path: (id) => `/api/nurseries/${id}/plants` },
  { name: 'GET /movement-types', path: (id) => `/api/nurseries/${id}/movement-types` },
  { name: 'GET /notifications', path: (id) => `/api/nurseries/${id}/notifications` },
];

// notifications: чтение открыто всем ролям, но negatives (401/403) раньше не проверялись.
const NOTIFICATION_ENDPOINTS = [
  { name: 'GET /notifications', method: 'get', path: (id) => `/api/nurseries/${id}/notifications` },
  {
    name: 'PATCH /notifications/:id/read',
    method: 'patch',
    path: (id) => `/api/nurseries/${id}/notifications/${FAKE_UUID}/read`,
  },
  {
    name: 'POST /notifications/read-all',
    method: 'post',
    path: (id) => `/api/nurseries/${id}/notifications/read-all`,
  },
];

const writeCells = WRITE_MATRIX.flatMap((route) =>
  ALL_ROLES.map((role) => {
    const allowed = route.allowed.includes(role);
    return { route, role, allowed, outcome: allowed ? 'проходит гейт' : '403' };
  })
);

const readCells = READ_MATRIX.flatMap((route) => ALL_ROLES.map((role) => ({ route, role })));

describe('T13 — RBAC-матрица (роль × эндпоинт)', () => {
  let ctx;

  beforeEach(async () => {
    await setFreePlan({ user_limit: 50, plant_limit: 1000, nursery_limit: 5, feature_tags: true });
    ctx = await createOwnerWithNursery();
  });

  describe('WRITE-маршруты: разрешённые роли проходят, запрещённые → строго 403', () => {
    it.each(writeCells)('$route.name × $role → $outcome', async ({ route, role, allowed }) => {
      const cookie = await cookieFor(ctx, role);
      const res = await api()[route.method](route.path(ctx.nurseryId))
        .set('Cookie', cookie)
        .send(route.body);

      if (allowed) {
        // Роль прошла requireRole. Дальше возможны 2xx/400/404 (валидация/бизнес-логика) —
        // это вне зоны RBAC. Важно, что гейт НЕ отклонил (не 401 и не 403).
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      } else {
        // requireRole отрабатывает до validate → строго 403 (а не двусмысленный 400/403).
        expect(res.status).toBe(403);
      }
    });
  });

  describe('READ-маршруты: доступны всем ролям питомника', () => {
    it.each(readCells)('$route.name × $role → 200', async ({ route, role }) => {
      const cookie = await cookieFor(ctx, role);
      const res = await api().get(route.path(ctx.nurseryId)).set('Cookie', cookie);
      expect(res.status).toBe(200);
    });
  });

  // Явный однозначный worker-negative в справочнике: строго 403, даже если тело мусорное
  // (requireRole срабатывает раньше validate — иначе был бы двусмысленный 400).
  it('worker в справочнике → строго 403 даже с невалидным телом', async () => {
    const cookie = await cookieFor(ctx, 'worker');
    const res = await api()
      .post(`/api/nurseries/${ctx.nurseryId}/movement-types`)
      .set('Cookie', cookie)
      .send({ garbage: true });
    expect(res.status).toBe(403);
  });

  // Ранее отсутствовавшие negatives для notifications: без токена → 401, чужой питомник → 403.
  describe('notifications — negatives (пробел аудита)', () => {
    it.each(NOTIFICATION_ENDPOINTS)('$name без токена → 401', async ({ method, path }) => {
      const res = await api()[method](path(ctx.nurseryId));
      expect(res.status).toBe(401);
    });

    it.each(NOTIFICATION_ENDPOINTS)('$name из чужого питомника → 403', async ({ method, path }) => {
      const foreign = await createOwnerWithNursery({ nurseryName: 'Foreign Nursery' });
      const res = await api()[method](path(ctx.nurseryId)).set('Cookie', foreign.cookie);
      expect(res.status).toBe(403);
    });
  });
});
