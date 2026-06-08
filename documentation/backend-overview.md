# Палисад — обзор бэкенда

## Назначение

REST API на Node.js/Express для PWA-приложения учёта питомников растений.
Обслуживает аутентификацию, мультитенантность (питомники), RBAC, реестр растений,
справочники, операции/движения, генерацию QR-этикеток, ленту активности и подписки.

## Технологический стек

| Категория | Технология | Назначение |
|-----------|-----------|------------|
| Среда выполнения | **Node.js 20 LTS** (ESM, `"type": "module"`) | только `import/export`, без `require` |
| Веб-фреймворк | **Express 5** | HTTP-сервер, роутинг, middleware-цепочки |
| СУБД | **PostgreSQL 16** | основное хранилище |
| Query builder / миграции | **Knex.js** | запросы к БД, миграции (`db/migrations`), сиды (`db/seeds`) |
| Аутентификация | **JWT** (`jsonwebtoken`) в HttpOnly cookie + refresh-токен, **Argon2id** (`argon2`) | хэширование паролей, сессии |
| Валидация | **Zod** | схемы валидации входных данных (`utils/validators/**`) |
| Логирование | **Winston** + **morgan** | структурированные логи + HTTP-лог в dev |
| Безопасность/инфра | **helmet**, **cors**, **cookie-parser** | заголовки безопасности, CORS, парсинг cookie |
| Планировщик задач | **node-cron** | периодическая очистка ленты активности (`cleanupCron.js`) |
| PDF / QR | **pdfkit** + **qrcode** | генерация PDF-этикеток с QR-кодами |
| Внешний API | **GBIF API** (`gbif.client.js`) | поиск и сопоставление видов растений (глобальная база видов) |
| Идентификаторы | **nanoid** | генерация коротких уникальных кодов |
| Алиасы модулей | `module-alias` + `alias-loader.mjs` | алиас `@` → `./src` |
| Линтинг | **ESLint** | качество кода |
| Dev | **nodemon** | автоперезапуск в режиме разработки |

## Точка входа и конфигурация

- `server.js` — запуск HTTP-сервера.
- `app.js` — сборка Express-приложения: middleware (`helmet`, `cors`, `morgan`,
  `express.json`, `cookie-parser`), монтирование роутеров, централизованный
  `errorHandler`.
- `knexfile.cjs` — конфигурация Knex (подключение к Postgres, пути к миграциям/сидам).
- `Dockerfile`, корневой `docker-compose.yml` — контейнеризация (Postgres + backend,
  backend слушает порт `3100`, Postgres проброшен на `5433`).

## Архитектура (слоистая, по `MODULE_0`)

```
src/
  config/        — конфигурация (knex, logger)
  constants/     — константы (UPPER_SNAKE_CASE)
  routes/        — Express-роутеры (определяют пути и middleware-цепочки)
  controllers/   — req → service → res (тонкий слой передачи управления)
  services/      — бизнес-логика, инварианты, оркестрация
  repositories/  — Knex-запросы к БД (единственный слой работы с БД)
  middlewares/   — requireAuth, requireRole, requireNurseryAccess, validate, errorHandler
  utils/         — вспомогательные функции и валидаторы (utils/validators/**)
db/
  migrations/    — миграции Knex
  seeds/         — сиды (планы, системные справочники, dev-аккаунт)
```

Строгое разделение слоёв: контроллер не обращается к БД напрямую, вся работа с
данными — через `repositories`, бизнес-правила — в `services`.

## Аутентификация и доступ

- **Регистрация/логин** — Argon2id-хэширование пароля, выдача JWT в HttpOnly cookie
  + refresh-токен (`auth.service.js`, `auth.controller.js`, `utils/jwt.js`).
  Поддержка `must_change_password` (временные пароли сотрудников).
- **`requireAuth`** — проверка JWT из cookie, восстановление пользователя в `req`.
- **`requireNurseryAccess`** — проверка принадлежности пользователя к питомнику
  (мультитенантность — все данные изолированы по `nursery_id`).
- **`requireRole(...roles)`** + хелперы `canWrite`, `canManageStructure`,
  `canManageStaff` (`utils/rbac.js`) — ролевая модель доступа (RBAC) для
  `owner` / `agronomist` / `worker` / `observer`.
- **Подписки и тарифы** — `planGuards.js`: `checkLimit`/`checkFeature` для проверки
  лимитов плана (`plant_limit`, `user_limit`) и фич (`feature_tags`,
  `feature_operations`, `feature_qr`, `feature_photos`, `feature_export`).

## REST API — карта эндпоинтов (см. `app.js`)

| Префикс | Роутер | Назначение |
|---------|--------|------------|
| `GET /api/health` | `health.router` | health-check |
| `/api/auth` | `auth.router` | регистрация, логин, логаут, refresh, смена пароля |
| `/api/nurseries` | `nursery.router` | CRУD питомника |
| `/api/nurseries/:nurseryId/users` | `staff.router` | сотрудники, роли |
| `/api/nurseries/:nurseryId/locations` | `location.router` | структура питомника (4 уровня) |
| `/api/nurseries/:nurseryId/plants` | `plant.router`, `labels.router` | реестр растений, QR/этикетки |
| `/api/nurseries/:nurseryId/plants/:plantId/operations` | `operation.router` | журнал операций и фото |
| `/api/nurseries/:nurseryId/plants/:plantId/movements` | `movement.router` | движения растений |
| `/api/nurseries/:nurseryId/activity` | `activityLog.router` | лента активности |
| `/api/nurseries/:nurseryId` | `dictionary.router` | справочники (виды, теги, типы движений/контейнеров) |
| `/api/subscriptions`, `/api/plans` | `subscription.router`, `subscription.controller` | подписки и тарифные планы |

## Функциональные модули (по `backend/documentation/modules/`)

Бэкенд декомпозирован на 14 модулей (`MODULE_0`…`MODULE_13`), упорядоченных по
зависимостям (от независимых к зависимым):

0. **Инициализация проекта** — структура, конфиг, health-check, error-handler.
1. **БД и миграции** — схема Postgres через Knex (`init_mvp_schema`,
   `refactor_species_to_global_catalog`), сиды (план `free`, системные справочники, dev-аккаунт).
2. **Аутентификация аккаунта** — регистрация (+ trial-подписка), логин/логаут/refresh, смена пароля.
3. **Управление питомником** — создание (с автосозданием owner), редактирование, получение данных.
4. **RBAC** — middleware прав доступа.
5. **Управление сотрудниками** — CRUD (только owner), временные пароли, смена ролей, деактивация, лимит пользователей.
6. **Подписка и тарифы** — текущий план, список планов, смена плана, `checkLimit`/`checkFeature`.
7. **Структура питомника (локации)** — иерархия `area → section → row → place`, дерево, защита от удаления при наличии данных.
8. **Справочники** — виды (`species_catalog` + `nursery_species` + интеграция с GBIF), теги, типы движений, типы контейнеров (системные + кастомные).
9. **Реестр растений** — CRUD, генерация QR/числового кода, поиск по QR/коду, фильтрация, мягкое удаление, массовый ввод, лимит растений.
10. **Операции и фото** — журнал операций (включая `transplant` со сменой контейнера), фото, мягкое удаление.
11. **Движения** — учёт перемещений/продаж/списаний, влияние на статус и локацию растения.
12. **QR-коды и этикетки** — PDF-генерация (`pdfkit` + `qrcode`), форматы single / 4×3.
13. **Лента активности** — `logActivity` во всех мутирующих сервисах, фильтры, пагинация, cron-очистка записей старше 2 лет.

Полное описание каждого модуля, эндпоинтов и зависимостей — в
[`backend/documentation/modules/backend-modules.md`](../backend/documentation/modules/backend-modules.md)
и файлах `MODULE_0.md … MODULE_13.md`.

## Схема базы данных (ключевые сущности)

Полная схема — в [`backend/documentation/schema.sql`](../backend/documentation/schema.sql).
Основные таблицы:

- **Аккаунты и подписки:** `accounts`, `plans`, `subscriptions`.
- **Питомник и сотрудники:** `nurseries`, `users` (роли: `owner`/`agronomist`/`worker`/`observer`).
- **Структура:** `locations` (иерархия `area → section → row → place`, рекурсивный `parent_id`).
- **Справочники:** `species_catalog` (глобальный каталог видов из GBIF), `nursery_species`
  (привязка вида к питомнику + `display_name_ru`), `tags`, `movement_types`, `container_types`
  (системные: P9, C1–C35, ОКС, Прикоп, Теплица, Холодильник + кастомные).
- **Растения и события:** `plants` (`nursery_species_id`, `container_id`, `variety`,
  `qr_code`, `numeric_code`, `status`, `deleted_at`), `plant_tags`, `operations`
  (+ `photos`), `movements`, `activity_logs` (`details JSONB`).

Принципы схемы: `updated_at` во всех мутируемых таблицах, мягкое удаление
(`deleted_at`) для `plants`/`operations`, CHECK-ограничения на статусы/роли/типы,
partial-индексы для активных записей, `TEXT` вместо `VARCHAR(n)`, `JSONB` для
`details` в `activity_logs`.

## Прочие технические детали

- **Интеграция с GBIF** (`services/gbif.client.js`) — поиск видов (`/species/search`),
  сопоставление по названию (`/species/match`), upsert в локальный каталог `species_catalog`.
- **Генерация PDF-этикеток** (`utils/generateLabelsPdf.js`, `services/labels.service.js`) —
  QR-код, числовой код, вид, сорт, тип контейнера, дата посадки, локация; форматы
  single и сетка 4×3.
- **Cron-задачи** (`utils/cleanupCron.js`, `node-cron`) — автоудаление записей ленты
  активности старше 2 лет.
- **Логирование активности** (`utils/logActivity.js`) — единый хелпер, вызываемый из
  всех мутирующих сервисов для записи событий в `activity_logs`.
- **Обработка ошибок** — `utils/AppError.js` + централизованный `middlewares/errorHandler.js`.

## Конвенции проекта (см. `backend/.cursorrules`)

- Только `import/export` (ESM), без `require()`.
- Слои: `routes → controllers → services → repositories`; контроллеры не работают с БД напрямую.
- Аутентификация — JWT в HttpOnly cookie, валидация — Zod, пароли — Argon2id.
- Минимальный дифф: не переписывать код, который не просили менять; перед созданием
  файла проверять отсутствие аналогичного.
- Никаких «заглушек на потом» — либо полная реализация, либо явный TODO с обоснованием.
