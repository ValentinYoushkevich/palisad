# MODULE_12 - Frontend: Offline Synchronization

**Зависит от:** MODULE_7, MODULE_8, MODULE_9

## Описание
Sync manager для обработки `sync_queue` и статусов синхронизации.

## Шаги реализации
1. `useSyncManager` в `AppLayout.vue`.
2. Триггеры: online event + кнопка `Sync now`.
3. Порядок синка: operations/movements -> photos.
4. При `retries >= 3` показывать toast.
5. Conflict policy: server-wins + notification.
6. Компонент `SyncStatusBadge.vue`.
7. Обрабатывать элементы `sync_queue`, добавленные в MODULE_8 и MODULE_9:
   - `create_operation`, `update_operation`, `delete_operation`
   - `create_movement`, `delete_movement`
   - `attach_photo` (после operations/movements)

## Критерии приемки
- После возврата online очередь обрабатывается.
- Retry warnings показываются.
- Статус синка виден в UI.
