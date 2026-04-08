# MODULE_1 - Frontend: Dexie Offline Store

**Зависит от:** MODULE_0

## Описание
IndexedDB (Dexie) как локальный storage и `sync_queue` для офлайн-мутаций.

## Шаги реализации
1. Создать `src/db/indexedDb.js`.
2. Таблицы: `plants`, `locations`, `species`, `tags`, `movement_types`, `container_types`, `operations`, `movements`, `pending_photos`, `sync_queue`.
3. Типы очереди: `create_operation`, `update_operation`, `delete_operation`, `create_movement`, `delete_movement`, `attach_photo`.
4. Реализовать `useOnlineStatus` composable.

## Граница MVP/v2
- MVP: local cache + queue.
- v2: priority queue.

## Критерии приемки
- Все таблицы созданы в Dexie.
- Офлайн-мутации попадают в `sync_queue`.
- При online очередь готова к синку.
