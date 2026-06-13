# MODULE_6 — Backend: Подписка и тарифные планы

**Зависит от:** MODULE_3

---

## Шаг 1. Validators

`src/utils/validators/subscription.validators.js`:

```js
import { z } from 'zod';

export const changePlanSchema = z.object({
  planId: z.string().uuid(),
});
```

---

## Шаг 2. Repository — дополнение

`src/repositories/subscription.repository.js` — добавить:

```js
export function getAllPlans() {
  return db('plans').where({ is_active: true }).orderBy('created_at', 'asc');
}

export function cancelActive(accountId) {
  return db('subscriptions')
    .where({ account_id: accountId })
    .whereIn('status', ['trial', 'active'])
    .update({ status: 'cancelled', cancelled_at: db.fn.now(), updated_at: db.fn.now() });
}

export function getPlanById(id) {
  return db('plans').where({ id, is_active: true }).first();
}
```

---

## Шаг 3. Хелперы checkLimit и checkFeature

`src/utils/planGuards.js`:

```js
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';

async function getActivePlan(accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub) throw new AppError('Активная подписка не найдена', 403);
  return sub;
}

export async function checkLimit(accountId, resource, currentCount) {
  const plan = await getActivePlan(accountId);
  const limit = plan[resource];
  if (limit === null) return; // безлимит
  if (currentCount >= limit) {
    throw new AppError(`Достигнут лимит по плану: ${resource}`, 403);
  }
}

export async function checkFeature(accountId, feature) {
  const plan = await getActivePlan(accountId);
  if (!plan[feature]) {
    throw new AppError(`Функция недоступна в текущем плане: ${feature}`, 403);
  }
}
```

> Эти две функции импортируются во всех последующих сервисах перед созданием объектов и перед использованием платных фич.

---

## Шаг 4. Service

`src/services/subscription.service.js`:

```js
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';

export async function getCurrent(accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub) throw new AppError('Активная подписка не найдена', 404);
  return sub;
}

export function getPlans() {
  return subscriptionRepo.getAllPlans();
}

export async function changePlan(accountId, planId) {
  const plan = await subscriptionRepo.getPlanById(planId);
  if (!plan) throw new AppError('План не найден', 404);

  await subscriptionRepo.cancelActive(accountId);

  return subscriptionRepo.create({
    account_id: accountId,
    plan_id: planId,
    status: 'active',
  });
}
```

---

## Шаг 5. Controller

`src/controllers/subscription.controller.js`:

```js
import * as subscriptionService from '@/services/subscription.service.js';

export async function getCurrent(req, res, next) {
  try {
    const sub = await subscriptionService.getCurrent(req.user.accountId);
    res.json(sub);
  } catch (err) {
    next(err);
  }
}

export async function getPlans(req, res, next) {
  try {
    const plans = await subscriptionService.getPlans();
    res.json(plans);
  } catch (err) {
    next(err);
  }
}

export async function changePlan(req, res, next) {
  try {
    const sub = await subscriptionService.changePlan(req.user.accountId, req.body.planId);
    res.json(sub);
  } catch (err) {
    next(err);
  }
}
```

---

## Шаг 6. Router

`src/routes/subscription.router.js`:

```js
import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { validate } from '@/middlewares/validate.js';
import * as subscriptionController from '@/controllers/subscription.controller.js';
import { changePlanSchema } from '@/utils/validators/subscription.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/current', subscriptionController.getCurrent);
router.get('/plans', subscriptionController.getPlans);
router.post('/change', validate(changePlanSchema), subscriptionController.changePlan);

export default router;
```

Подключить в `app.js`:

```js
import subscriptionRouter from '@/routes/subscription.router.js';
app.use('/api/subscriptions', subscriptionRouter);
app.get('/api/plans', requireAuth, subscriptionController.getPlans);
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Получение текущей подписки с деталями плана | `GET /api/subscriptions/current` → объект со статусом и лимитами |
| 2 | Список планов возвращает только активные | `GET /api/subscriptions/plans` → нет планов с `is_active = false` |
| 3 | Смена плана отменяет старую подписку | После `POST /api/subscriptions/change` старая запись имеет `status = 'cancelled'` |
| 4 | `checkFeature` блокирует при отсутствии фичи | Вызвать `checkFeature(accountId, 'feature_tags')` при плане `free` → AppError 403 |
| 5 | `checkLimit` блокирует при превышении | `checkLimit(accountId, 'plant_limit', 300)` при лимите 300 → AppError 403 |
| 6 | Несуществующий planId → 404 | `POST /api/subscriptions/change` с невалидным UUID |

Реализовано — критерии 1–6 прогнаны скриптом `backend/scripts/acceptance-check.mjs` (2026-06-12).
