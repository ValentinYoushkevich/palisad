# MODULE_9 - Frontend: Movements

**Зависит от:** MODULE_7

## Описание
Movements accounting на базе `movement_types` и `sets_status`.

## Шаги реализации
1. `movements.store.js` (`fetchMovements`, `createMovement`, `deleteMovement`, `syncPending`).
2. `MovementCreateDialog`, `MovementHistory`.
3. Выбор `typeId` из movement types.
4. После записи обновлять `plants.status` и `plants.location_id`.
5. Подключить `syncQueue.service` к CRUD-мутациям в `movements.store.js`:
   - `createMovement` -> `create_movement`
   - `deleteMovement` -> `delete_movement`

## Backend contracts
- Movements endpoints.

## Критерии приемки
- `typeId` выбирается из справочника.
- `sets_status` корректно меняет статус растения.
- History отображается в UI.
