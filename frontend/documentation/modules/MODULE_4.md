# MODULE_4 - Frontend: Staff

**Зависит от:** MODULE_3

## Описание
UI для staff management, мутации только для owner.

## Шаги реализации
1. `staff.store.js` CRUD + role/status actions.
2. Страницы/dialogs: `StaffPage`, `StaffCreateDialog`, `StaffEditDialog`.
3. Role-based visibility controls.

## Backend contracts
- `GET/POST/PATCH /api/nurseries/:nurseryId/users...`

## Критерии приемки
- Не-owner не может менять staff.
- Список обновляется после мутации без reload.
