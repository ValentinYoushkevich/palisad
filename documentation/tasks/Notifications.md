# v2 · Этап 2 — Уведомления (инфраструктура, in-app)

## Чего хотим достичь

Сквозная инфраструктура уведомлений, которой будут пользоваться последующие фичи
(задачи и напоминания, конфликты синхронизации, истечение подписки, лимиты). На этом
этапе — только канал **in-app** (колокольчик/бейдж в шапке, список, пометка
«прочитано»). Email/push — отдельной итерацией позже.

Аналог уже есть в проекте — `activity_logs` + хелпер `logActivity`. Зеркалим этот
паттерн: единый хелпер `notify(...)`, который смогут дёргать любые сервисы, не зная
деталей доставки.

## План

### Модель данных

Таблица `notifications` (по аналогии с `activity_logs`):

| поле          | тип        | примечание                                       |
| ------------- | ---------- | ------------------------------------------------ |
| `id`          | uuid PK    | `gen_random_uuid()`                              |
| `nursery_id`  | uuid FK    | → `nurseries.id`, `ON DELETE CASCADE`, NOT NULL  |
| `user_id`     | uuid FK    | → `users.id`, `ON DELETE CASCADE`, NOT NULL — **адресат** |
| `type`        | text       | NOT NULL, тип события (без CHECK — растёт по фичам) |
| `payload`     | jsonb      | произвольные данные уведомления                   |
| `is_read`     | boolean    | NOT NULL, default `false`                        |
| `created_at`  | timestamptz| NOT NULL, default `now()`                        |

Индексы: `(nursery_id, user_id)`, partial `(nursery_id, user_id) WHERE is_read = false`
для быстрого подсчёта непрочитанных, `created_at`.

**Решение по адресату:** уведомление принадлежит конкретному пользователю (per-user
read-state — простая и корректная семантика). Рассылка на нескольких получателей =
несколько строк (fan-out на стороне вызывающего). Это чистый примитив; широковещание
по питомнику можно добавить позже отдельным флагом, не ломая модель.

### Backend

- `db/migrations/*_create_notifications.js` — таблица + индексы.
- `src/constants/notification.constants.js` — `NOTIFICATION_TYPES` (стартовый набор).
- `src/repositories/notification.repository.js` — `create`, `findByUser`,
  `countByUser`, `countUnread`, `markRead`, `markAllRead`.
- `src/utils/notify.js` — хелпер `notify({ nurseryId, userId, type, payload })`,
  никогда не бросает (ошибку только логирует — как `logActivity`).
- `src/services/notification.service.js` — `getNotifications`, `markRead`, `markAllRead`.
- `src/controllers/notification.controller.js` + `src/routes/notification.router.js`,
  смонтировать в `app.js`: `/api/nurseries/:nurseryId/notifications`
  (`requireAuth` + `requireNurseryAccess`).
  - `GET /` — список уведомлений текущего юзера `{ data, total, unreadCount, page, perPage }`,
    фильтр `?unread=true`, пагинация.
  - `PATCH /:id/read` — пометить одно прочитанным.
  - `POST /read-all` — пометить все прочитанными.
- **Реальный продюсер (end-to-end):** в `staff.service.changeRole` слать уведомление
  сотруднику о смене его роли (`NOTIFICATION_TYPES.ROLE_CHANGED`). Адресат ≠ актор.

### Frontend

- `src/stores/notifications.store.js` — `items`, `unreadCount`, `fetchNotifications`,
  `markRead`, `markAllRead`, `startPolling`/`stopPolling`, `resetState`.
- `src/layouts/components/NotificationBell.vue` — колокольчик с бейджем непрочитанных,
  выпадающий список, пометка «прочитано» / «прочитать всё».
- Встроить в `AppLayout` (шапка, рядом с переключателем питомника).
- Пуллинг при активной сессии (без WebSocket — чтобы не усложнять офлайн-архитектуру).
  Старт после `initNurseryContext`, стоп при logout/смене питомника.

### Тесты

`backend/tests/notifications.test.js`:
- `notify()` создаёт строку; не бросает при кривых данных.
- `GET` возвращает только уведомления текущего юзера, `unreadCount` корректен.
- `?unread=true` фильтрует.
- `PATCH /:id/read` помечает прочитанным; чужое уведомление недоступно (404).
- `POST /read-all` сбрасывает счётчик.
- смена роли сотрудника создаёт уведомление адресату.
- изоляция между питомниками/пользователями.

## Результаты

Этап закрыт end-to-end (схема → backend → frontend → тесты).

### Backend

- Миграция `20260614130000_create_notifications.js` — таблица `notifications`
  (`id`, `nursery_id` CASCADE, `user_id` CASCADE NOT NULL, `type`, `payload` jsonb,
  `is_read` default false, `created_at`) + индексы `(nursery_id, user_id)`,
  partial `WHERE is_read = false`, `created_at`. Накачена на dev (Batch 4) и
  автоматически на `palisad_test`.
- `constants/notification.constants.js` — `NOTIFICATION_TYPES` (role_changed,
  sync_conflict, subscription_expiring, task_due); без CHECK — типы растут без миграций.
- `repositories/notification.repository.js` — `create`, `findByUser`, `countByUser`,
  `countUnread`, `markRead`, `markAllRead` (всё скоупится по `nursery_id` + `user_id`).
- `utils/notify.js` — хелпер `notify({ nurseryId, userId, type, payload })`, никогда
  не бросает (ошибку логирует) — по образцу `logActivity`.
- `services/notification.service.js` + контроллер + роутер, смонтирован в `app.js`:
  `/api/nurseries/:nurseryId/notifications` (`GET` со `?unread`, пагинацией и
  `unreadCount`; `PATCH /:id/read`; `POST /read-all`). Защита `requireAuth` +
  `requireNurseryAccess`; адресат всегда `req.user.userId`.
- Продюсер: `staff.service.changeRole` теперь шлёт уведомление сотруднику о смене роли.

### Frontend

- `stores/notifications.store.js` — `items`, `unreadCount`, `fetchNotifications`,
  `markRead`, `markAllRead`, `startPolling`/`stopPolling` (пуллинг 60с), `resetState`.
- `layouts/components/NotificationBell.vue` — колокольчик с бейджем непрочитанных,
  выпадающий список, пометка «прочитано» по клику и «Прочитать всё», закрытие по
  клику вне. Доступность: триггер и пункты — кнопки, aria-label.
- Встроен в `AppLayout` (шапка), пуллинг стартует в `onMounted`, стоп в
  `onBeforeUnmount`; `logout` дергает `notificationsStore.resetState()`.

### Проверки

- Backend: `npx vitest run` → **148/148** (добавлено 10 тестов в
  `tests/notifications.test.js`: хелпер, GET+unreadCount, фильтр `?unread`,
  mark-read + 404 на чужое, read-all, продюсер смены роли, изоляция между питомниками).
- Frontend: ESLint по изменённым файлам — чисто; `npm run build` — успешно.

### Заметки на будущее

- Доставка пока только in-app. Email/push — отдельной итерацией, когда появится явная
  потребность (дедлайны задач — этап 6, истечение подписки).
- Широковещание по питомнику (один `type` многим) реализуется fan-out'ом (строка на
  адресата) на стороне вызывающего; модель `user_id NOT NULL` оставляет read-state
  per-user. При необходимости — добавить флаг nursery-wide отдельной миграцией.
- Новые продюсеры (`sync.conflict`, `subscription.expiring`, `task.due`) подключаются
  в своих этапах вызовом `notify(...)`.
