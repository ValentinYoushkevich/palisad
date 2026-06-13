# MODULE_3 — Backend: Управление питомником

**Зависит от:** MODULE_2

---

## Шаг 1. Константы

`src/constants/nursery.constants.js`:

```js
export const DEFAULT_OWNER_ROLE = 'owner';
```

---

## Шаг 2. Validators

`src/utils/validators/nursery.validators.js`:

```js
import { z } from 'zod';

export const createNurserySchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().max(500).optional(),
});

export const updateNurserySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  address: z.string().max(500).optional(),
});
```

---

## Шаг 3. Repository

`src/repositories/nursery.repository.js`:

```js
import db from '@/config/knex.js';

export function findByAccountId(accountId) {
  return db('nurseries').where({ account_id: accountId }).first();
}

export function findById(id) {
  return db('nurseries').where({ id }).first();
}

export function create(data) {
  return db('nurseries').insert(data).returning('*').then(rows => rows[0]);
}

export function updateById(id, data) {
  return db('nurseries')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then(rows => rows[0]);
}
```

`src/repositories/user.repository.js` — добавить:

```js
import db from '@/config/knex.js';

export function findOwnerByAccountId(accountId) {
  return db('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('nurseries.account_id', accountId)
    .where('users.role', 'owner')
    .select('users.*')
    .first();
}

export function create(data) {
  return db('users').insert(data).returning('*').then(rows => rows[0]);
}

export function clearMustChangePassword(accountId) {
  return db('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('nurseries.account_id', accountId)
    .where('users.role', 'owner')
    .update({ must_change_password: false, updated_at: db.fn.now() });
}
```

---

## Шаг 4. Service

`src/services/nursery.service.js`:

```js
import argon2 from 'argon2';
import * as nurseryRepo from '@/repositories/nursery.repository.js';
import * as userRepo from '@/repositories/user.repository.js';
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';
import { DEFAULT_OWNER_ROLE } from '@/constants/nursery.constants.js';

export async function getMyNursery(accountId) {
  const nursery = await nurseryRepo.findByAccountId(accountId);
  if (!nursery) throw new AppError('Питомник не найден', 404);
  return nursery;
}

export async function createNursery(accountId, data, ownerName, ownerEmail) {
  const existing = await nurseryRepo.findByAccountId(accountId);
  if (existing) throw new AppError('Питомник уже создан', 409);

  await checkNurseryLimit(accountId);

  const nursery = await nurseryRepo.create({ ...data, account_id: accountId });

  // Автоматически создаём owner-пользователя внутри питомника
  const passwordHash = await argon2.hash(Math.random().toString(36));
  await userRepo.create({
    nursery_id: nursery.id,
    name: ownerName,
    role: DEFAULT_OWNER_ROLE,
    password_hash: passwordHash,
    email: ownerEmail,
    is_active: true,
    must_change_password: false,
  });

  return nursery;
}

export async function updateNursery(accountId, data) {
  const nursery = await nurseryRepo.findByAccountId(accountId);
  if (!nursery) throw new AppError('Питомник не найден', 404);
  return nurseryRepo.updateById(nursery.id, data);
}

async function checkNurseryLimit(accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub) return;

  const { nursery_limit } = sub;
  if (nursery_limit === null) return;

  const count = await nurseryRepo.countByAccountId(accountId);
  if (count >= nursery_limit) {
    throw new AppError('Достигнут лимит питомников по текущему плану', 403);
  }
}
```

---

## Шаг 5. Controller

`src/controllers/nursery.controller.js`:

```js
import * as nurseryService from '@/services/nursery.service.js';

export async function getMyNursery(req, res, next) {
  try {
    const nursery = await nurseryService.getMyNursery(req.user.accountId);
    res.json(nursery);
  } catch (err) {
    next(err);
  }
}

export async function createNursery(req, res, next) {
  try {
    const nursery = await nurseryService.createNursery(
      req.user.accountId,
      req.body,
      req.user.name,
      req.user.email
    );
    res.status(201).json(nursery);
  } catch (err) {
    next(err);
  }
}

export async function updateNursery(req, res, next) {
  try {
    const nursery = await nurseryService.updateNursery(req.user.accountId, req.body);
    res.json(nursery);
  } catch (err) {
    next(err);
  }
}
```

---

## Шаг 6. Router

`src/routes/nursery.router.js`:

```js
import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { validate } from '@/middlewares/validate.js';
import * as nurseryController from '@/controllers/nursery.controller.js';
import {
  createNurserySchema,
  updateNurserySchema,
} from '@/utils/validators/nursery.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/my', nurseryController.getMyNursery);
router.post('/', validate(createNurserySchema), nurseryController.createNursery);
router.patch('/my', validate(updateNurserySchema), nurseryController.updateNursery);

export default router;
```

Подключить в `app.js`:

```js
import nurseryRouter from '@/routes/nursery.router.js';
app.use('/api/nurseries', nurseryRouter);
```

---

## Шаг 7. Subscription repository — дополнение

`src/repositories/subscription.repository.js` — добавить:

```js
export function getActiveWithPlan(accountId) {
  return db('subscriptions')
    .join('plans', 'subscriptions.plan_id', 'plans.id')
    .where('subscriptions.account_id', accountId)
    .whereIn('subscriptions.status', ['trial', 'active'])
    .select('subscriptions.*', 'plans.*')
    .orderBy('subscriptions.created_at', 'desc')
    .first();
}
```

`src/repositories/nursery.repository.js` — добавить:

```js
export function countByAccountId(accountId) {
  return db('nurseries')
    .where({ account_id: accountId })
    .count('id as count')
    .then(rows => Number(rows[0].count));
}
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Создание питомника создаёт и owner-пользователя | `POST /api/nurseries` → в таблице `users` появилась запись с `role = 'owner'` |
| 2 | Повторное создание питомника → 409 | Дважды `POST /api/nurseries` с одним аккаунтом |
| 3 | Получение питомника | `GET /api/nurseries/my` → данные питомника |
| 4 | Питомник не найден → 404 | `GET /api/nurseries/my` до создания |
| 5 | Обновление питомника обновляет `updated_at` | `PATCH /api/nurseries/my` → `updated_at` изменился в БД |
| 6 | Без токена → 401 | Запросы без cookie |

Реализовано — критерии 1–6 прогнаны скриптом `backend/scripts/acceptance-check.mjs` (2026-06-12).
