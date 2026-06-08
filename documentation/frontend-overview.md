# Палисад — обзор фронтенда

## Назначение

PWA (Progressive Web App) на Vue 3 — основной клиент системы учёта питомников.
Работает в браузере на десктопе и мобильных устройствах, поддерживает офлайн-режим
для работы агрономов и работников «в поле».

## Технологический стек

| Категория | Технология | Назначение |
|-----------|-----------|------------|
| Фреймворк | **Vue 3** (Composition API, `<script setup>`) | основа SPA |
| Сборка/dev-сервер | **Vite** | сборка, dev-сервер, прокси `/api` → `http://localhost:3100` |
| UI-кит | **PrimeVue 4** + **PrimeIcons** + `@primeuix/themes` (тема **Lara**) | компонентная библиотека (таблицы, диалоги, формы и т.д.) |
| Авто-импорт компонентов | **unplugin-vue-components** + `@primevue/auto-import-resolver` | автоматическая регистрация PrimeVue-компонентов |
| Состояние | **Pinia** | хранилища (stores) |
| Маршрутизация | **vue-router 4** | роутинг + навигационные guard'ы (auth, роли) |
| Стили | **Tailwind CSS 4** (`@tailwindcss/postcss`), **SCSS** (`sass-embedded`), `assets/main.css` | вёрстка |
| HTTP-клиент | **axios** | обёртка `services/http.js` (interceptors, refresh-токен) |
| Офлайн-хранилище | **Dexie.js** (обёртка над **IndexedDB**) | локальная БД `PalisadDB` |
| PWA / Service Worker | **vite-plugin-pwa / Workbox** (`workbox-routing`, `workbox-strategies`), кастомный `public/sw.js` | кэширование, офлайн-режим |
| Сканирование QR | **@zxing/browser**, **@zxing/library** | сканер QR-кодов в браузере |
| Генерация PDF | **pdf-lib**, **qrcode** | генерация PDF-этикеток на клиенте |
| Линтинг | **ESLint** + плагины (`eslint-plugin-vue`, `vuejs-accessibility`, `security`, `sonarjs`, `unicorn`, `promise`, `oxlint`) | качество кода |

## Точка входа и инициализация (`src/main.js`)

При старте приложения:
1. Создаются `app` (Vue) и `pinia`.
2. Подключаются роутер, PrimeVue (тема Lara, префикс `p`), `ToastService`, `ConfirmationService`, директива `Tooltip`.
3. Открывается локальная база Dexie (`db.open()`).
4. Монтируется приложение, выполняется ping `/health`.
5. Регистрируется Service Worker (`registerServiceWorker`) — отключён в dev-режиме по умолчанию (флаг `SW_ENABLE_IN_DEV`).

## Структура `src/`

```
src/
  pages/         — страницы, каждая в своей папке (+ components/ для page-scoped компонентов)
  layouts/       — каркас приложения (AppLayout, SyncStatusBadge)
  stores/        — Pinia-хранилища (по сущностям)
  services/      — http-клиент, очередь синхронизации
  db/            — Dexie/IndexedDB: схема, утилиты, сервисы офлайн-фото и очереди
  composables/   — переиспользуемая логика (useOnlineStatus, useSyncManager, useDebounceFn)
  router/        — конфигурация vue-router и navigation guards
  utils/         — утилиты (генерация этикеток, определение устройства)
  constants/     — константы (типы записей очереди синхронизации)
  helpers/       — вспомогательные хелперы (обновление токена)
  assets/        — стили
```

## Страницы и маршруты (`router/index.js`)

| Путь | Страница | Доступ |
|------|----------|--------|
| `/plants`, `/plants/:id` | Реестр и карточка растения (`PlantsPage`, `PlantDetailPage`) | авторизованные |
| `/locations` | Структура питомника / локации (`LocationsPage`) | авторизованные |
| `/catalog` | Справочники: виды, теги, типы движений, типы контейнеров (`CatalogPage`) | авторизованные |
| `/activity` | Лента активности (`ActivityPage`) | авторизованные |
| `/scanner` | Сканер QR-кодов (`ScannerPage`) | авторизованные |
| `/labels` | Генерация PDF-этикеток (`LabelsPage`) | авторизованные |
| `/staff` | Управление сотрудниками (`StaffPage`) | только `owner` |
| `/nursery/create`, `/nursery/settings` | Создание/настройки питомника | авторизованные |
| `/login`, `/change-password` | Вход и смена пароля | публичные |
| `/` | редирект на `/plants` | — |

Навигационный guard (`router.beforeEach`) проверяет инициализацию авторизации
(`authStore`), редиректит неавторизованных на `/login`, а также проверяет роли (`meta.roles`).

## Хранилища Pinia (`stores/`)

`auth`, `nursery`, `staff`, `locations`, `plants`, `species`, `tags`,
`movementTypes`, `containerTypes`, `operations`, `movements`, `activity` —
по одному стору на сущность/раздел; инкапсулируют запросы к API и состояние UI.

## Офлайн-режим и синхронизация

Ключевая особенность приложения — полноценная работа без сети в поле.

- **IndexedDB через Dexie** (`db/indexedDb.js`) — локальная база `PalisadDB` с таблицами:
  `plants`, `locations`, `species`, `tags`, `movement_types`, `container_types`,
  `operations`, `movements`, `pending_photos`, `sync_queue`.
- **Очередь синхронизации (`sync_queue`)** — мутации, сделанные офлайн
  (`create_operation`, `update_operation`, `delete_operation`, `create_movement`,
  `delete_movement`, `attach_photo`), складываются в очередь и применяются при
  восстановлении сети (`db/syncQueue.service.js`, `services/syncQueue.service.js`,
  composable `useSyncManager`).
- **Service Worker (Workbox)** — `public/sw.js`, регистрируется через
  `registerServiceWorker.js`; стратегии `CacheFirst` для статики и `NetworkFirst` для API.
- **Индикатор сети** — `composables/useOnlineStatus.js`, виджет `SyncStatusBadge` в layout.
- **Разрешение конфликтов** — побеждает серверная версия, пользователь получает уведомление.
- Создание новых растений и видов возможно **только онлайн**; офлайн — работа с уже
  существующими записями (операции, фото, заметки, движения).

## HTTP-слой (`services/http.js`)

Обёртка над `axios`: базовый URL `/api` (проксируется Vite на backend), передача
HttpOnly cookie с JWT, перехватчики для автоматического обновления токена при 401
(`helpers/httpRefresh.helper.js`), единая обработка ошибок.

## Прочие технические детали

- **QR-сканирование** — компонент `pages/scanner/components/QrScanner.vue` на базе `@zxing/browser`.
- **Генерация этикеток** — `utils/generateLabels.js` + `pdf-lib`/`qrcode`, страница `LabelsPage`.
- **Адаптивность** — определение мобильного устройства (`utils/device.js`), используется в роутинге/UI.
- **Алиас путей** — `@` → `src/` (настроено в `vite.config.js`).

## Конвенции проекта (см. `frontend/.cursorrules`)

- Composition API (`<script setup>`), не Options API; Pinia-сторы строго в формате
  `defineStore(name, { state, getters, actions })`.
- Импорты — только абсолютные, через алиас `@/`.
- Страницы — каждая в своей папке (`pages/<name>/<Name>Page.vue`), page-scoped
  компоненты — в `pages/<name>/components/`; общие компоненты — в `src/components/`.
- Функции — «логически плоские» (ранние `return`, вынесение веток в helper-функции,
  декомпозиция при превышении ~30 строк / Cognitive Complexity).
- camelCase для props (в коде и в шаблонах), отступ 2 пробела, длина строки ≤ 200 символов.
