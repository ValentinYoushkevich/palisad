# MODULE_11 - Frontend: Activity Feed

**Зависит от:** MODULE_2

## Описание
Read-only feed событий питомника для всех ролей.

## Шаги реализации
1. `activity.store.js` (`fetchLogs`, `setFilter`, `resetFilters`, `loadMore`).
2. UI: `ActivityPage`, `ActivityFilters`, `ActivityLogItem`.
3. Filters: user, eventType, date range.
4. Rendering details для movement/transplant.

## Backend contracts
- `GET /api/nurseries/:nurseryId/activity`

## Критерии приемки
- Доступно для owner/agronomist/worker/observer.
- Filters и pagination работают.
