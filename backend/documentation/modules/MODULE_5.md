# MODULE_5 — Backend: Управление сотрудниками

**Зависит от:** MODULE_4

---

## Шаг 1. Validators

`src/utils/validators/staff.validators.js`:

```js
import { z } from 'zod';
import { ROLES } from '@/constants/roles.constants.js';

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  role: z.enum([ROLES.AGRONOMIST, ROLES.WORKER, ROLES.OBSERVER]),
  email: z.string().email().optional(),
  password: z.string().min(6),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

export const changeRoleSchema = z.object({
  role: z.enum([ROLES.AGRONOMIST, ROLES.WORKER, ROLES.OBSERVER]),
});
```

> Owner не может назначить другого `owner` через этот роут — роль `owner` исключена из enum.

---

## Шаг 2. Repository

`src/repositories/user.repository.js` — дополнить:

```js
export function findAllByNursery(nurseryId, filters = {}) {
  const query = db('users').where({ nursery_id: nurseryId });

  if (filters.role) query.where({ role: filters.role });
  if (filters.isActive !== undefined) query.where({ is_active: filters.isActive });

  return query.select('id', 'name', 'role', 'email', 'is_active', 'must_change_password', 'created_at');
}

export function findById(id) {
  return db('users').where({ id }).first();
}

export function findByNurseryAndId(nurseryId, id) {
  return db('users').where({ nursery_id: nurseryId, id }).first();
}

export function countActiveOwners(nurseryId) {
  return db('users')
    .where({ nursery_id: nurseryId, role: 'owner', is_active: true })
    .count('id as count')
    .then(rows => Number(rows[0].count));
}

export function updateById(id, data) {
  return db('users')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then(rows => rows[0]);
}
```

---

## Шаг 3. Service

`src/services/staff.service.js`:

```js
import argon2 from 'argon2';
import * as userRepo from '@/repositories/user.repository.js';
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';

export function getUsers(nurseryId, filters) {
  return userRepo.findAllByNursery(nurseryId, {
    role: filters.role,
    isActive: filters.is_active !== undefined
      ? filters.is_active === 'true'
      : undefined,
  });
}

export function getUserById(nurseryId, id) {
  return requireUser(nurseryId, id);
}

export async function createUser(nurseryId, accountId, data) {
  await checkUserLimit(nurseryId, accountId);

  const passwordHash = await argon2.hash(data.password);

  return userRepo.create({
    nursery_id: nurseryId,
    name: data.name,
    role: data.role,
    password_hash: passwordHash,
    email: data.email,
    is_active: true,
    must_change_password: true,
  });
}

export async function updateUser(nurseryId, id, data) {
  await requireUser(nurseryId, id);
  return userRepo.updateById(id, data);
}

export async function changeRole(nurseryId, id, role) {
  await requireUser(nurseryId, id);
  return userRepo.updateById(id, { role });
}

export async function toggleStatus(nurseryId, id) {
  const user = await requireUser(nurseryId, id);

  if (user.is_active) {
    await guardLastOwner(nurseryId, user);
  }

  return userRepo.updateById(id, { is_active: !user.is_active });
}

// ── helpers ───────────────────────────────────────────────────────────────

async function requireUser(nurseryId, id) {
  const user = await userRepo.findByNurseryAndId(nurseryId, id);
  if (!user) throw new AppError('Сотрудник не найден', 404);
  return user;
}

async function guardLastOwner(nurseryId, user) {
  if (user.role !== 'owner') return;
  const activeOwners = await userRepo.countActiveOwners(nurseryId);
  if (activeOwners <= 1) {
    throw new AppError('Нельзя деактивировать единственного владельца', 400);
  }
}

async function checkUserLimit(nurseryId, accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub || sub.user_limit === null) return;

  const users = await userRepo.findAllByNursery(nurseryId);
  if (users.length >= sub.user_limit) {
    throw new AppError('Достигнут лимит пользователей по текущему плану', 403);
  }
}
```

---

## Шаг 4. Controller

`src/controllers/staff.controller.js`:

```js
import * as staffService from '@/services/staff.service.js';

export async function getUsers(req, res, next) {
  try {
    const users = await staffService.getUsers(req.params.nurseryId, req.query);
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function getUserById(req, res, next) {
  try {
    const user = await staffService.getUserById(req.params.nurseryId, req.params.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const user = await staffService.createUser(
      req.params.nurseryId,
      req.user.accountId,
      req.body
    );
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const user = await staffService.updateUser(req.params.nurseryId, req.params.id, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function changeRole(req, res, next) {
  try {
    const user = await staffService.changeRole(
      req.params.nurseryId,
      req.params.id,
      req.body.role
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function toggleStatus(req, res, next) {
  try {
    const user = await staffService.toggleStatus(req.params.nurseryId, req.params.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}
```

---

## Шаг 5. Router

`src/routes/staff.router.js`:

```js
import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import { STAFF_ROLES } from '@/constants/roles.constants.js';
import * as staffController from '@/controllers/staff.controller.js';
import {
  createUserSchema,
  updateUserSchema,
  changeRoleSchema,
} from '@/utils/validators/staff.validators.js';

const router = Router({ mergeParams: true });

router.use(requireAuth, requireNurseryAccess);

router.get('/', staffController.getUsers);
router.get('/:id', staffController.getUserById);
router.post('/', requireRole(...STAFF_ROLES), validate(createUserSchema), staffController.createUser);
router.patch('/:id', requireRole(...STAFF_ROLES), validate(updateUserSchema), staffController.updateUser);
router.patch('/:id/role', requireRole(...STAFF_ROLES), validate(changeRoleSchema), staffController.changeRole);
router.patch('/:id/status', requireRole(...STAFF_ROLES), staffController.toggleStatus);

export default router;
```

Подключить в `app.js`:

```js
import staffRouter from '@/routes/staff.router.js';
app.use('/api/nurseries/:nurseryId/users', staffRouter);
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Создание сотрудника создаёт с `must_change_password = true` | `POST /api/nurseries/:id/users` → проверить поле в БД |
| 2 | Лимит пользователей соблюдается | Создать больше users чем `user_limit` в плане → 403 |
| 3 | Деактивация последнего owner → 400 | Попытка `toggleStatus` единственного owner |
| 4 | Observer не может создать сотрудника → 403 | Войти как observer, `POST .../users` |
| 5 | Фильтр по роли работает | `GET .../users?role=worker` → только workers |
| 6 | Изменение роли обновляет `updated_at` | Проверить в БД после `PATCH .../role` |
| 7 | Нельзя назначить роль `owner` через API | `PATCH .../role` с `role: 'owner'` → ошибка Zod |
