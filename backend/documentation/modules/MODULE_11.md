# MODULE_11 — Backend: Движения

**Зависит от:** MODULE_9

---

## Ключевое изменение схемы

`movements` хранит `type_id` (FK на `movement_types`), а не строковый `type`.
Итоговый статус растения берётся из `movement_types.sets_status`.

---

## Шаг 2. Validators

`src/utils/validators/movement.validators.js`:

```js
import { z } from 'zod';
import { MOVEMENT_TYPES } from '@/constants/movement.constants.js';

export const createMovementSchema = z.object({
  typeId: z.string().uuid(),
  fromLocationId: z.string().uuid().optional().nullable(),
  toLocationId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  notes: z.string().max(2000).optional().nullable(),
});
```

---

## Шаг 3. Repository

`src/repositories/movement.repository.js`:

```js
import db from '@/config/knex.js';

export function findByPlant(plantId) {
  return db('movements')
    .where({ plant_id: plantId })
    .leftJoin('locations as from_loc', 'movements.from_location_id', 'from_loc.id')
    .leftJoin('locations as to_loc', 'movements.to_location_id', 'to_loc.id')
    .leftJoin('users', 'movements.user_id', 'users.id')
    .select(
      'movements.*',
      'from_loc.name as from_location_name',
      'to_loc.name as to_location_name',
      'users.name as user_name'
    )
    .orderBy('movements.created_at', 'desc');
}

export function findByNurseryAndId(nurseryId, id) {
  return db('movements')
    .join('plants', 'movements.plant_id', 'plants.id')
    .where('movements.id', id)
    .where('plants.nursery_id', nurseryId)
    .select('movements.*')
    .first();
}

export function create(data) {
  return db('movements').insert(data).returning('*').then(rows => rows[0]);
}

export function deleteById(id) {
  return db('movements').where({ id }).delete();
}
```

---

## Шаг 4. Service

`src/services/movement.service.js`:

```js
import * as movementRepo from '@/repositories/movement.repository.js';
import * as plantRepo from '@/repositories/plant.repository.js';
import { AppError } from '@/utils/AppError.js';
import {
  STATUS_BY_MOVEMENT,
  CLOSED_STATUSES,
} from '@/constants/movement.constants.js';
import { STRUCTURE_ROLES } from '@/constants/roles.constants.js';

export function getMovements(plantId) {
  return movementRepo.findByPlant(plantId);
}

export async function createMovement(nurseryId, plantId, userId, data) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, plantId);
  if (!plant) throw new AppError('Растение не найдено', 404);

  if (CLOSED_STATUSES.includes(plant.status)) {
    throw new AppError('Нельзя добавлять движения к проданному или списанному растению', 400);
  }

  const movementType = await db('movement_types').where({ id: data.typeId, is_active: true }).first();
  if (!movementType) throw new AppError('Тип движения не найден', 404);

  const movement = await movementRepo.create({
    plant_id: plantId,
    user_id: userId,
    type_id: data.typeId,
    from_location_id: data.fromLocationId ?? plant.location_id,
    to_location_id: data.toLocationId ?? null,
    quantity: data.quantity,
    notes: data.notes ?? null,
  });

  await applyMovementToPlant(plantId, movementType.sets_status, data.toLocationId);

  return movement;
}

export async function deleteMovement(nurseryId, id, userRole) {
  if (!STRUCTURE_ROLES.includes(userRole)) {
    throw new AppError('Недостаточно прав для удаления движения', 403);
  }

  const movement = await movementRepo.findByNurseryAndId(nurseryId, id);
  if (!movement) throw new AppError('Движение не найдено', 404);

  return movementRepo.deleteById(id);
}

// ── helpers ───────────────────────────────────────────────────────────────

async function applyMovementToPlant(plantId, setsStatus, toLocationId) {
  const updates = {};
  if (setsStatus) updates.status = setsStatus;
  if (toLocationId) updates.location_id = toLocationId;

  if (Object.keys(updates).length > 0) {
    await plantRepo.updateById(plantId, updates);
  }
}
```

---

## Шаг 5. Controller

`src/controllers/movement.controller.js`:

```js
import * as movementService from '@/services/movement.service.js';

export const getMovements = async (req, res, next) => {
  try {
    res.json(await movementService.getMovements(req.params.plantId));
  } catch (err) { next(err); }
};

export const createMovement = async (req, res, next) => {
  try {
    const movement = await movementService.createMovement(
      req.params.nurseryId,
      req.params.plantId,
      req.user.userId,
      req.body
    );
    res.status(201).json(movement);
  } catch (err) { next(err); }
};

export const deleteMovement = async (req, res, next) => {
  try {
    await movementService.deleteMovement(req.params.nurseryId, req.params.id, req.user.role);
    res.status(204).send();
  } catch (err) { next(err); }
};
```

---

## Шаг 6. Router

`src/routes/movement.router.js`:

```js
import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import { WRITE_ROLES } from '@/constants/roles.constants.js';
import * as movementController from '@/controllers/movement.controller.js';
import { createMovementSchema } from '@/utils/validators/movement.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', movementController.getMovements);
router.post('/', requireRole(...WRITE_ROLES), validate(createMovementSchema), movementController.createMovement);
router.delete('/:id', movementController.deleteMovement);

export default router;
```

Подключить в `app.js`:

```js
import movementRouter from '@/routes/movement.router.js';
app.use('/api/nurseries/:nurseryId/plants/:plantId/movements', movementRouter);
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | `movements.type_id` ссылается на `movement_types.id` | Проверка FK и успешного `POST` с `typeId` |
| 2 | `sets_status` меняет статус растения | Тип с `sets_status='sold'` -> `plants.status='sold'` |
| 3 | `to_location_id` обновляет `plants.location_id` | `POST .../movements` с `toLocationId` |
| 4 | Движение для проданного растения → 400 | Растение `sold`, `POST .../movements` |
| 5 | Worker может создать движение | Войти как worker, `POST .../movements` → 201 |
| 6 | Observer не может создать движение → 403 | Войти как observer, `POST .../movements` |
| 7 | Удаление движения worker → 403 | Войти как worker, `DELETE .../movements/:id` |
| 8 | История движений содержит имена локаций | `GET .../movements` → поля `from_location_name`, `to_location_name` |

Реализовано — критерии 1–8 прогнаны скриптом `backend/scripts/acceptance-check.mjs` (2026-06-12).
