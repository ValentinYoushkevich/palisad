# MODULE_1 — Backend: База данных и миграции

**Зависит от:** MODULE_0

---

## Описание

Схема в `backend/documentation/schema.sql` должна соответствовать цепочке миграций Knex (в т.ч. рефакторинг видов в отдельной миграции).
Этот модуль фиксирует каноническую структуру БД, ограничения, индексы и seed-данные.

---

## Канонические сущности и требования

- Таблицы: `accounts`, `plans`, `subscriptions`, `nurseries`, `users`, `locations`, `species_catalog`, `nursery_species`, `tags`, `movement_types`, `container_types`, `plants`, `plant_tags`, `operations`, `photos`, `movements`, `activity_logs`.
- `locations.type` поддерживает 4 уровня: `area`, `section`, `row`, `place`.
- Виды: `species_catalog` — глобальный таксон (GBIF `gbif_usage_key`, латинское имя и таксономия); `nursery_species` — привязка к питомнику (`display_name_ru`, `UNIQUE (nursery_id, species_catalog_id)`).
- `plants` содержит: `nursery_species_id` (FK на `nursery_species`), `container_id` (FK на `container_types`), `variety`, `qr_code`, `numeric_code` (оба уникальные).
- `movements.type_id` — FK на `movement_types` (а не строковое поле типа движения).
- `movement_types` включает `sets_status` с CHECK: `growing | storage | sold | written_off | NULL`.
- Soft-delete только для `plants` и `operations` через `deleted_at`.
- `activity_logs.details` — `JSONB`.

---

## Seed (MVP)

- План `free`.
- Системные `movement_types`: поступление, продажа, списание, перемещение.
- Системные `container_types`: P9, C1, C2, C3, C5, C10, C15, C25, C35, ОКС, Прикоп, Теплица, Холодильник.
- Dev-аккаунт только для локальной среды.

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Схема миграции совпадает с `schema.sql` | Сверить таблицы/поля/FK/CHECK/индексы 1:1 |
| 2 | `locations` поддерживает `place` | В CHECK есть `place` |
| 3 | Есть `species_catalog` + `nursery_species`, уникальность по GBIF и по паре питомник–каталог | Проверка колонок и ограничений |
| 4 | В `plants` есть `container_id`, `variety`, `numeric_code` | Проверка колонок и уникальных индексов |
| 5 | `movements` использует `type_id` | FK на `movement_types(id)` |
| 6 | Seeds создают системные типы движений и контейнеров | Проверка данных после `npm run seed` |
| 7 | Rollback и повторный migrate проходят без ошибок | `npm run migrate:rollback && npm run migrate` |

Реализовано
