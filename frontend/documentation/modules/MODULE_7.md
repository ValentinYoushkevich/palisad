# MODULE_7 - Frontend: Plants Registry

**Зависит от:** MODULE_5, MODULE_6

## Описание
Центральный plants module: list/detail/create/edit, filters, tags, QR и numeric code lookup.

## Шаги реализации
1. `plants.store.js` с pagination и filters.
2. Форма создания: `speciesId`, `variety`, `plantedAt`, `source`, `locationId`, `containerId`.
3. Create/bulk create только online.
4. Lookup: `findByQr`, `findByNumericCode`.
5. Filters: species/status/location/tag/container/numericCode/search.

## Backend contracts
- Plants CRUD + `by-qr` + `by-code` + tags endpoints.

## Критерии приемки
- Create скрыт в offline.
- QR и numeric code поиск работает.
- Filters корректно сужают список.
