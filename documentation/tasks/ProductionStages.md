# v2 · Этап 3 — Производственные стадии (`production_stages`)

## Чего хотим достичь

Ввести понятие производственной стадии растения (Размножение → Подвой/Liner →
Контейнер → Поле/Field) как справочник + текущая стадия растения + история переходов.
Это фундамент для этапа 4 (себестоимость накапливается *по стадиям* и нормам
трудозатрат *на стадию*). Стадия — атрибут конкретного растения (модель «одно
растение = одна запись» не меняем).

Зеркалим существующие паттерны: справочник как `movement_types`/`container_types`
(системные строки `nursery_id IS NULL` + кастомные на питомник), переход стадии —
через спец-операцию (как `transplant`), история — отдельной таблицей (для аналитики
длительности на стадии).

## План

### Модель данных (миграция)

- `production_stages` — id, `nursery_id` nullable (CASCADE; NULL = системная), `name`,
  `slug`, `sort_order` int, `is_system` bool, `is_active` bool, `created_at`,
  `updated_at`, `unique(nursery_id, slug)`. Системные строки (NULL): `propagation`,
  `liner`, `container`, `field` (sort_order 1–4).
- `plants.stage_id` uuid nullable FK → `production_stages` `ON DELETE SET NULL`.
- `plant_stage_history` — id, `plant_id` (CASCADE), `stage_id` (SET NULL),
  `changed_by` (→ users, SET NULL), `notes`, `created_at`. Индекс по `plant_id`.
- `stage_labor_norms` — id, `nursery_id` (CASCADE), `stage_id` (CASCADE),
  `operation_type` text, `norm_minutes` int, `created_at`, `updated_at`,
  `unique(nursery_id, stage_id, operation_type)`. Основа трудозатрат для этапа 4.
- Индексы: `plants(stage_id)`, `production_stages(nursery_id)`.

### Backend

- `constants/productionStage.constants.js` — системные слаги + `SYSTEM_STAGES` для сидов.
- `constants/operation.constants.js` — добавить `change_stage` в `OPERATION_TYPES`.
- Репозитории: `productionStage.repository.js` (findAll/findById/create/updateById —
  как `movementType`), `plantStageHistory.repository.js` (create/findByPlant),
  `stageLaborNorm.repository.js` (findAll/findById/create/updateById/deleteById).
- `services/productionStage.service.js` — CRUD стадий (гард `is_system` на изменение/
  удаление, как у movement-types) + CRUD норм трудозатрат.
- `services/operation.service.js` — обработка `change_stage`: требует `newStageId`,
  проверяет принадлежность стадии питомнику (или системная), обновляет `plants.stage_id`
  и пишет `plant_stage_history`.
- Валидаторы: `createProductionStageSchema`/`updateProductionStageSchema`,
  схемы норм; в `createOperationSchema` — `newStageId` (uuid, optional); в фильтрах
  реестра — `stageId`; в create/update растения — optional `stageId`.
- Роуты (в `dictionary.router`): `/production-stages` (GET/POST/PATCH/DELETE),
  `/stage-labor-norms` (GET/POST/PATCH/DELETE). RBAC `STRUCTURE_ROLES` на запись.
- `plant.repository` — фильтр `stageId` + join `production_stages` (отдать `stage_name`,
  `stage_slug` в списке и карточке); история стадий растения через
  `GET .../plants/:plantId` или отдельным эндпоинтом.
- Сиды: системные стадии в `001_mvp_seed.js` и `tests/globalSetup.js`.

### Frontend

- Стор справочников: загрузка `productionStages` (+ кэш в Dexie как прочие справочники).
- Карточка растения: текущая стадия + кнопка «Сменить стадию» (спец-операция
  `change_stage`), история стадий.
- Реестр: фильтр по стадии.
- `CatalogPage`: справочник стадий (CRUD, как другие справочники).

### Тесты

`backend/tests/productionStages.test.js`:
- системные стадии видны питомнику; создание/изменение/удаление кастомной; гард на
  системную (403).
- операция `change_stage` обновляет `plants.stage_id` + пишет историю; без `newStageId` → 400.
- фильтр реестра по `stageId`.
- нормы трудозатрат: CRUD + уникальность.
- изоляция стадий/норм между питомниками.

## Результаты

Этап закрыт end-to-end (схема → backend → frontend → тесты).

### Backend

- Миграции: `20260614140000_create_production_stages.js` (таблицы `production_stages`,
  `plant_stage_history`, `stage_labor_norms` + `plants.stage_id` + индексы + сид 4
  системных стадий) и `20260614150000_add_change_stage_operation_type.js` (CHECK
  `operations.type` расширен на `change_stage`). Накачены на dev (Batch 5) и авто на тест.
- Константы: `productionStage.constants.js` (`SYSTEM_STAGES`); `change_stage` добавлен
  в `OPERATION_TYPES`.
- Репозитории: `productionStage.repository.js` (системные `nursery_id IS NULL` видны
  всем — как movement-types), `plantStageHistory.repository.js`, `stageLaborNorm.repository.js`.
- `services/productionStage.service.js` — CRUD стадий (гард `is_system`) + CRUD норм.
- `operation.service.change_stage` — требует `newStageId`, валидирует стадию,
  обновляет `plants.stage_id` и пишет `plant_stage_history`.
- `plant.repository`/`plant.service` — фильтр `stageId` + join стадии в списке
  (`stage_name`/`stage_slug`), `stage_id` в create/bulk/update, история стадий в карточке.
- Роуты в `dictionary.router`: `/production-stages` (CRUD) и `/stage-labor-norms` (CRUD),
  RBAC `STRUCTURE_ROLES` на запись. Валидаторы добавлены.
- Сиды: системные стадии в dev-seed и `tests/globalSetup`.

### Frontend

- Dexie v2: таблица `production_stages` (+ в `DOMAIN_TABLES`, чистится при logout/смене питомника).
- `stores/productionStages.store.js` — fetch/create/update/delete + офлайн-кэш.
- `CatalogPage` — новая секция «Производственные стадии» (карточка, таблица, диалог
  `ProductionStageDialog`); логика секции вынесена в композабл `useStageSection.js`.
- Реестр: фильтр по стадии (`PlantFiltersPanel`, `plants.store`), колонка «Стадия»
  (`PlantsPage`).
- Карточка растения: панель текущей стадии + история переходов (`PlantDetailPage`).
- Операция `change_stage` в `OperationCreateDialog` (выбор стадии); online — рефреш
  карточки, offline — оптимистичное обновление `stage_id` + реплей через `sync_queue`.

### Проверки

- Backend: `npx vitest run` → **160/160** (новый `tests/productionStages.test.js` — 12
  тестов: справочник + гард системной, `change_stage` + история + 400 без стадии,
  фильтр реестра, CRUD норм + уникальность, изоляция между питомниками).
- Frontend: ESLint по изменённым файлам — чисто; `npm run build` — успешно.

### Найдено и исправлено

- `operations.type` имел CHECK без `change_stage` → INSERT падал 500. Добавлена
  отдельная миграция, расширяющая констрейнт.

### Заметки на будущее (для этапа 4 — себестоимость)

- `stage_labor_norms` (нормы трудозатрат на стадию+тип операции) реализованы на бэке,
  UI пока не делаем — это вход для расчёта трудозатрат этапа 4.
- Учёт остаётся «одно растение = одна запись»; стадия — атрибут растения. Партийный
  учёт — вне v2-скоупа.
- Этап 4 (себестоимость) — зона повышенного риска, **требует обсуждения с заказчиком**
  до реализации (см. роадмап).
