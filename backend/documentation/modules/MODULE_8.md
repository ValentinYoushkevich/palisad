# MODULE_8 — Backend: Справочники (виды, теги, типы движений, типы контейнеров)

**Зависит от:** MODULE_6, MODULE_4

---

## Описание

Модуль включает 4 справочника:
- `species` (через GBIF, только онлайн),
- `tags`,
- `movement_types`,
- `container_types`.

`owner` и `agronomist` могут управлять справочниками. `worker` и `observer` — только чтение.

---

## Эндпоинты

- `GET /api/nurseries/:nurseryId/species`
- `GET /api/nurseries/:nurseryId/species/search?q=`
- `POST /api/nurseries/:nurseryId/species`
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

- `species`:
  - создание только через GBIF (`gbif_id`, `scientific_name`, `display_name_ru`);
  - `UNIQUE (nursery_id, gbif_id)`;
  - при повторном добавлении вернуть существующий вид + `alreadyExists: true`;
  - удаление через деактивацию (`is_active=false`) при использовании.
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
| 1 | Виды добавляются через GBIF-поиск | `GET .../species/search?q=` + `POST .../species` |
| 2 | Дубли по `gbif_id` не создаются | Повторный `POST .../species` возвращает `alreadyExists=true` |
| 3 | Теги требуют `feature_tags` | `POST .../tags` на free -> 403 |
| 4 | Системные `movement_types` защищены | `PATCH/DELETE` системного типа -> 400/403 |
| 5 | Системные `container_types` защищены | `PATCH/DELETE` системного типа -> 400/403 |
| 6 | Удаление используемого container type не физическое | `DELETE .../container-types/:id` -> `is_active=false` |
