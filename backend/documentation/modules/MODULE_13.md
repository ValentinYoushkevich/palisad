# MODULE_13 — Backend: Лента активности

**Зависит от:** MODULE_9, MODULE_10, MODULE_11, MODULE_5, MODULE_7

---

## Шаг 1. Константы типов событий

`src/constants/activity.constants.js`:

```js
export const EVENT_TYPES = {
  PLANT_CREATED: 'plant.created',
  PLANT_UPDATED: 'plant.updated',
  PLANT_DELETED: 'plant.deleted',
  PLANT_RESTORED: 'plant.restored',
  PLANT_STATUS_CHANGED: 'plant.status_changed',

  OPERATION_CREATED: 'operation.created',
  OPERATION_DELETED: 'operation.deleted',
  PHOTO_ATTACHED: 'photo.attached',

  MOVEMENT_ARRIVAL: 'movement.arrival',
  MOVEMENT_SALE: 'movement.sale',
  MOVEMENT_WRITE_OFF: 'movement.write_off',
  MOVEMENT_TRANSFER: 'movement.transfer',

  LOCATION_CREATED: 'location.created',
  LOCATION_UPDATED: 'location.updated',
  LOCATION_DELETED: 'location.deleted',

  USER_CREATED: 'user.created',
  USER_DEACTIVATED: 'user.deactivated',
  USER_ROLE_CHANGED: 'user.role_changed',

  AUTH_LOGIN: 'auth.login',
};

export const ENTITY_TYPES = {
  PLANT: 'plant',
  OPERATION: 'operation',
  MOVEMENT: 'movement',
  LOCATION: 'location',
  USER: 'user',
  SUBSCRIPTION: 'subscription',
};
```

---

## Шаг 2. Хелпер logActivity

`src/utils/logActivity.js`:

```js
import db from '@/config/knex.js';
import logger from '@/config/logger.js';

export async function logActivity({ nurseryId, userId, eventType, entityType, entityId, details }) {
  try {
    await db('activity_logs').insert({
      nursery_id: nurseryId,
      user_id: userId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: details ?? null,
    });
  } catch (err) {
    // Логирование не должно роняить основной поток
    logger.error('logActivity failed', { error: err.message, eventType, entityType });
  }
}
```

> `logActivity` оборачивается в try-catch — ошибка записи лога не должна ронять бизнес-операцию.

---

## Шаг 3. Встраивание в существующие сервисы

В каждый мутирующий сервис добавить вызов после успешной операции.

Пример для `plant.service.js`:

```js
import { logActivity } from '@/utils/logActivity.js';
import { EVENT_TYPES, ENTITY_TYPES } from '@/constants/activity.constants.js';

// В createPlant — после plantRepo.create:
await logActivity({
  nurseryId,
  userId,
  eventType: EVENT_TYPES.PLANT_CREATED,
  entityType: ENTITY_TYPES.PLANT,
  entityId: plant.id,
  details: { qr_code: plant.qr_code, species: plant.genus },
});

// В softDelete — после plantRepo.softDelete:
await logActivity({
  nurseryId,
  userId,
  eventType: EVENT_TYPES.PLANT_DELETED,
  entityType: ENTITY_TYPES.PLANT,
  entityId: id,
  details: null,
});
```

Пример для `movement.service.js`:

```js
const eventTypeMap = {
  arrival: EVENT_TYPES.MOVEMENT_ARRIVAL,
  sale: EVENT_TYPES.MOVEMENT_SALE,
  write_off: EVENT_TYPES.MOVEMENT_WRITE_OFF,
  transfer: EVENT_TYPES.MOVEMENT_TRANSFER,
};

// После movementRepo.create:
await logActivity({
  nurseryId,
  userId,
  eventType: eventTypeMap[data.type],
  entityType: ENTITY_TYPES.MOVEMENT,
  entityId: movement.id,
  details: { plant_id: plantId, type: data.type },
});
```

Аналогично встраивается в: `operation.service.js`, `location.service.js`, `staff.service.js`, `auth.service.js` (только login), а также в события `transplant` и `movement` с заполнением `details`.

---

## Шаг 4. Repository

`src/repositories/activityLog.repository.js`:

```js
import db from '@/config/knex.js';

export function findByNursery(nurseryId, filters = {}, pagination = {}) {
  const { page = 1, perPage = 30 } = pagination;
  const offset = (page - 1) * perPage;

  const query = db('activity_logs')
    .where('activity_logs.nursery_id', nurseryId)
    .leftJoin('users', 'activity_logs.user_id', 'users.id')
    .select('activity_logs.*', 'users.name as user_name', 'users.role as user_role')
    .orderBy('activity_logs.created_at', 'desc');

  if (filters.userId) query.where('activity_logs.user_id', filters.userId);
  if (filters.eventType) query.where('activity_logs.event_type', filters.eventType);
  if (filters.dateFrom) query.where('activity_logs.created_at', '>=', filters.dateFrom);
  if (filters.dateTo) query.where('activity_logs.created_at', '<=', filters.dateTo);

  return query.limit(perPage).offset(offset);
}

export function countByNursery(nurseryId, filters = {}) {
  const query = db('activity_logs').where({ nursery_id: nurseryId });

  if (filters.userId) query.where({ user_id: filters.userId });
  if (filters.eventType) query.where({ event_type: filters.eventType });
  if (filters.dateFrom) query.where('created_at', '>=', filters.dateFrom);
  if (filters.dateTo) query.where('created_at', '<=', filters.dateTo);

  return query.count('id as count').then(rows => Number(rows[0].count));
}

export function deleteOlderThan(date) {
  return db('activity_logs').where('created_at', '<', date).delete();
}
```

---

## Шаг 5. Service

`src/services/activityLog.service.js`:

```js
import * as activityRepo from '@/repositories/activityLog.repository.js';

export async function getLogs(nurseryId, query) {
  const { page = 1, perPage = 30, userId, eventType, dateFrom, dateTo } = query;

  const filters = { userId, eventType, dateFrom, dateTo };
  const pagination = { page: Number(page), perPage: Number(perPage) };

  const [logs, total] = await Promise.all([
    activityRepo.findByNursery(nurseryId, filters, pagination),
    activityRepo.countByNursery(nurseryId, filters),
  ]);

  return { data: logs, total, page: pagination.page, perPage: pagination.perPage };
}
```

---

## Шаг 6. Controller и Router

`src/controllers/activityLog.controller.js`:

```js
import * as activityLogService from '@/services/activityLog.service.js';

export async function getLogs(req, res, next) {
  try {
    const result = await activityLogService.getLogs(req.params.nurseryId, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
```

`src/routes/activityLog.router.js`:

```js
import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import * as activityLogController from '@/controllers/activityLog.controller.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', activityLogController.getLogs);

export default router;
```

Подключить в `app.js`:

```js
import activityLogRouter from '@/routes/activityLog.router.js';
app.use('/api/nurseries/:nurseryId/activity', activityLogRouter);
```

---

## Шаг 7. Cron — автоудаление старых логов

`src/utils/cleanupCron.js`:

```js
import cron from 'node-cron';
import * as activityRepo from '@/repositories/activityLog.repository.js';
import logger from '@/config/logger.js';

export function startCleanupCron() {
  // Каждый день в 03:00
  cron.schedule('0 3 * * *', async () => {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const deleted = await activityRepo.deleteOlderThan(twoYearsAgo);
      logger.info(`Activity logs cleanup: removed ${deleted} records`);
    } catch (err) {
      logger.error('Activity logs cleanup failed', { error: err.message });
    }
  });
}
```

Подключить в `server.js` после старта:

```js
import { startCleanupCron } from '@/utils/cleanupCron.js';

// Внутри start(), после app.listen:
startCleanupCron();
logger.info('Cleanup cron started');
```

---

## Шаг 8. Установка node-cron

```bash
npm install node-cron
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Создание растения пишет лог | `POST .../plants` → в `activity_logs` запись с `event_type = 'plant.created'` |
| 2 | Движение пишет корректный тип лога | `POST .../movements` с типом, где `sets_status='sold'` -> лог `movement.*` |
| 3 | Ошибка записи лога не рушит операцию | Временно сломать `logActivity`, создать растение → 201, лог не записан, ошибка в Winston |
| 4 | Лента доступна всем ролям | Войти как observer, `GET .../activity` → 200 с логами |
| 5 | Фильтр по userId работает | `GET .../activity?userId=...` → только события этого пользователя |
| 6 | Фильтр по eventType работает | `GET .../activity?eventType=plant.created` |
| 7 | Пагинация работает | `GET .../activity?page=2&perPage=10` |
| 8 | Cron запускается при старте | В логах Winston: `Cleanup cron started` |
| 9 | Cron удаляет старые записи | Вручную вставить запись с `created_at = '2020-01-01'`, запустить функцию cleanup → запись удалена |

Реализовано — критерии 1–2, 4–7, 9 прогнаны скриптом `backend/scripts/acceptance-check.mjs` (2026-06-12).
Критерий 3 сверен по коду: `logActivity` обёрнут в try/catch с `logger.error`. Критерий 8 подтверждён
записью `Cleanup cron started` в `backend/logs/combined.log` при старте сервера.
