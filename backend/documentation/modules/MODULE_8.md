# MODULE_8 — Backend: Справочники (виды, теги, типы движений, типы контейнеров)

**Зависит от:** MODULE_6, MODULE_4

---

## Описание

Модуль включает 4 справочника:

- виды: глобальный каталог `species_catalog` + привязка к питомнику `nursery_species` (данные GBIF через `src/services/gbif.client.js`),
- `tags`,
- `movement_types`,
- `container_types`.

`owner` и `agronomist` могут управлять справочниками. `worker` и `observer` — только чтение.

---

## Эндпоинты

- `GET /api/nurseries/:nurseryId/species`
- `GET /api/nurseries/:nurseryId/species/search?q=`
- `POST /api/nurseries/:nurseryId/species` (тело: `attachSpeciesByNameSchema`, см. ниже)
- `POST /api/nurseries/:nurseryId/species/attach-by-name` (алиас того же сценария)
- `PATCH /api/nurseries/:nurseryId/species/:id`
- `DELETE /api/nurseries/:nurseryId/species/:id`

- `GET /api/nurseries/:nurseryId/tags`
- `POST /api/nurseries/:nurseryId/tags`
- `PATCH /api/nurseries/:nurseryId/tags/:id`
- `DELETE /api/nurseries/:nurseryId/tags/:id`

- `GET /api/nurseries/:nurseryId/movement-types`
- `POST /api/nurseries/:nurseryId/movement-types`
- `PATCH /api/nurseries/:nurseryId/movement-types/:id`
- `DELETE /api/nurseries/:nurseryId/movement-types/:id`

- `GET /api/nurseries/:nurseryId/container-types`
- `POST /api/nurseries/:nurseryId/container-types`
- `PATCH /api/nurseries/:nurseryId/container-types/:id`
- `DELETE /api/nurseries/:nurseryId/container-types/:id`

---

## Канонические правила

- **Виды (`species_catalog` + `nursery_species`):**
  - добавление в питомник: `POST .../species` или `POST .../species/attach-by-name` с полями `scientific_name`, `display_name_ru` (Zod: `attachSpeciesByNameSchema`);
  - бэкенд ищет таксон в `species_catalog` по латинскому имени; при отсутствии — GBIF `/species/match`, при низкой уверенности — fallback `/species/search`;
  - запись в `species_catalog` по уникальному `gbif_usage_key`; привязка к питомнику — `UNIQUE (nursery_id, species_catalog_id)`;
  - при повторном добавлении того же таксона в тот же питомник возвращается существующая строка + `alreadyExists: true` (и `source`, см. `dictionary.service.js`);
  - список для UI — join `nursery_species` ↔ `species_catalog`; в ответе по-прежнему отдаются поля совместимости (`gbif_id` как usage key, `gbif_family`/`gbif_genus` из каталога);
  - удаление справочника вида — деактивация (`is_active=false`).
- `tags`:
  - цвет строго `#RRGGBB`;
  - создание требует `feature_tags`;
  - удаление через деактивацию.
- `movement_types`:
  - системные (`is_system=true`) нельзя редактировать/удалять;
  - `sets_status` управляет итоговым статусом растения.
- `container_types`:
  - системные типы из seed защищены от изменений;
  - поддерживаются поля `code`, `name`, `container_kind`, `volume_liters`, `side_cm`;
  - удаление кастомного типа запрещено при привязанных растениях (только деактивация).

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Поиск подсказок и добавление вида | `GET .../species/search?q=` (локальный каталог + GBIF) + `POST .../species/attach-by-name` |
| 2 | Дубль в том же питомнике не создаётся | Повторный `POST` с тем же таксоном → `alreadyExists=true` |
| 3 | Теги требуют `feature_tags` | `POST .../tags` на free -> 403 |
| 4 | Системные `movement_types` защищены | `PATCH/DELETE` системного типа -> 400/403 |
| 5 | Системные `container_types` защищены | `PATCH/DELETE` системного типа -> 400/403 |
| 6 | Удаление используемого container type не физическое | `DELETE .../container-types/:id` -> `is_active=false` |
