# MODULE_0 - Frontend: Project Initialization

**Зависит от:** -

## Описание
Базовая настройка Vue 3 приложения: PrimeVue, Router, Axios, AppLayout, Workbox.

## Шаги реализации
1. Создать базовую структуру `src/`.
2. Подключить PrimeVue и global UI сервисы.
3. Настроить Axios interceptors (401 refresh, 403 handling).
4. Настроить Router + `requireAuth` guard.
5. Подключить Workbox (`CacheFirst` статика, `NetworkFirst` API).

## Backend contracts
- `GET /api/health`
- `POST /api/auth/refresh`

## Граница MVP/v2
- MVP: app shell и базовый routing.
- v2: advanced telemetry.

## Layout & Navigation Contract
- Главный layout состоит из:
  - верхнего `header` (слева название системы, справа имя пользователя, роли и кнопка `Выход`);
  - левого `sidebar` с двумя секциями: `Общий доступ` и `Администрирование`.
- Правило классификации пунктов меню:
  - `Общий доступ` — разделы, где есть доступ не только у `Owner`;
  - `Администрирование` — только owner-only разделы.
- Для модулей `0–6` owner-only пункт в меню: `Сотрудники`.
- Видимость в меню не отменяет backend-контроль прав; frontend и backend должны быть согласованы.

## Критерии приемки
- Приложение стартует и показывает layout.
- Guard редиректит неавторизованного на `/login`.
- Service worker активируется.
