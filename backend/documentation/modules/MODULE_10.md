# MODULE_10 — Backend: Операции и фото

**Зависит от:** MODULE_9, MODULE_6

---

## Шаг 1. Константы

`src/constants/operation.constants.js`:

```js
export const OPERATION_TYPES = ['grafting', 'pruning', 'treatment', 'transplant', 'inspection', 'other'];
export const CLOSED_STATUSES = ['sold', 'written_off'];
```

---

## Шаг 2. Validators

`src/utils/validators/operation.validators.js`:

```js
import { z } from 'zod';
import { OPERATION_TYPES } from '@/constants/operation.constants.js';

export const createOperationSchema = z.object({
  type: z.enum(OPERATION_TYPES),
  newContainerId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateOperationSchema = z.object({
  type: z.enum(OPERATION_TYPES).optional(),
  newContainerId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
```

---

## Шаг 3. Repositories

`src/repositories/operation.repository.js`:

```js
import db from '@/config/knex.js';

export function findByPlant(plantId) {
  return db('operations')
    .where({ plant_id: plantId })
    .whereNull('deleted_at')
    .orderBy('created_at', 'desc');
}

export function findByPlantAndId(plantId, id) {
  return db('operations').where({ plant_id: plantId, id }).whereNull('deleted_at').first();
}

export function create(data) {
  return db('operations').insert(data).returning('*').then(rows => rows[0]);
}

export function updateById(id, data) {
  return db('operations')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then(rows => rows[0]);
}

export function softDelete(id) {
  return db('operations')
    .where({ id })
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() });
}
```

`src/repositories/photo.repository.js`:

```js
import db from '@/config/knex.js';

export function findByOperation(operationId) {
  return db('photos').where({ operation_id: operationId }).orderBy('created_at');
}

export function create(data) {
  return db('photos').insert(data).returning('*').then(rows => rows[0]);
}

export function findById(id) {
  return db('photos').where({ id }).first();
}

export function deleteById(id) {
  return db('photos').where({ id }).delete();
}
```

---

## Шаг 4. Service

`src/services/operation.service.js`:

```js
import * as operationRepo from '@/repositories/operation.repository.js';
import * as photoRepo from '@/repositories/photo.repository.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import { checkFeature } from '@/utils/planGuards.js';
import { AppError } from '@/utils/AppError.js';
import { CLOSED_STATUSES } from '@/constants/operation.constants.js';

export function getOperations(plantId) {
  return operationRepo.findByPlant(plantId);
}

export async function createOperation(nurseryId, plantId, userId, accountId, data) {
  await checkFeature(accountId, 'feature_operations');

  const plant = await plantRepo.findByNurseryAndId(nurseryId, plantId);
  if (!plant) throw new AppError('Растение не найдено', 404);
  if (CLOSED_STATUSES.includes(plant.status)) {
    throw new AppError('Нельзя добавлять операции к проданному или списанному растению', 400);
  }

  if (data.type === 'transplant') {
    if (!data.newContainerId) throw new AppError('Для transplant требуется newContainerId', 400);
    await plantRepo.updateById(plant.id, { container_id: data.newContainerId });
  }

  return operationRepo.create({
    plant_id: plantId,
    user_id: userId,
    type: data.type,
    notes: data.notes ?? null,
  });
}

export async function updateOperation(plantId, id, userId, data) {
  const operation = await requireOperation(plantId, id);
  if (operation.user_id !== userId) throw new AppError('Можно редактировать только свои операции', 403);
  return operationRepo.updateById(id, data);
}

export async function softDelete(plantId, id, userId, userRole) {
  const operation = await requireOperation(plantId, id);
  const isOwner = userRole === 'owner';
  const isAuthor = operation.user_id === userId;
  if (!isOwner && !isAuthor) throw new AppError('Нет прав на удаление этой операции', 403);
  return operationRepo.softDelete(id);
}

export async function attachPhoto(plantId, operationId, accountId, url) {
  await checkFeature(accountId, 'feature_photos');
  await requireOperation(plantId, operationId);
  return photoRepo.create({ operation_id: operationId, url });
}

export async function deletePhoto(plantId, operationId, photoId) {
  await requireOperation(plantId, operationId);
  const photo = await photoRepo.findById(photoId);
  if (!photo || photo.operation_id !== operationId) throw new AppError('Фото не найдено', 404);
  return photoRepo.deleteById(photoId);
}

async function requireOperation(plantId, id) {
  const op = await operationRepo.findByPlantAndId(plantId, id);
  if (!op) throw new AppError('Операция не найдена', 404);
  return op;
}
```

> Для `transplant` контейнер растения обновляется в `plants.container_id`, а в activity/details фиксируются старый и новый container type.

---

## Шаг 5. Controller

`src/controllers/operation.controller.js`:

```js
import * as operationService from '@/services/operation.service.js';

export const getOperations = async (req, res, next) => {
  try {
    res.json(await operationService.getOperations(req.params.plantId));
  } catch (err) { next(err); }
};

export const createOperation = async (req, res, next) => {
  try {
    const op = await operationService.createOperation(
      req.params.nurseryId,
      req.params.plantId,
      req.user.userId,
      req.user.accountId,
      req.body
    );
    res.status(201).json(op);
  } catch (err) { next(err); }
};

export const updateOperation = async (req, res, next) => {
  try {
    res.json(await operationService.updateOperation(
      req.params.plantId,
      req.params.id,
      req.user.userId,
      req.body
    ));
  } catch (err) { next(err); }
};

export const softDelete = async (req, res, next) => {
  try {
    await operationService.softDelete(
      req.params.plantId,
      req.params.id,
      req.user.userId,
      req.user.role
    );
    res.status(204).send();
  } catch (err) { next(err); }
};

export const attachPhoto = async (req, res, next) => {
  try {
    const photo = await operationService.attachPhoto(
      req.params.plantId,
      req.params.id,
      req.user.accountId,
      req.body.url
    );
    res.status(201).json(photo);
  } catch (err) { next(err); }
};

export const deletePhoto = async (req, res, next) => {
  try {
    await operationService.deletePhoto(req.params.plantId, req.params.id, req.params.photoId);
    res.status(204).send();
  } catch (err) { next(err); }
};
```

---

## Шаг 6. Router

`src/routes/operation.router.js`:

```js
import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import { WRITE_ROLES } from '@/constants/roles.constants.js';
import * as operationController from '@/controllers/operation.controller.js';
import { createOperationSchema, updateOperationSchema } from '@/utils/validators/operation.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', operationController.getOperations);
router.post('/', requireRole(...WRITE_ROLES), validate(createOperationSchema), operationController.createOperation);
router.patch('/:id', requireRole(...WRITE_ROLES), validate(updateOperationSchema), operationController.updateOperation);
router.delete('/:id', requireRole(...WRITE_ROLES), operationController.softDelete);
router.post('/:id/photos', requireRole(...WRITE_ROLES), operationController.attachPhoto);
router.delete('/:id/photos/:photoId', requireRole(...WRITE_ROLES), operationController.deletePhoto);

export default router;
```

Подключить в `app.js`:

```js
import operationRouter from '@/routes/operation.router.js';
app.use('/api/nurseries/:nurseryId/plants/:plantId/operations', operationRouter);
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Создание операции требует `feature_operations` | `POST .../operations` при плане `free` → 403 |
| 2 | Операция для проданного растения → 400 | Установить `status = 'sold'`, создать операцию |
| 3 | Редактирование чужой операции → 403 | Войти как другой пользователь, `PATCH .../operations/:id` |
| 4 | Owner может удалить любую операцию | Войти как owner, удалить чужую операцию → 204 |
| 5 | Фото требует `feature_photos` | `POST .../photos` при плане `free` → 403 |
| 6 | `transplant` обновляет `plants.container_id` | `POST .../operations` с `type=transplant` и `newContainerId` |
| 7 | Мягкое удаление операции | `DELETE .../operations/:id` -> `deleted_at` установлен, в GET не отображается |
| 8 | Observer не может создать операцию -> 403 | Войти как observer, `POST .../operations` |

Реализовано — критерии 1–8 прогнаны скриптом `backend/scripts/acceptance-check.mjs` (2026-06-12; прикрепление фото дополнительно проверено при включённой `feature_photos`).
