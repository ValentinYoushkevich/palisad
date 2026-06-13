# MODULE_7 — Backend: Структура питомника (локации)

**Зависит от:** MODULE_4

---

## Описание

Иерархия локаций в MVP: `area -> section -> row -> place`.
Модуль отвечает за CRUD структуры питомника, дерево и проверки целостности.

---

---

## Эндпоинты

- `GET /api/nurseries/:nurseryId/locations`
- `GET /api/nurseries/:nurseryId/locations/tree`
- `POST /api/nurseries/:nurseryId/locations`
- `PATCH /api/nurseries/:nurseryId/locations/:id`
- `DELETE /api/nurseries/:nurseryId/locations/:id`

---

---

## RBAC и правила

- Читать могут все роли.
- Изменять могут только `owner` и `agronomist`.
- Удаление запрещено, если есть дочерние узлы или активные растения.
- Родитель должен быть в том же питомнике.

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Поддерживается уровень `place` | Валидация/БД принимают `type = place` |
| 2 | Дерево возвращает 4 уровня | `GET .../locations/tree` |
| 3 | Удаление при дочерних узлах запрещено | `DELETE .../locations/:id` -> 400 |
| 4 | Удаление при привязанных растениях запрещено | `DELETE .../locations/:id` -> 400 |
| 5 | `worker` и `observer` не могут изменять структуру | `POST/PATCH/DELETE` -> 403 |

Реализовано — критерии 1–5 прогнаны скриптом `backend/scripts/acceptance-check.mjs` (2026-06-12).
