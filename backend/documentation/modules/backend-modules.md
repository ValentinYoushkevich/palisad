# Палисад MVP — Backend Modules

**Стек:** Node.js · Express · PostgreSQL · Knex.js · Argon2id · JWT (HttpOnly cookie) · Zod · Winston · node-cron · pdfkit · qrcode · GBIF API
**Версия:** 0.5 · 2026-04-07

---

## Принципы декомпозиции

Модули упорядочены от логически независимых к зависимым. `MODULE_N → MODULE_M` означает: для разработки N должен быть завершён M.

---

## MODULE_0 — Инициализация проекта

**Описание:** Node.js/Express-проект. Структура папок, зависимости, `.env`, health-check, Winston, ESLint, error-handler middleware.

**Зависит от:** —

**Endpoints:** `GET /api/health`

**Структура:**
```
src/
  config/        — knex, logger
  constants/     — UPPER_SNAKE_CASE константы
  controllers/   — req → service → res
  middlewares/   — auth, rbac, errorHandler, validate
  repositories/  — knex-запросы к БД
  routes/        — express-роутеры
  services/      — бизнес-логика
  utils/         — вспомогательные функции
db/
  migrations/
  seeds/
```

---

## MODULE_1 — База данных и миграции

**Описание:** PostgreSQL + Knex. Полная схема в одной миграции. Включает все таблицы: `container_types` с системными типами (P9, C1-C35, ОКС, Прикоп, Теплица, Холодильник), `plants.container_id` как FK, `plants.variety`, `species` с GBIF-полями, `movement_types`, `plants.numeric_code`, уровень `place` в `locations`. Seed: план `free`, системные типы движений, системные типы контейнеров, dev-аккаунт.

**Зависит от:** MODULE_0

**DB / Store:** Все таблицы схемы.

---

## MODULE_2 — Аутентификация аккаунта

**Описание:** Регистрация + `trial`-подписка. Логин / логаут. JWT HttpOnly cookie + refresh. Argon2id. Zod. Смена пароля. `must_change_password`. Middleware `requireAuth`.

**Зависит от:** MODULE_1

**Endpoints:**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `POST /api/auth/change-password`

---

## MODULE_3 — Управление питомником

**Описание:** Создание питомника с автосозданием `owner`-пользователя. Редактирование, получение данных.

**Зависит от:** MODULE_2

**Endpoints:**
- `POST /api/nurseries`
- `GET /api/nurseries/my`
- `PATCH /api/nurseries/my`

---

## MODULE_4 — RBAC — роли и права

**Описание:** Middleware `requireNurseryAccess` и `requireRole(...roles)`. Хелперы `canWrite`, `canManageStructure`, `canManageStaff` в `src/utils/rbac.js`.

**Зависит от:** MODULE_3

**Endpoints:** — (middleware)

---

## MODULE_5 — Управление сотрудниками

**Описание:** CRUD сотрудников — только `owner`. Временный пароль + `must_change_password`. Изменение роли (нельзя назначить `owner`). Деактивация. Защита последнего owner. Проверка `user_limit`.

**Зависит от:** MODULE_4

**Endpoints:**
- `GET /api/nurseries/:nurseryId/users`
- `GET /api/nurseries/:nurseryId/users/:id`
- `POST /api/nurseries/:nurseryId/users`
- `PATCH /api/nurseries/:nurseryId/users/:id`
- `PATCH /api/nurseries/:nurseryId/users/:id/role`
- `PATCH /api/nurseries/:nurseryId/users/:id/status`

---

## MODULE_6 — Подписка и тарифные планы

**Описание:** Активная подписка и список планов. Смена плана. Хелперы `checkLimit` и `checkFeature`.

**Зависит от:** MODULE_3

**Endpoints:**
- `GET /api/subscriptions/current`
- `GET /api/plans`
- `POST /api/subscriptions/change`

---

## MODULE_7 — Структура питомника (локации)

**Описание:** Четыре уровня: `area` → `section` → `row` → `place`. Рекурсивный `parent_id`. Удаление запрещено при наличии растений или дочерних. Плоский список и дерево.

**Зависит от:** MODULE_4

**Endpoints:**
- `GET /api/nurseries/:nurseryId/locations`
- `GET /api/nurseries/:nurseryId/locations/tree`
- `POST /api/nurseries/:nurseryId/locations`
- `PATCH /api/nurseries/:nurseryId/locations/:id`
- `DELETE /api/nurseries/:nurseryId/locations/:id`

---

## MODULE_8 — Справочники (виды, теги, типы движений, типы контейнеров)

**Описание:** Четыре справочника питомника. Управление — `owner` и `agronomist`.

**Виды (species):**
Добавление только онлайн через GBIF. Бэкенд проксирует `https://api.gbif.org/v1/species/suggest?q={query}&limit=10`. При сохранении проверяет `UNIQUE (nursery_id, gbif_id)` — если вид уже есть, возвращает существующую запись с `alreadyExists: true`. Деактивация вместо удаления если привязан к растениям.

**Теги (tags):**
CRUD с цветом `#RRGGBB`. Создание проверяет `feature_tags`. Деактивация вместо удаления.

**Типы движений (movement_types):**
CRUD кастомных типов. Системные (`is_system = true`) защищены от удаления и редактирования. Каждый тип может указывать `sets_status`.

**Типы контейнеров (container_types):**
Справочник условий содержания растений. Системные типы (`is_system = true, nursery_id = NULL`): P9, C1, C2, C3, C5, C10, C15, C25, C35, ОКС, Прикоп, Теплица, Холодильник — нельзя удалять и редактировать. Питомник может добавлять кастомные типы (нестандартные горшки, специфические условия). Поля: `code`, `name`, `container_kind` (pot/open_root/trench/cold_room/greenhouse), `volume_liters`, `side_cm`. Удаление кастомного типа запрещено если к нему привязаны растения — только деактивация.

> **v2:** `container_types` будут расширены полями стоимости (цена горшка, субстрата) для расчёта себестоимости и связаны со стадиями производственного цикла (`production_stages`).

**Зависит от:** MODULE_6, MODULE_4

**Endpoints:**
- `GET /api/nurseries/:nurseryId/species`
- `GET /api/nurseries/:nurseryId/species/search?q=`
- `POST /api/nurseries/:nurseryId/species`
- `PATCH /api/nurseries/:nurseryId/species/:id`
- `DELETE /api/nurseries/:nurseryId/species/:id`
- `GET /api/nurseries/:nurseryId/tags`
- `POST /api/nurseries/:nurseryId/tags`
- `PATCH /api/nurseries/:nurseryId/tags/:id`
- `DELETE /api/nurseries/:nurseryId/tags/:id`
- `GET /api/nurseries/:nurseryId/movement-types`
- `POST /api/nurseries/:nurseryId/movement-types`
- `PATCH /api/nurseries/:nurseryId/movement-types/:id`
- `DELETE /api/nurseries/:nurseryId/movement-types/:id`
- `GET /api/nurseries/:nurseryId/container-types`
- `POST /api/nurseries/:nurseryId/container-types`
- `PATCH /api/nurseries/:nurseryId/container-types/:id`
- `DELETE /api/nurseries/:nurseryId/container-types/:id`

**DB / Store:** `species`, `tags`, `movement_types`, `container_types`

---

## MODULE_9 — Реестр растений

**Описание:** CRUD растений. При создании генерируется `qr_code` и `numeric_code`. Поля `variety` (сорт) и `container_id` (текущий тип контейнера). Бэкенд опционально возвращает предупреждение о дубликате сорта для данного вида. Смена контейнера — через операцию `transplant` (MODULE_10), `plants.container_id` обновляется. Поиск по QR (`/by-qr/:qrCode`) и по числовому коду (`/by-code/:numericCode`). Фильтрация: вид, статус, локация, тег, тип контейнера, числовой код, текстовый поиск. Мягкое удаление. Массовый ввод. Проверка `plant_limit`.

**Зависит от:** MODULE_7, MODULE_8

**Endpoints:**
- `GET /api/nurseries/:nurseryId/plants`
- `GET /api/nurseries/:nurseryId/plants/:id`
- `GET /api/nurseries/:nurseryId/plants/by-qr/:qrCode`
- `GET /api/nurseries/:nurseryId/plants/by-code/:numericCode`
- `POST /api/nurseries/:nurseryId/plants`
- `POST /api/nurseries/:nurseryId/plants/bulk`
- `PATCH /api/nurseries/:nurseryId/plants/:id`
- `DELETE /api/nurseries/:nurseryId/plants/:id`
- `PATCH /api/nurseries/:nurseryId/plants/:id/restore`
- `POST /api/nurseries/:nurseryId/plants/:id/tags`
- `DELETE /api/nurseries/:nurseryId/plants/:id/tags/:tagId`

**DB / Store:** `plants` (`container_id`, `variety`, `qr_code`, `numeric_code`), `plant_tags`

---

## MODULE_10 — Операции и фото

**Описание:** Журнал операций. `owner`, `agronomist`, `worker`. Нельзя для `sold`/`written_off`. Проверяет `feature_operations`. Операция `transplant` — специальная логика: принимает `new_container_id`, обновляет `plants.container_id` и фиксирует смену в `notes` (предыдущий и новый тип контейнера). Фото — проверяет `feature_photos`. Мягкое удаление операций.

**Зависит от:** MODULE_9, MODULE_6

**Endpoints:**
- `GET /api/nurseries/:nurseryId/plants/:plantId/operations`
- `POST /api/nurseries/:nurseryId/plants/:plantId/operations`
- `PATCH /api/nurseries/:nurseryId/plants/:plantId/operations/:id`
- `DELETE /api/nurseries/:nurseryId/plants/:plantId/operations/:id`
- `POST /api/nurseries/:nurseryId/plants/:plantId/operations/:id/photos`
- `DELETE /api/nurseries/:nurseryId/plants/:plantId/operations/:id/photos/:photoId`

**DB / Store:** `operations`, `photos`, `plants` (обновляет `container_id` при `transplant`)

---

## MODULE_11 — Движения

**Описание:** Учёт движений. Тип — FK на `movement_types`. `sets_status` → обновляет `plants.status`. Перемещение → обновляет `plants.location_id`. Нельзя для `sold`/`written_off`. Удаление — `owner`/`agronomist`, физическое.

**Зависит от:** MODULE_9

**Endpoints:**
- `GET /api/nurseries/:nurseryId/plants/:plantId/movements`
- `POST /api/nurseries/:nurseryId/plants/:plantId/movements`
- `DELETE /api/nurseries/:nurseryId/plants/:plantId/movements/:id`

---

## MODULE_12 — QR-коды и этикетки

**Описание:** PDF через `pdfkit` + `qrcode`. На этикетке: QR-код, числовой код, вид (`display_name_ru`), сорт (`variety`), тип контейнера (`code`), дата посадки, локация. Форматы: single / grid 4×3. Проверяет `feature_qr`.

**Зависит от:** MODULE_9, MODULE_6

**Endpoints:**
- `POST /api/nurseries/:nurseryId/plants/labels`

---

## MODULE_13 — Лента активности

**Описание:** Хелпер `logActivity` во всех мутирующих сервисах (включая смену контейнера в MODULE_10). Публичный endpoint для всех ролей. Фильтры, пагинация. Cron-джоба: удаление записей старше 2 лет.

**Зависит от:** MODULE_9, MODULE_10, MODULE_11, MODULE_5, MODULE_7

**Endpoints:**
- `GET /api/nurseries/:nurseryId/activity`

---

## Сводная таблица зависимостей

| № | Модуль | Зависит от | Что даёт последующим |
|---|--------|------------|----------------------|
| 0 | Инициализация | — | Express, логгер, error handler |
| 1 | БД и миграции | 0 | Все таблицы, container_types seed |
| 2 | Аутентификация | 1 | JWT, сессии |
| 3 | Питомник | 2 | Nursery + owner |
| 4 | RBAC | 3 | Middleware прав |
| 5 | Сотрудники | 4 | User CRUD |
| 6 | Подписка | 3 | checkLimit / checkFeature |
| 7 | Локации | 4 | Дерево (4 уровня) |
| 8 | Справочники | 6, 4 | Species + Tags + MovementTypes + ContainerTypes |
| 9 | Растения | 7, 8 | Plants + container_id + variety + QR + numeric_code |
| 10 | Операции и фото | 9, 6 | Operations + transplant обновляет container_id |
| 11 | Движения | 9 | Movements + смена статуса |
| 12 | Этикетки | 9, 6 | PDF с QR, числовым кодом и типом контейнера |
| 13 | Лента активности | 9, 10, 11, 5, 7 | Activity log + cron |

---

## Запланировано на v2

- **Расчёт себестоимости** — накопительный учёт затрат на партию/растение: посадочный материал, трудозатраты по операциям, материалы (горшки, субстрат, удобрения, СЗР), энергия, общехозяйственные расходы. Учёт отпада с перераспределением себестоимости на оставшиеся растения.
- **Производственные стадии** (`production_stages`) — Propagation → Liner → Container → Field как отдельные сущности со своей логикой, нормами трудозатрат и привязкой к `container_types`.
- **Расширение `container_types`** — поля стоимости контейнера и субстрата для автоматического расчёта затрат при `transplant`.

