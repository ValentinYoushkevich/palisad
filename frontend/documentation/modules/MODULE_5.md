# MODULE_5 - Frontend: Locations

**Зависит от:** MODULE_3

## Описание
4-level location tree: `area -> section -> row -> place`.

## Шаги реализации
1. `locations.store.js` (`tree`, `flatList`, CRUD + `syncToLocal`).
2. Страницы/dialogs: `LocationsPage`, `LocationCreateDialog`, `LocationEditDialog`.
3. Офлайн cache + актуализация с API.

## Backend contracts
- `GET /locations`
- `GET /locations/tree`
- `POST/PATCH/DELETE /locations/:id`

## Критерии приемки
- Уровень `place` поддерживается.
- `tree` и `flat` представления консистентны.
