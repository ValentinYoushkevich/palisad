# MODULE_8 - Frontend: Operations and Photos

**Зависит от:** MODULE_7

## Описание
Plant operations timeline и photo attachments, включая offline queue.

## Шаги реализации
1. `operations.store.js` (`fetch/create/update/softDelete/attachPhoto/deletePhoto/syncPending`).
2. UI: `OperationCreateDialog`, `OperationEditDialog`, `PhotoUploadDialog`, `OperationTimeline`.
3. `transplant` передает `newContainerId` и обновляет `plants.container_id`.
4. Feature checks: `feature_operations`, `feature_photos`.
5. Подключить `syncQueue.service` к CRUD-мутациям в `operations.store.js`:
   - `create` -> `create_operation`
   - `update` -> `update_operation`
   - `softDelete` -> `delete_operation`
   - `attachPhoto` -> `attach_photo`

## Backend contracts
- Operations endpoints + photos endpoints.

## Критерии приемки
- Нельзя добавить операцию для sold/written_off.
- `transplant` обновляет container.
- Офлайн photos синхронизируются после online.
