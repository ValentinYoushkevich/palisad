# MODULE_9 — Backend: Реестр растений

**Зависит от:** MODULE_7, MODULE_8

---

## Шаг 1. Утилита генерации QR-кода

`src/utils/qrCode.js`:

```js
import { nanoid } from 'nanoid';

export function generateQrCode() {
  return `PAL-${nanoid(10).toUpperCase()}`;
}
```

`numeric_code` обязателен и уникален, используется как fallback при ручном вводе.

---

## Шаг 2. Validators

`speciesId` в API — UUID строки `nursery_species` (справочник вида в питомнике), не `species_catalog`.

`src/utils/validators/plant.validators.js`:

```js
import { z } from 'zod';

export const createPlantSchema = z.object({
  speciesId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  containerId: z.string().uuid().optional().nullable(),
  variety: z.string().max(200).optional().nullable(),
  plantedAt: z.string().date().optional().nullable(),
  source: z.enum(['own', 'purchased']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const bulkCreateSchema = z.object({
  count: z.number().int().min(1).max(500),
  template: createPlantSchema,
});

export const updatePlantSchema = z.object({
  speciesId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  containerId: z.string().uuid().optional().nullable(),
  variety: z.string().max(200).optional().nullable(),
  plantedAt: z.string().date().optional().nullable(),
  source: z.enum(['own', 'purchased']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const plantFiltersSchema = z.object({
  status: z.enum(['growing', 'storage', 'sold', 'written_off']).optional(),
  speciesId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  containerId: z.string().uuid().optional(),
  numericCode: z.string().optional(),
  tagId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
});
```

---

## Шаг 3. Repository

`src/repositories/plant.repository.js`:

```js
import db from '@/config/knex.js';

export function findAllByNursery(nurseryId, filters = {}) {
  const query = db('plants')
    .where('plants.nursery_id', nurseryId)
    .whereNull('plants.deleted_at')
    .leftJoin('nursery_species', 'plants.nursery_species_id', 'nursery_species.id')
    .leftJoin('species_catalog', 'nursery_species.species_catalog_id', 'species_catalog.id')
    .leftJoin('locations', 'plants.location_id', 'locations.id')
    .leftJoin('container_types', 'plants.container_id', 'container_types.id')
    .select(
      'plants.*',
      'species_catalog.scientific_name',
      'nursery_species.display_name_ru',
      'locations.name as location_name',
      'container_types.code as container_code'
    );

  if (filters.status) query.where('plants.status', filters.status);
  if (filters.speciesId) query.where('plants.nursery_species_id', filters.speciesId);
  if (filters.locationId) query.where('plants.location_id', filters.locationId);
  if (filters.containerId) query.where('plants.container_id', filters.containerId);
  if (filters.numericCode) query.where('plants.numeric_code', filters.numericCode);
  if (filters.search) {
    query.where(function () {
      this.where('species_catalog.scientific_name', 'ilike', `%${filters.search}%`)
        .orWhere('nursery_species.display_name_ru', 'ilike', `%${filters.search}%`)
        .orWhere('plants.variety', 'ilike', `%${filters.search}%`)
        .orWhere('plants.qr_code', 'ilike', `%${filters.search}%`);
    });
  }
  if (filters.tagId) {
    query.join('plant_tags', 'plants.id', 'plant_tags.plant_id')
      .where('plant_tags.tag_id', filters.tagId);
  }

  return query;
}

export function countByNursery(nurseryId) {
  return db('plants')
    .where({ nursery_id: nurseryId })
    .whereNull('deleted_at')
    .count('id as count')
    .then(rows => Number(rows[0].count));
}

export function findById(id) {
  return db('plants').where({ id }).whereNull('deleted_at').first();
}

export function findByNurseryAndId(nurseryId, id) {
  return db('plants').where({ nursery_id: nurseryId, id }).whereNull('deleted_at').first();
}

export function findByQrCode(qrCode) {
  return db('plants').where({ qr_code: qrCode }).whereNull('deleted_at').first();
}

export function findByNumericCode(numericCode) {
  return db('plants').where({ numeric_code: numericCode }).whereNull('deleted_at').first();
}

export function create(data) {
  return db('plants').insert(data).returning('*').then(rows => rows[0]);
}

export function bulkCreate(records) {
  return db('plants').insert(records).returning('*');
}

export function updateById(id, data) {
  return db('plants')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then(rows => rows[0]);
}

export function softDelete(id) {
  return db('plants')
    .where({ id })
    .update({ deleted_at: db.fn.now(), updated_at: db.fn.now() })
    .returning('*')
    .then(rows => rows[0]);
}

export function restore(id) {
  return db('plants')
    .where({ id })
    .update({ deleted_at: null, updated_at: db.fn.now() })
    .returning('*')
    .then(rows => rows[0]);
}

export function addTag(plantId, tagId) {
  return db('plant_tags').insert({ plant_id: plantId, tag_id: tagId }).onConflict().ignore();
}

export function removeTag(plantId, tagId) {
  return db('plant_tags').where({ plant_id: plantId, tag_id: tagId }).delete();
}

export function getTagsByPlant(plantId) {
  return db('plant_tags')
    .join('tags', 'plant_tags.tag_id', 'tags.id')
    .where('plant_tags.plant_id', plantId)
    .select('tags.*');
}
```

---

## Шаг 4. Service

`src/services/plant.service.js`:

```js
import * as plantRepo from '@/repositories/plant.repository.js';
import { checkLimit, checkFeature } from '@/utils/planGuards.js';
import { generateQrCode } from '@/utils/qrCode.js';
import { AppError } from '@/utils/AppError.js';
import { ROLES } from '@/constants/roles.constants.js';

export async function getPlants(nurseryId, filters) {
  const { page, perPage, ...rest } = filters;
  const all = await plantRepo.findAllByNursery(nurseryId, rest);
  const total = all.length;
  const start = (page - 1) * perPage;
  const data = all.slice(start, start + perPage);
  return { data, total, page, perPage };
}

export async function getPlantById(nurseryId, id) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, id);
  if (!plant) throw new AppError('Растение не найдено', 404);
  const tags = await plantRepo.getTagsByPlant(id);
  return { ...plant, tags };
}

export async function findByQr(nurseryId, qrCode) {
  const plant = await plantRepo.findByQrCode(qrCode);
  if (!plant || plant.nursery_id !== nurseryId) throw new AppError('Растение не найдено', 404);
  return plant;
}

export async function findByNumericCode(nurseryId, numericCode) {
  const plant = await plantRepo.findByNumericCode(numericCode);
  if (!plant || plant.nursery_id !== nurseryId) throw new AppError('Растение не найдено', 404);
  return plant;
}

export async function createPlant(nurseryId, accountId, data) {
  const count = await plantRepo.countByNursery(nurseryId);
  await checkLimit(accountId, 'plant_limit', count);

  const qrCode = generateQrCode();
  const numericCode = String(Date.now()).slice(-8);
  return plantRepo.create({ ...data, nursery_id: nurseryId, qr_code: qrCode, numeric_code: numericCode });
}

export async function bulkCreate(nurseryId, accountId, template, count) {
  const current = await plantRepo.countByNursery(nurseryId);
  await checkLimit(accountId, 'plant_limit', current + count - 1);

  const records = Array.from({ length: count }, () => ({
    ...template,
    nursery_id: nurseryId,
    qr_code: generateQrCode(),
    numeric_code: String(Date.now() + Math.floor(Math.random() * 10000)),
  }));

  return plantRepo.bulkCreate(records);
}

export async function updatePlant(nurseryId, id, data) {
  await requirePlant(nurseryId, id);
  return plantRepo.updateById(id, data);
}

export async function softDelete(nurseryId, id) {
  await requirePlant(nurseryId, id);
  return plantRepo.softDelete(id);
}

export async function restore(nurseryId, id, user) {
  if (user.role !== ROLES.OWNER) throw new AppError('Только владелец может восстанавливать растения', 403);
  const plant = await plantRepo.findById(id);
  if (!plant || plant.nursery_id !== nurseryId) throw new AppError('Растение не найдено', 404);
  return plantRepo.restore(id);
}

export async function addTag(nurseryId, plantId, tagId, accountId) {
  await checkFeature(accountId, 'feature_tags');
  await requirePlant(nurseryId, plantId);
  return plantRepo.addTag(plantId, tagId);
}

export async function removeTag(nurseryId, plantId, tagId) {
  await requirePlant(nurseryId, plantId);
  return plantRepo.removeTag(plantId, tagId);
}

async function requirePlant(nurseryId, id) {
  const plant = await plantRepo.findByNurseryAndId(nurseryId, id);
  if (!plant) throw new AppError('Растение не найдено', 404);
  return plant;
}
```

---

## Шаг 5. Controller

`src/controllers/plant.controller.js`:

```js
import * as plantService from '@/services/plant.service.js';
import { plantFiltersSchema } from '@/utils/validators/plant.validators.js';

export const getPlants = async (req, res, next) => {
  try {
    const filters = plantFiltersSchema.parse(req.query);
    res.json(await plantService.getPlants(req.params.nurseryId, filters));
  } catch (err) { next(err); }
};

export const getPlantById = async (req, res, next) => {
  try {
    res.json(await plantService.getPlantById(req.params.nurseryId, req.params.id));
  } catch (err) { next(err); }
};

export const findByQr = async (req, res, next) => {
  try {
    res.json(await plantService.findByQr(req.params.nurseryId, req.params.qrCode));
  } catch (err) { next(err); }
};

export const createPlant = async (req, res, next) => {
  try {
    res.status(201).json(await plantService.createPlant(req.params.nurseryId, req.user.accountId, req.body));
  } catch (err) { next(err); }
};

export const bulkCreate = async (req, res, next) => {
  try {
    const { count, template } = req.body;
    res.status(201).json(await plantService.bulkCreate(req.params.nurseryId, req.user.accountId, template, count));
  } catch (err) { next(err); }
};

export const updatePlant = async (req, res, next) => {
  try {
    res.json(await plantService.updatePlant(req.params.nurseryId, req.params.id, req.body));
  } catch (err) { next(err); }
};

export const softDelete = async (req, res, next) => {
  try {
    res.json(await plantService.softDelete(req.params.nurseryId, req.params.id));
  } catch (err) { next(err); }
};

export const restore = async (req, res, next) => {
  try {
    res.json(await plantService.restore(req.params.nurseryId, req.params.id, req.user));
  } catch (err) { next(err); }
};

export const addTag = async (req, res, next) => {
  try {
    await plantService.addTag(req.params.nurseryId, req.params.id, req.params.tagId, req.user.accountId);
    res.status(204).send();
  } catch (err) { next(err); }
};

export const removeTag = async (req, res, next) => {
  try {
    await plantService.removeTag(req.params.nurseryId, req.params.id, req.params.tagId);
    res.status(204).send();
  } catch (err) { next(err); }
};
```

---

## Шаг 6. Router

`src/routes/plant.router.js`:

```js
import { Router } from 'express';
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { validate } from '@/middlewares/validate.js';
import { STRUCTURE_ROLES, WRITE_ROLES } from '@/constants/roles.constants.js';
import * as plantController from '@/controllers/plant.controller.js';
import {
  createPlantSchema,
  updatePlantSchema,
  bulkCreateSchema,
} from '@/utils/validators/plant.validators.js';

const router = Router({ mergeParams: true });
router.use(requireAuth, requireNurseryAccess);

router.get('/', plantController.getPlants);
router.get('/by-qr/:qrCode', plantController.findByQr);
router.get('/by-code/:numericCode', plantController.findByNumericCode);
router.get('/:id', plantController.getPlantById);
router.post('/', requireRole(...STRUCTURE_ROLES), validate(createPlantSchema), plantController.createPlant);
router.post('/bulk', requireRole(...STRUCTURE_ROLES), validate(bulkCreateSchema), plantController.bulkCreate);
router.patch('/:id', requireRole(...STRUCTURE_ROLES), validate(updatePlantSchema), plantController.updatePlant);
router.delete('/:id', requireRole(...STRUCTURE_ROLES), plantController.softDelete);
router.patch('/:id/restore', plantController.restore);
router.post('/:id/tags/:tagId', requireRole(...WRITE_ROLES), plantController.addTag);
router.delete('/:id/tags/:tagId', requireRole(...STRUCTURE_ROLES), plantController.removeTag);

export default router;
```

Подключить в `app.js`:

```js
import plantRouter from '@/routes/plant.router.js';
app.use('/api/nurseries/:nurseryId/plants', plantRouter);
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Создание генерирует `qr_code` и `numeric_code` | `POST .../plants` -> оба поля заполнены и уникальны |
| 2 | Лимит растений соблюдается | Создать 300 растений на плане `free`, следующий → 403 |
| 3 | Поиск по QR и numeric code | `GET .../plants/by-qr/...` и `GET .../plants/by-code/...` |
| 4 | Мягкое удаление не физическое | `DELETE .../plants/:id` → `deleted_at` установлен, запись в БД есть |
| 5 | Восстановление только owner | Войти как agronomist, `PATCH .../plants/:id/restore` → 403 |
| 6 | Bulk-create создаёт N растений | `POST .../plants/bulk` с `count: 5` → 5 новых записей с разными QR |
| 7 | Теги требуют feature_tags | Добавить тег при плане `free` → 403 |
| 8 | Фильтрация по контейнеру и numeric code работает | `GET .../plants?containerId=...&numericCode=...` |
| 9 | Пагинация работает | `GET .../plants?page=2&perPage=10` → вторая страница |
