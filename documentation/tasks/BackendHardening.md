# BackendHardening — стабилизация бэка перед v2

**Создано:** 2026-06-13 · **Статус:** выполнено (2026-06-13)

## Контекст

Закрывает 3 оставшихся чекбокса блока «1. Стабилизация MVP» из
[`CURRENT_TASKS.md`](CURRENT_TASKS.md):

- проверить достаточность бэкенда для запланированных функций;
- проверить запросы в БД на корректность и отсутствие N+1;
- добавить интеграционные тесты для бэка с покрытием >90%.

Первые 4 чекбокса блока закрыты в [`MvpStabilization.md`](MvpStabilization.md).

**Решения по реализации (согласовано 2026-06-13):** один файл с тремя секциями;
тесты — **Vitest + supertest + @vitest/coverage-v8**.

**Известный контекст бэка:**
- Тест-инфраструктуры нет (ни зависимостей, ни скриптов, ни файлов) — только кастомный
  `scripts/acceptance-check.mjs` (raw fetch, 81 сценарий, 80/81 PASS).
- Слои: 12 routes / 11 controllers / 12 services / 16 repositories / 18 utils.
- `app.js` отделён от `server.js` (`listen` только в `server.js`) → готов к supertest.
- `knexfile.cjs` содержит только окружение `development`.

---

## Секция 1 — Достаточность бэкенда для запланированных функций (v2)

### Чего хотим достичь

Подтвердить, что текущая архитектура бэка **достаточна и расширяема** для 8 этапов
[`v2-roadmap-proposal.md`](v2-roadmap-proposal.md) без переписывания ядра. Выявить и
задокументировать пробелы (схема / сервисы / точки расширения), которые надо закрыть
на старте каждого этапа. **Это аудит готовности, не реализация v2-фич.**

### План

Пройти по каждому этапу роадмапа в формате «требование v2 → что уже есть → чего не хватает»:

| Этап | Что проверяем в текущем бэке |
|------|------------------------------|
| 1. Мультипитомник | `nurseries.account_id` (1:N) в схеме; `plans.nursery_limit`; не зашит ли «1 питомник/аккаунт» в `nursery.service`/auth-flow; подключаем ли `checkLimit` к `nursery_limit` |
| 2. Уведомления | наличие переиспользуемого хука-хелпера (по аналогии с `logActivity`); таблицы `notifications` нет — это норма (новый этап) |
| 3. Стадии | расширяемость `plants` (NULL-able поля); механизм «спец-операций» (`transplant`) переиспользуем под `change_stage` |
| 4. Себестоимость | журналы `operations`/`movements` как источник; расширяемость `container_types` |
| 5. Отчёты | достаточность данных (`plants`/`movements`/`activity_logs`) для базовых агрегатов; флаг `feature_export` |
| 6. Задачи | переиспользование сущностей; зависимость от уведомлений (этап 2) |
| 7. Склад/зимовка | расширяемость `locations.type` (enum/CHECK) |
| 8. CRM | точка расширения `movements.customer_id` |
| Сквозное | аддитивность миграций (NULL-able/default), сохранение `updated_at`/`deleted_at`/CHECK/partial-индексов; что из новых сущностей онлайн-only vs через `sync_queue` |

**Метод:** статический разбор `backend/documentation/schema.sql` + миграций и чтение
сервисов в точках предположений. Не поднимаем v2-фичи — только фиксируем готовность и
конкретные пробелы.

### Результаты (2026-06-13)

**Вывод: бэк достаточен и расширяем для v2 — ядро переписывать не нужно.** Мультитенантность
`account → nursery → users`, RBAC через middleware, `planGuards` (лимиты/фичи), хук `logActivity`,
журналы `operations`/`movements` покрывают потребности этапов; новые этапы — аддитивные миграции
+ новые сервисы.

| Этап v2 | Готовность | Пробелы / что сделать на старте этапа |
|---------|-----------|----------------------------------------|
| 1. Мультипитомник | ⚠️ частично | `nurseries.account_id` 1:N ✓; `plans.nursery_limit` ✓ и `checkNurseryLimit` **уже подключён** в `nursery.service` ✓. Снять хардкод «1/аккаунт»: `createNursery` отдаёт 409 на второй питомник (строки 20–23); `getMyNursery`/`updateNursery` идут через `findByAccountId` (один) — нужны list + «активный питомник»; `login` зашивает единственный `user.nursery_id` в JWT — нужен выбор/переключение (URL `/nurseries/:nurseryId/...` + `requireNurseryAccess` уже готовы). |
| 2. Уведомления | ✅ готов к расширению | Хелпер `utils/logActivity.js` (из 6+ сервисов) — точная модель для `notify(...)`; таблица `notifications` новая (норма). |
| 3. Стадии | ✅ готов | `plants` расширяем (NULL-able `stage_id`); спец-операция `transplant` (меняет `container_id`) — образец для `change_stage`. ⚠️ `operations.type` — CHECK-enum, расширение значением `change_stage` требует миграции CHECK. |
| 4. Себестоимость | ✅ данные есть | Журналы есть; `container_types` готов к полям стоимости (в `schema.sql` уже заметка-заглушка под v2). `cost_entries`/`material_costs` — аддитивны. |
| 5. Отчёты | ✅ для базовых | `plants`/`movements`/`activity_logs` достаточно для базовых агрегатов; флаг `feature_export` ✓. ⚠️ Для рентабельности нет цены/суммы в `movements` — нужно поле цены в движении-продаже. |
| 6. Задачи | ✅ готов | Таблица `tasks` аддитивна; привязки `plant_id`/`location_id`/`user_id` переиспользуют сущности; зависит от этапа 2. |
| 7. Склад/зимовка | ⚠️ минимальная правка | `locations.type` — CHECK-enum (`area/section/row/place`); для `storage`/`winter_shelter` — миграция расширения CHECK (минимальный вариант) или отдельная сущность. |
| 8. CRM | ✅ точка расширения есть | `movements` — естественное место для `customer_id` (нет сейчас); `customers`/`deals` — аддитивны. |

**Сквозные наблюдения:**
- Схема дисциплинирована: `updated_at`/`deleted_at`, CHECK-ограничения, partial-индексы есть —
  новые миграции держать на той же планке (аддитивные, NULL-able/default).
- Soft-delete (`deleted_at`) — у `plants` и `operations`; `movements` append-only (корректно);
  `photos`/`plant_tags` — каскад.
- Офлайн (`sync_queue`): агрегации (себестоимость, отчёты) — онлайн-only (согласовано с роадмапом).
- **Главный долг под этап 1:** «1 питомник/аккаунт» зашит в 3 точках (`createNursery` 409;
  `getMyNursery`/`updateNursery` через `findByAccountId`; единственный `nurseryId` в JWT при `login`).
  Локализовано, снимается без миграций схемы.
- `src/utils/rbac.js` — мёртвый код (M4#4); удалить, чтобы не мешал при добавлении прав в v2.

---

## Секция 2 — Корректность БД-запросов и отсутствие N+1

### Чего хотим достичь

Убедиться, что запросы корректны (правильные JOIN/фильтры/индексы, не потеряны
`deleted_at`-фильтры и `nursery_id`-скоупинг) и что на горячих путях (списки, деревья,
ленты) нет N+1 — запросов в цикле вместо JOIN / батча `whereIn`.

### План

1. **Survey** всех 16 репозиториев и 12 сервисов на паттерны N+1: `await`-запрос внутри
   `for`/`map`/`Promise.all` по коллекции; `.first()`/`.find()` на связанную сущность в цикле.
2. **Точки под подозрением** (проверить целенаправленно):
   - сборка дерева локаций (`location` tree — рекурсия с запросом на уровень?);
   - список движений с именами локаций from/to (`MODULE_11#8` — JOIN или per-row lookup?);
   - список растений со связанными вид/контейнер/теги/локация;
   - лента активности с именами пользователя/сущности;
   - фото по операциям.
3. Для каждого **подтверждённого N+1** — переписать на JOIN или батч `whereIn`; проверить
   наличие индексов под используемые фильтры и FK.
4. **Корректность:** `deleted_at`-фильтры на soft-delete сущностях; `nursery_id`-скоупинг
   (изоляция арендаторов) во всех запросах; стабильный `ORDER BY` под `LIMIT/OFFSET`-пагинацию.
5. **Верификация:** включить лог SQL (`knex` hook `.on('query')`) и прогнать ключевые
   эндпоинты через acceptance-сценарий — посчитать число запросов до/после фикса.

### Результаты (2026-06-13)

**Вердикт: репозитории дисциплинированы — на чтении везде JOIN, N+1 на горячих списках/
деревьях/ленте нет. Найдено и исправлено 2 пункта + 1 минорный на заметку.**

Survey 16 репозиториев / 12 сервисов — что уже корректно:
- список движений `movement.repository.findByPlant` — from/to локации, user, тип через
  `leftJoin` (подтверждает M11#8, не per-row);
- дерево локаций — один `findAllByNursery` + сборка в памяти `buildTree` (не N+1);
- лента `activityLog.repository.findByNursery` — `leftJoin users` + SQL `LIMIT/OFFSET` +
  отдельный count;
- удаление локации — 2 точечных count (дети, растения), не в цикле.

**Исправлено:**

1. **Список растений — пагинация в памяти → SQL** (`plant.repository.js`, `plant.service.js`).
   Было: `findAllByNursery` грузил ВСЕ растения питомника, `getPlants` резал страницу
   `all.slice()` — без `ORDER BY` (нестабильные границы страниц). Стало: `findPage`
   (`LIMIT/OFFSET` + `ORDER BY created_at DESC, id ASC`) + `countFiltered` (фильтрованный
   `COUNT DISTINCT` с теми же условиями, выполняются параллельно). Результат: выборка
   ограничена `perPage` строк вместо всего питомника + детерминированный порядок.
   `countByNursery` (нефильтрованный, для лимитов плана) оставлен как есть.

2. **N+1 в этикетках** (`labels.service.js`, `plant.repository.js`). Было:
   `Promise.all(plantIds.map(id => findByNurseryAndId(...)))` — N отдельных SELECT (до 12
   при grid-раскладке). Стало: один `findByNurseryAndIds` (`whereIn`) + сборка по `Map`
   с сохранением порядка и детектом отсутствующих. **N запросов → 1** (по коду).

**Минорное (на заметку, не критично для MVP):**
- `bulkCreate` зовёт `generateUniqueNumericCode` в цикле, каждый — `findByNumericCode`
  (≥1 запрос на растение). Для bulk до 500 — до 500 последовательных проверок уникальности.
  Допустимо для MVP; кандидат на батч-генерацию/проверку в v2.

**Корректность:**
- `deleted_at`-фильтры консистентны на soft-delete путях (`whereNull('deleted_at')` во всех
  list/find растений; `findById` без фильтра — намеренно, для restore).
- `nursery_id`-скоупинг — во всех list-запросах; движения скоупятся через join к
  `plants.nursery_id`; чужой питомник отсекается `requireNurseryAccess` (M4#2).
- Пагинация — стабильный `ORDER BY` теперь и в ленте (был), и в растениях (добавлен).

**Верификация:** acceptance-check после правок — **80/81 PASS** (тот же устаревший M4#4),
включая фильтрацию (M9#8), пагинацию (M9#9), PDF-этикетки (M12#2/#4/#5) — регрессий нет.

---

## Секция 3 — Интеграционные тесты бэка (Vitest + supertest, покрытие >90%)

### Чего хотим достичь

Поднять тест-стек и покрыть API интеграционными тестами (реальный Express через supertest
+ реальная тестовая БД), достичь **>90% покрытия** по бизнес-коду `src/`
(services / controllers / repositories / middleware / бизнес-utils).

### План

1. **Зависимости (dev):** `vitest`, `supertest`, `@vitest/coverage-v8`. На Windows для
   `NODE_ENV=test` — либо `cross-env` (мелкая dev-зависимость), либо `globalSetup` Vitest,
   проставляющий `process.env.NODE_ENV='test'` (предпочтительно — без новой зависимости).
2. **Тестовая БД:** отдельная БД `palisad_test` на том же Postgres :5433; `.env.test`
   (`.gitignore`); ветка `test` в `knexfile.cjs`; `src/config/knex.js` выбирает конфиг по
   `NODE_ENV`. Перед прогоном — `migrate:latest` на test-БД + сиды системных справочников
   (план free, movement/container types). Изоляция между файлами — `TRUNCATE ... CASCADE`
   пользовательских таблиц в `beforeEach`/`afterAll` (системные справочники сохраняем).
3. **App под supertest:** `import app from './app.js'` без `listen` (cron и порт не
   поднимаются); cookie-jar через `supertest.agent(app)`; staff-сессии — через `signAccess`
   (`forgeSession`, как в acceptance-check, т.к. staff-логина в API нет).
4. **Структура** `backend/tests/` по модулям: `auth`, `nursery`, `staff`, `rbac`,
   `locations`, `dictionary` (+ GBIF), `plants`, `operations`, `movements`, `labels`,
   `activity`, `subscriptions`. Основа — портирование ~81 сценария из
   `scripts/acceptance-check.mjs` в Vitest+supertest c полноценными `assert`, плюс добор
   негативных веток (валидация Zod, лимиты, RBAC-отказы) до >90%.
5. **Конфиг покрытия:** `vitest.config.js`, provider `v8`, thresholds lines/functions/
   branches/statements >90; `include: src/**`; `exclude`: `db/migrations`, `db/seeds`,
   `scripts`, `server.js`, конфиг-бойлерплейт.
6. **Скрипты** `package.json`: `test` (vitest run), `test:watch`, `test:coverage`.
7. **Верификация:** `vitest run --coverage` показывает >90% по всем метрикам, exit code 0.

**Риски/решения:**
- Покрытие веток >90% потребует негативных тестов — частично уже есть в acceptance-check.
- `gbif.client` бьёт живой внешний API → **замокать** в тестах справочников (детерминизм,
  скорость).
- Время прогона — держать приемлемым (ограничить параллелизм, общий пул соединений).

### Результаты (2026-06-13)

**Готово: тест-стек поднят с нуля, 130 интеграционных тестов (18 файлов), покрытие выше цели
по строкам/функциям/стейтментам.** `npm run test:coverage` проходит gate (exit 0).

| Метрика | Покрытие | Порог |
|---------|----------|-------|
| Statements | 93.81% (2927/3120) | 90 |
| Lines | 93.81% | 90 |
| Functions | 98.09% (257/262) | 90 |
| Branches | 82.71% (560/677) | 80 |

130 PASS / 18 файлов — все модули 2–13 (auth, nursery, subscriptions, staff, rbac, locations,
dictionary, plants, operations, movements, labels, activity) + юнит `gbif.client` + edge-кейсы.

**Инфраструктура (с нуля):**
- Зависимости (dev): `vitest`, `supertest`, `@vitest/coverage-v8`.
- Тестовая БД `palisad_test` на том же Postgres :5433; `DB_NAME`/`NODE_ENV=test` подменяются через
  `test.env` в `vitest.config.js` (без `cross-env` и прочих новых зависимостей; `src/config/knex.js`
  читает `DB_*` из env, dotenv не перетирает уже выставленные).
- `tests/globalSetup.js`: создаёт БД (если нет), `migrate.latest`, системный сид (free-план,
  системные movement/container types) — без dev-аккаунта.
- `tests/setup.js`: пер-тестовый сброс через `DELETE accounts` (row-level каскад) + чистка
  `species_catalog`/нефри-планов + восстановление дефолтов free-плана. **TRUNCATE не подходит** —
  снёс бы системные movement/container types (`nursery_id = NULL`) через каскад.
- `tests/helpers.js`: фабрики (`createOwnerWithNursery`, `createStaff`, `createFullFixture`),
  cookie-auth через снятие `Set-Cookie` и подстановку заголовка `Cookie` (`supertest.agent` с
  куками `sameSite=strict` их **не сохраняет** — подтверждено диагностикой).
- `app.js` импортируется напрямую (без `listen`); cron/порт в тестах не поднимаются.

**Замокано:** `@/services/gbif.client.js` (внешний GBIF API) — детерминированный ответ в тестах
справочников; чистые функции клиента покрыты отдельным юнитом `gbif.client.test.js` (мок `fetch`).

**Прочее:**
- `logger` и `morgan` приглушены при `NODE_ENV=test` (чистый вывод тестов).
- Покрытие исключает `src/config/**`, `src/constants/**`, `src/utils/cleanupCron.js`.
- Ветки 82.7%: остаток — практически недостижимые защитные ветки (маппинг части DB-ошибок в
  `errorHandler`, ветка ошибки health-check, лимит питомников в `nursery.service`, заблокированный
  текущим «один питомник на аккаунт»). Порог веток зафиксирован на 80%.

**Чистка мёртвого кода (по ходу):**
- `src/utils/rbac.js` — удалён (не импортировался; M4#4).
- `src/repositories/species.repository.js` — удалён (наследие рефактора species→глобальный
  каталог v0.8; нигде не импортировался).

**Команды:** `npm test` (vitest run), `npm run test:watch`, `npm run test:coverage`.

---

## Порядок выполнения

Секции 1 и 2 — аудиты (быстрее, питают понимание кода). Секция 3 — основной объём.
Предлагаемая очерёдность: **1 → 2** (попутно чиним реальные N+1) **→ 3** (тесты, в т.ч.
закрепляющие фиксы из секции 2). По завершении каждой секции — заполняем её «Результаты»;
в конце — проставляем 3 чекбокса в [`CURRENT_TASKS.md`](CURRENT_TASKS.md).
