# Аудит проекта «Палисад»

**Дата:** 2026-07-24 · **Ветка:** `feature/v2-multi-nursery` (a75e1b2)
**Область:** backend, frontend, база данных, тестовое покрытие.
**Метод:** чтение кода (без запуска и изменений); самые тяжёлые находки перепроверены точечно.

Каждое замечание имеет идентификатор (B — backend, F — frontend, D — база данных, T — тесты) —
удобно ссылаться при планировании исправлений.

---

## Статус исправлений

- **✅ Пункт 1 «Изоляция tenant'ов» — выполнено 2026-07-24.** Закрыты B1–B7 (сервисный слой),
  добавлен схемный рубеж D2 (составные FK) и тест-матрица T4 (`backend/tests/tenantIsolation.test.js`,
  16 тестов). Полный прогон backend — **176/176 зелёных** (было 160 + 16 новых), линт чист,
  миграция `20260724120000_tenant_isolation_composite_fks.js` обратима (up/down проверены).
  Коммит — за пользователем.
- **✅ Пункт 2 «Защита данных при эксплуатации» — выполнено 2026-07-24.** Закрыты D1
  (идемпотентный сид без `del()`), B9 (транзакции в register/createNursery/changePlan/
  createOperation/createMovement), B10 (advisory-lock `lockAccount` + проверка лимитов внутри
  транзакции для plant/nursery/user), B15 (частичный PATCH растения), B17 (безопасные колонки
  users — `password_hash` больше не утекает), B8 (errorHandler не отдаёт внутренние сообщения
  при 5xx). Заодно B35 (count вместо загрузки всех строк в `checkUserLimit`). Добавлен тест
  конкурентности T5 (`backend/tests/concurrencyLimits.test.js`, 3 теста — проверено, что без
  lock'а они падают). Полный прогон — **179/179 зелёных** (176 + 3 новых), линт чист. Схемных
  миграций не потребовалось. Коммит — за пользователем.
- **✅ Пункт 3 «Офлайн-ядро» — выполнено 2026-07-24.** Закрыты F1 (гонка `processQueue` —
  синхронный модульный мьютекс + один online-listener на модуль), F2 (идемпотентность:
  клиент шлёт `clientRequestId`, бэкенд дедуплицирует — новая колонка `client_request_id` +
  частичный UNIQUE, миграция `20260724130000`), F3 (service worker без CDN: precache app
  shell + navigation-fallback + версионирование кэшей), F4 (офлайн-старт: кэш контекста
  питомника с фолбэком в `initNurseryContext`; `initAuth` не рвёт сессию на сетевой ошибке —
  только 401), F7 (`nurseryId` фиксируется в payload очереди), F8 (реконсиляция
  `local_`→серверный id в Dexie и в остальных элементах очереди), F9 (server-wins для
  растений: `clearTable` на базовой загрузке + `softDelete`/`restore` пишут в Dexie).
  Заведена инфраструктура фронт-тестов T1 (`vitest` + `jsdom` + `fake-indexeddb`, **16
  тестов** очереди/синка/гарда) и бэкенд-тесты идемпотентности T6
  (`backend/tests/offlineSync.test.js`, 3 теста). Прогоны: **backend 182/182**, **frontend
  16/16**, оба линта без ошибок. Мёртвые `workbox-*` зависимости удалены. Вне пакета осталась
  F6 (полная очистка Dexie/SW-кэша при logout) — закрыт лишь новый кэш контекста питомника.
  Коммит — за пользователем.
- **✅ Пункт 4 «Инфраструктура качества» — выполнено 2026-07-24.** Закрыты T2 (CI: GitHub
  Actions `.github/workflows/ci.yml` — джобы `backend` [PG-сервис, `lint` + `vitest --coverage`
  с порогами 90/80], `frontend` [`test` + `build`; `lint` неблокирующий — предсуществующие
  ошибки в locations-страницах вне scope], `acceptance` [boot backend + прогон приёмки, гейт
  по exit-коду]), T3 (`acceptance-check.mjs` знает о v2: **+13 проверок** — M14 уведомления,
  M15 производственные стадии, M16 мультипитомник; `process.exit(1)` при любом FAIL для CI),
  T7 (**28 толерантных ассертов** ужесточены до точного статуса в 10 тест-файлах; худший
  `productionStages` — до строго `409`), D3 (`documentation/schema.sql` реконструирован из
  миграций: **+4 v2-таблицы** `production_stages`/`plant_stage_history`/`stage_labor_norms`/
  `notifications`, колонки `plants.stage_id` и `accounts.last_active_nursery_id`, значение
  `change_stage` в CHECK, составные FK изоляции, сид-коды приведены к фактическим
  `TRENCH`/`COLD_STORAGE`/`GREENHOUSE`; версия шапки → v2). Прогон **backend 182/182** зелёный
  после ужесточения; backend-линт 0 ошибок. Коммит — за пользователем.
- **✅ Пункт 5 «Продуктовые решения» — выполнено 2026-07-24.** Закрыты B11 (staff-логин
  доделан: вход сотрудников через тот же `POST /auth/login`, staff-JWT несёт реальную роль +
  `nursery_id` — RBAC ожил; `changePassword` различает staff/owner; `refresh` для staff по
  `userId`; изоляция по своему питомнику), B12 (смена тарифа отключена — `changePlan` → 403,
  self-service-апгрейд без биллинга закрыт), B13 (лайфцикл подписки: trial 14 дней с
  `expires_at`; ежедневный cron `expireOverdue` → downgrade на free; `notifyExpiring` шлёт
  `SUBSCRIPTION_EXPIRING` за 3 дня с дедупом по `expiring_notified_at`), F13 (фото операций:
  хранение как **bytea** в Postgres, загрузка мультипартом `POST .../photos` [multer, 512 КБ,
  image-only], стрим `GET .../photos/:id/content` с tenant-гардами, клиентский downscale,
  офлайн-съёмка через Blob в IndexedDB + очередь `attach_photo` с reconcile `local→server`).
  Прогоны: **backend 207/207** (покрытие 94%/87%/97%/94%, пороги 90/80 пройдены),
  **frontend 24/24**, оба линта 0 ошибок. Миграции `20260724140000` (expiring_notified_at) и
  `20260724160000` (photos→bytea) обратимы. Приёмка `acceptance-check.mjs` обновлена под новые
  контракты (live staff-логин M17, фото multipart/content, смена плана → 403). 4 домена —
  параллельными агентами, пересечений файлов нет. Коммит — за пользователем.
- **✅ Пункт 6 «Остальное» — «Важно» выполнено 2026-07-24.** Закрыты backend B14 (rate-limit
  login/refresh), B16 (PATCH операции → 400 вместо 500), B19 (GBIF `allSettled` + таймаут fetch),
  B21 (Zod-валидация пагинации, perPage ≤100); frontend F5 (гард logout от потери очереди), F6
  (очистка Dexie + `/api`-кэшей в clearSession), F10 (успех смены пароля), F11 (офлайн-фолбэк
  справочников в 6 сторах), F12 (сканер try/catch + 404→«не найдено»), F14 (перезагрузка при
  смене SW); БД D4 (сид — единый провижинер справочников), D5 (partial-unique системных строк),
  D6 (композитные индексы горячих запросов), D7 (notifications updated_at + CHECK type), D8
  (per-nursery unique кодов растений + скоуп сканера); тесты T8 (реальный staff-логин), T9
  (валидация env в globalSetup), T10 (контракт-тест GBIF). Прогоны: backend **226/226**
  (покрытие 94.5/87/97.5/94.5, пороги 90/80), frontend **53/53**, оба линта 0 ошибок. Миграции
  `20260724170000`–`20260724173000` обратимы; `documentation/schema.sql` синхронизирован. B18
  снят ещё через F13. Инфра-находки (B20/B29/B34) отложены по решению; «Незначительно» (~36) —
  следующим заходом. 5 доменов — параллельными агентами, пересечений файлов нет. Коммит — за
  пользователем.
  Заметка эксплуатации: D5 на проде с уже существующими дублями системных строк потребует
  дедупликации перед `CREATE UNIQUE INDEX`.

---

## Сводка

Три сквозные темы, на которых сходятся находки всех четырёх направлений:

1. **Изоляция мультитенантности держится на одной проверке.** Middleware сверяет только
   `:nurseryId` из URL с JWT; вложенные идентификаторы (plantId, locationId, tagId, stageId,
   speciesId, containerId, movementTypeId) в ряде мест не привязываются к питомнику ни в
   сервисах (B1–B7), ни на уровне FK в схеме (D2). С приходом v2 (несколько питомников на
   аккаунт) это перестало быть теоретическим риском. Тестов изоляции почти нет (T4).
2. **Офлайн-ядро — главная фишка продукта — фактически не работает.** PWA не открывается
   офлайн (F3), офлайн-старт падает на роутер-гарде (F4), очередь синхронизации подвержена
   гонкам и дублям (F1, F2), локальные id не маппятся на серверные (F8), кэш не
   инвалидируется (F9) и не чистится между аккаунтами (F6). Фронтенд при этом не покрыт ни
   одним тестом (T1).
3. **Целостность данных не защищена.** Во всём backend нет ни одной транзакции (B9), лимиты
   планов пробиваются гонкой (B10), сид безусловно стирает все данные, включая прод (D1),
   CI отсутствует (T2).

Отдельно: staff-логин не реализован — все реальные JWT имеют роль `owner`, поэтому вся
RBAC-механика в рантайме пока декоративна (B11).

| Направление | Критично | Важно | Незначительно |
|---|---|---|---|
| Backend | 7 | 14 | 15 |
| Frontend | 4 | 10 | 11 |
| База данных | 2 | 6 | 8 |
| Тесты | 4 | 6 | 5 |

---

## 1. Backend

### Критично

- **B1. Кросс-tenant чтение операций (IDOR).** ✅ **Исправлено 2026-07-24** — `getOperations`
  принимает `nurseryId` и проверяет принадлежность растения через новый `requirePlantInNursery` → 404.
  `backend/src/services/operation.service.js:12-14` + `backend/src/controllers/operation.controller.js:5` —
  `getOperations(plantId)` выбирает операции только по `plant_id`, не проверяя, что растение
  принадлежит питомнику из URL (`requireNurseryAccess` сверяет только `:nurseryId` с JWT).
  Любой аутентифицированный пользователь читает операции чужого питомника через
  `/api/nurseries/<свой>/plants/<чужой plantId>/operations`.
  *Исправление:* `requirePlant(nurseryId, plantId)` в начале, как уже сделано в `createOperation`.

- **B2. Кросс-tenant удаление/изменение операций.** ✅ **Исправлено 2026-07-24** — `updateOperation`
  и `softDelete` вызывают `requirePlantInNursery(nurseryId, plantId)` до проверки авторства/роли → 404.
  `backend/src/services/operation.service.js:86-94` — `softDelete` проверяет связь
  «операция ↔ растение», но не «растение ↔ питомник»; роль `owner` берётся из своего
  питомника → владелец любого аккаунта удаляет операции чужих растений по plantId+operationId.
  `updateOperation` (`:77-84`) прикрыт лишь проверкой авторства — тоже без проверки nursery.

- **B3. Кросс-tenant операции с фото.** ✅ **Исправлено 2026-07-24** — `attachPhoto` и `deletePhoto`
  проверяют принадлежность растения питомнику через `requirePlantInNursery` → 404.
  `backend/src/services/operation.service.js:109-125` (attachPhoto), `:127-135` (deletePhoto) —
  та же схема: можно прикреплять и удалять фото у операций чужих питомников.

- **B4. Кросс-tenant чтение движений.** ✅ **Исправлено 2026-07-24** — `getMovements` принимает
  `nurseryId` и проверяет принадлежность растения через `requirePlantInNursery` → 404.
  `backend/src/services/movement.service.js:17-19` + `backend/src/controllers/movement.controller.js:5` —
  `getMovements(plantId)` без проверки принадлежности растения; выборка джойнит имена локаций
  и пользователей чужого питомника (`movement.repository.js:3-19`) — прямая утечка данных.

- **B5. Кросс-tenant ссылки при создании/изменении растения.** ✅ **Исправлено 2026-07-24** —
  новый `resolveReferences` в plant.service резолвит `speciesId/locationId/containerId/stageId`
  через nursery-скоупные репозитории (для контейнеров/стадий — с учётом системных строк);
  в movement.service добавлен `requireMovementLocations` для `from/toLocationId` → 404.
  `backend/src/services/plant.service.js:57-69` (create), `:105-116` (update) —
  `speciesId/locationId/containerId/stageId` вставляются без проверки принадлежности питомнику
  (FK в схеме тоже не nursery-скоупные, см. D2). Можно привязать растение к сущностям чужого
  питомника, а `findPage` вернёт их названия. Аналогично `movement.service.js:41-42,47`:
  `toLocationId` не проверяется, `applyMovementToPlant` (`:72-84`) переставит растение в чужую локацию.
  *Исправление:* резолвить каждый переданный id через `*Repo.findByNurseryAndId`.

- **B6. Кросс-tenant теги.** ✅ **Исправлено 2026-07-24** — `addTag`/`removeTag` проверяют `tagId`
  через новый `requireTag` (`tagRepo.findById(nurseryId, tagId)`) → 404.
  `backend/src/services/plant.service.js:164-173` — `addTag/removeTag` не проверяют
  принадлежность `tagId` питомнику (`tagRepo.findById(nurseryId, id)` существует, но не
  вызывается); `getPlantById → getTagsByPlant` вернёт чужое имя/цвет тега.

- **B7. Тип движения без изоляции питомника.** ✅ **Исправлено 2026-07-24** — прямой `db('movement_types')`
  заменён на `movementTypeRepo.findById(nurseryId, typeId)` (системные + свои, но не чужие), с сохранением
  проверки `is_active`; SQL из сервиса убран.
  `backend/src/services/movement.service.js:30-35` — прямой запрос `db('movement_types')`
  без фильтра `nursery_id IS NULL OR nursery_id = :nurseryId`, хотя
  `movementTypeRepo.findById(nurseryId, id)` реализован. Можно использовать чужой
  пользовательский тип движения (включая его `sets_status`). Заодно нарушение слоёв — SQL в сервисе.

### Важно

- **B8. errorHandler отдаёт внутренние сообщения клиенту.** ✅ **Исправлено 2026-07-24** —
  для ответов со `status >= 500` наружу идёт нейтральное «Внутренняя ошибка сервера»; текст
  `err.message` отдаётся только для ожидаемых ответов (AppError/замапленные ошибки БД, status < 500).
  Реальная причина по-прежнему в логе.
  `backend/src/middlewares/errorHandler.js:7-14` — для любых не-AppError клиент получает
  `err.message` (тексты SQL-ошибок, имена таблиц/констрейнтов). Для 500 возвращать
  нейтральное сообщение, детали — только в лог.

- **B9. Ни одной транзакции во всём backend.** ✅ **Исправлено 2026-07-24** — репозитории
  получили опциональный `executor = db`; `register`, `createNursery`, `changePlan`,
  `createOperation`, `createMovement` обёрнуты в `db.transaction`, все их записи идут через `trx`
  (побочные эффекты операции вынесены в `applyOperationSideEffects`). `logActivity`/`notify`
  остаются вне транзакции (best-effort, не ронять бизнес-операцию).
  Многошаговые операции выполняются вне `db.transaction`:
  `auth.service.js:35-45` (account + subscription — при сбое второго insert аккаунт остаётся
  без подписки и все planGuards кидают 403), `nursery.service.js:46-56` (nursery + owner-user),
  `subscription.service.js:23-28` (`cancelActive` уже закоммичен, если `create` упадёт —
  аккаунт без активной подписки), `operation.service.js:36-65` (update растения +
  stage_history + операция), `movement.service.js:37-53` (movement + статус/локация растения).

- **B10. Race condition на лимитах плана.** ✅ **Исправлено 2026-07-24** — добавлен
  `planGuards.lockAccount(trx, accountId)` (транзакционный `pg_advisory_xact_lock` по хэшу
  accountId); в `createPlant`, `bulkCreate`, `createNursery`, `staff.createUser` пара
  «посчитал → вставил» выполняется под этим локом внутри одной транзакции. Покрыто тестом T5
  (проверено, что без лока тест падает).
  `backend/src/utils/planGuards.js:13-23` + `plant.service.js:52-53, 82-83`,
  `nursery.service.js:38-39`, `staff.service.js:112-122` — схема «прочитал count → вставил»
  без транзакции/блокировки: параллельные запросы пробивают plant_limit/user_limit/nursery_limit.
  *Исправление:* advisory lock или проверка в транзакции с `SELECT ... FOR UPDATE`.

- **B11. RBAC фактически не работает: сотрудники не могут войти.** ✅ **Исправлено 2026-07-24** —
  staff-логин доделан: вход через тот же `POST /auth/login` (owner-флоу не тронут), staff-JWT
  несёт реальную роль + `nursery_id` → RBAC ожил; `changePassword` различает staff/owner;
  `refresh` для staff по `userId`; изоляция по своему питомнику через существующий
  `requireNurseryAccess`. Допущение: email активного сотрудника глобально уникален
  (детерминированный tie-break по `created_at`). Тест `backend/tests/staffAuth.test.js`.
  `backend/src/services/auth.service.js:50-61, 141-154` — логин существует только по таблице
  `accounts`; `resolveActiveContext` ищет исключительно `role='owner'`
  (`user.repository.js:12-20`). Staff-пользователи с временными паролями и
  `must_change_password` не имеют ни одного эндпоинта для входа — все реальные JWT имеют
  `role='owner'`, вся система `requireRole`/WRITE_ROLES в рантайме мертва. Документация
  (`backend/documentation/modules/backend-modules.md:90`) описывает фичу как рабочую.
  *Исправление:* доделать staff-логин либо явно зафиксировать ограничение.

- **B12. Смена тарифного плана без оплаты/проверки.** ✅ **Исправлено 2026-07-24** —
  `changePlan` возвращает 403 (`POST /subscriptions/change` отключён): self-service-апгрейд без
  биллинга закрыт; тест обновлён на 403; восстановление под будущий биллинг помечено TODO.
  `backend/src/services/subscription.service.js:17-29` + `subscription.router.js:13` —
  `POST /api/subscriptions/change` мгновенно переводит аккаунт на любой активный план:
  бесплатный self-service-апгрейд. Если биллинг вне скоупа MVP — ограничить выбор планов или TODO-гард.

- **B13. Подписка никогда не истекает.** ✅ **Исправлено 2026-07-24** — trial получает
  `expires_at` (+14 дней); ежедневный cron `expireOverdue()` помечает просроченные `expired` и
  создаёт активную free-подписку (downgrade на free-лимиты, `getActiveWithPlan` остаётся
  валиден); `notifyExpiring()` шлёт `SUBSCRIPTION_EXPIRING` за 3 дня с дедупом по новой колонке
  `expiring_notified_at` (миграция `20260724140000`). Тесты `backend/tests/subscriptionLifecycle.test.js`.
  `backend/src/repositories/subscription.repository.js:14-30` — `expires_at` не используется
  нигде в коде, cron перевода в `expired` отсутствует (единственный cron — очистка
  activity_logs). Trial бессрочен; тип `SUBSCRIPTION_EXPIRING` (`notification.constants.js:7`)
  объявлен, но продюсера не имеет.

- **B14. Нет rate limiting (включая /login и /refresh).** ✅ **Исправлено 2026-07-24** — `express-rate-limit`: общий лимитер на `/api` + строгий на `POST /auth/login` и `/auth/refresh` (429 при брутфорсе); в NODE_ENV=test лимиты сняты, кроме целевого теста.
  `backend/app.js` — ни `express-rate-limit`, ни аналога. Брутфорс по `POST /api/auth/login`
  ничем не ограничен.

- **B15. PATCH растения затирает непереданные поля.** ✅ **Исправлено 2026-07-24** —
  `updatePlant` собирает объект update через `buildPlantUpdate(data)` только из реально
  переданных ключей (`data[key] !== undefined`); непереданные поля не трогаются, явный `null`
  по-прежнему очищает поле.
  `backend/src/services/plant.service.js:105-116` — сервис пишет `data.X ?? null` для каждого
  поля: PATCH только с `notes` обнулит `nursery_species_id`, `location_id`, `stage_id` и т.д.
  Потеря данных при любом частичном обновлении.
  *Исправление:* собирать объект update из реально переданных ключей (образец — `location.service.updateLocation`).

- **B16. PATCH операции падает с 500 на валидном входе.** ✅ **Исправлено 2026-07-24** — `updateOperation` собирает UPDATE по whitelist (реально патчабелен только `notes`); `type`/`newContainerId`/`newStageId` через PATCH → `AppError(400)` вместо SQL-500.
  `backend/src/utils/validators/operation.validators.js:12-17` + `operation.service.js:83` —
  схема разрешает `newContainerId/newStageId`, а сервис передаёт body напрямую в
  `UPDATE operations`, где таких колонок нет → SQL-ошибка 500. Смена `type` через PATCH не
  выполняет side-effects (transplant/change_stage).

- **B17. Утечка password_hash в ответах staff API.** ✅ **Исправлено 2026-07-24** — введён
  список `SAFE_USER_COLUMNS` (без `password_hash`); `create`/`updateById` используют
  `returning(SAFE_USER_COLUMNS)`, а `findByNurseryAndId` (путь `GET /users/:id`) —
  `select(SAFE_USER_COLUMNS)`. Хэш больше не покидает репозиторий.
  `backend/src/repositories/user.repository.js:35-40, 78-84` (`returning('*')`) +
  `staff.controller.js:29` и далее — создание/обновление сотрудника возвращает клиенту всю
  строку users, включая Argon2-хэш. Явно перечислить возвращаемые колонки.

- **B18. attachPhoto без валидации входа.** ✅ **Снято 2026-07-24 (через F13)** — старый невалидируемый `{url}`-путь удалён; фото принимается только multipart image-файлом (multer, 512 КБ, image-only), `req.body.url` в БД больше не пишется.
  `backend/src/routes/operation.router.js:31` (нет `validate(...)`) — `req.body.url` пишется
  в БД без Zod: любая длина, любой контент, включая `javascript:`-URI (stored-XSS-вектор для фронта).

- **B19. GBIF-сбой ломает весь поиск видов; fetch без таймаута.** ✅ **Исправлено 2026-07-24** — GBIF-ветка через `Promise.allSettled` (локальные результаты отдаются при сбое GBIF, не 502); `gbifFetch` с AbortController + таймаут 5 с.
  `backend/src/services/dictionary.service.js:22-26` — `Promise.all` с GBIF: при его
  недоступности весь `/species/search` возвращает 502, хотя локальные результаты есть
  (нужен `Promise.allSettled`). `gbif.client.js:7-9, 24` — fetch без AbortController/таймаута.

- **B20. Нет graceful shutdown; npm как PID 1.**
  `backend/server.js` — нет обработчиков SIGTERM/SIGINT, пул Knex не закрывается.
  `backend/Dockerfile` — `CMD ["npm","run","start"]`: npm не пробрасывает SIGTERM в node →
  контейнер убивается по таймауту; нет `USER` (root) и `HEALTHCHECK`.

- **B21. Пагинация уведомлений/журнала без валидации и верхней границы.** ✅ **Исправлено 2026-07-24** — `paginationSchema`/`parsePagination` (page≥1, perPage зажат 1..100, дефолт 20, мусор→дефолт) в notification/activityLog сервисах; `perPage=1000000`/`page=abc` больше не выгружают таблицу и не дают 500.
  `backend/src/services/notification.service.js:5-7`, `activityLog.service.js:4-6` —
  `Number(page)/Number(perPage)` без Zod: `perPage=1000000` выгружает таблицу,
  `page=abc` → NaN → 500. Ввести схему с `max(100)` (образец — `plantFiltersSchema`).

### Незначительно

- **B22.** `backend/src/routes/nursery.router.js:19, 23-28` — `PATCH /my` и `PATCH /:nurseryId`
  без `requireRole`; при появлении staff-логина любой observer сможет переименовать питомник.
- **B23.** `backend/src/services/dictionary.service.js:228-233` — обе ветки
  `if (used > 0) ... else ...` в `deleteContainerType` идентичны, вызов `countUsedByPlants` бессмыслен.
- **B24.** `backend/src/services/dictionary.service.js:236-240` — мёртвый код `ensureStructureRole`.
- **B25.** `backend/src/repositories/subscription.repository.js:27` —
  `select('subscriptions.*', 'plans.*')`: поля плана перезаписывают поля подписки,
  `/api/subscriptions/current` возвращает id плана вместо id подписки.
- **B26.** `backend/src/middlewares/validate.js:3` — валидируется только body; невалидные UUID
  в `:id`-параметрах дают `22P02` от Postgres и 500 вместо 400.
- **B27.** `backend/src/services/nursery.service.js:47` — пароль owner-заглушки из
  `Math.random().toString(36)` — некриптографическая энтропия; использовать `crypto.randomBytes`.
- **B28.** `backend/src/services/plant.service.js:81-103, 184-194` — в bulk-создании
  уникальность numeric_code проверяется только по БД, не внутри партии (близкие `Date.now()`
  → коллизия → 409 на весь батч); нет `logActivity` для bulk.
- **B29.** `backend/src/config/logger.js:6` — в production уровень `warn` (бизнес-события
  `info` теряются); `:14-15` — файлы `logs/*` в контейнере не персистентны;
  `backend/app.js:34-36` — morgan `'dev'` и в проде.
- **B30.** `backend/src/constants/auth.constants.js:3-7` — refresh-cookie без `path: '/api/auth'`,
  отправляется на каждый запрос.
- **B31.** `backend/src/middlewares/requireAuth.js:5-17` — не проверяет `is_active`; после
  `changeRole`/`toggleStatus` старый access-токен действует до 15 минут.
- **B32.** `backend/src/routes/plant.router.js:41` (restore), `movement.router.js:21` (delete) —
  проверка роли спрятана в сервисе, а не в middleware, вразрез с общим паттерном.
- **B33.** `backend/app.js:53` — маршрут-сирота `GET /api/plans` дублирует
  `GET /api/subscriptions/plans` мимо роутеров.
- **B34.** `docker-compose.yml:7-9` — хардкод креденшалов БД + проброс 5433 наружу; вынести в env.
- **B35.** ✅ **Исправлено 2026-07-24** (попутно с B10) — `checkUserLimit` использует
  `userRepo.countByNursery` вместо загрузки всех строк.
  `backend/src/services/staff.service.js:118` — `checkUserLimit` тянет все строки
  через `findAllByNursery` вместо count-запроса.
- **B36.** Устаревшая документация схемы — см. D3 (общая находка с БД).

---

## 2. Frontend

### Критично

- **F1. Гонка в `processQueue` → дублирование записей на сервере.** ✅ **Исправлено 2026-07-24** —
  `syncStatus`/мьютекс `isProcessing` выставляется синхронно до первого `await`, а слушатель
  `online` регистрируется один раз на модуль (не по инстансу composable). Покрыто фронт-тестом
  (два параллельных `processQueue` → один POST).
  `frontend/src/composables/useSyncManager.js:23-34` — guard `syncStatus === 'syncing'`
  проверяется синхронно, но статус выставляется только после `await getPending()`.
  `useSyncManager()` инстанцируется трижды (`AppLayout.vue:71`, `SyncStatusBadge.vue:55`,
  `useNurserySwitch.js:10`), каждый вешает свой `watch(isOnline)` — при событии `online` все
  три проходят guard до установки статуса, читают одну очередь и шлют одни и те же
  `create_operation`/`create_movement` — дубли на сервере.
  *Исправление:* выставлять `syncStatus = 'syncing'` синхронно до первого `await` (или
  модульный promise-mutex); watcher регистрировать один раз на модуль.

- **F2. Обрыв сети посреди запроса → дубль операции.** ✅ **Исправлено 2026-07-24** —
  клиент генерирует `clientRequestId` (UUID) на всю жизнь записи и шлёт его и онлайн, и при
  replay из очереди; бэкенд дедуплицирует (новая колонка `client_request_id` + частичный
  UNIQUE `WHERE client_request_id IS NOT NULL`, миграция `20260724130000`; сервисы возвращают
  уже созданную запись, не применяя побочные эффекты заново). Заодно 404 на `delete_*`
  трактуется как идемпотентный успех. Покрыто T6 (backend) + фронт-тестами.
  `frontend/src/composables/useSyncManager.js:71-89` — если POST дошёл до сервера, но ответ
  потерялся, `catch` → `markFailed` → элемент остаётся pending → повторная отправка создаёт
  вторую запись. Идемпотентного ключа в payload нет.
  *Исправление:* клиентский UUID при постановке в очередь + дедупликация на бэкенде.

- **F3. PWA не загружается офлайн: нет precache app shell.** ✅ **Исправлено 2026-07-24** —
  `public/sw.js` переписан без CDN: `install` делает precache app shell (`/`, `/index.html`),
  навигация — network-first с офлайн-фолбэком на кэш `index.html`, хэшированные ассеты —
  cache-first, `/api/` — network-first; при смене `VERSION` старые кэши (в т.ч. Workbox
  `static-v1`/`api-v1`) удаляются в `activate`. Мёртвые `workbox-routing`/`workbox-strategies`
  удалены из `package.json`.
  `frontend/public/sw.js:8-13` — кэшируются только `script/style/image/font`; навигационные
  запросы не обрабатываются, precache-манифеста нет — после перезапуска браузера офлайн
  `index.html` взять неоткуда, приложение не открывается вовсе. Вдобавок `sw.js:2` тянет
  Workbox с CDN (без сети SW не установится), а пакеты `workbox-routing`/`workbox-strategies`
  из `package.json` не используются (мёртвые зависимости).
  *Исправление:* `vite-plugin-pwa`/injectManifest с precache бандлов и NavigationRoute-фолбэком,
  workbox бандлить локально.

- **F4. Офлайн-старт приложения ломается на роутер-гарде.** ✅ **Исправлено 2026-07-24** —
  (а) `initNurseryContext` ловит ошибку `Promise.all` и поднимает последний контекст питомника
  из localStorage (`persistContext`/`hydrateFromCache`) — нет пустого экрана и ложного
  редиректа на `/nursery/create`; (б) `initAuth` сбрасывает сессию только при `status === 401`,
  сетевую/офлайн-ошибку рефреша игнорирует. Новый кэш контекста чистится в `clearSession`
  (защита от протечки между аккаунтами).
  Две ветки, обе фатальны:
  (а) `frontend/src/stores/nursery.store.js:143-157` — `initNurseryContext` делает
  `Promise.all` из трёх fetch без `catch`; исключение вылетает из `router.beforeEach`
  (`router/index.js:161, 188-199`) — пустой экран; при повторной навигации
  `isInitialized === true`, `nursery === null` → ложный редирект на `/nursery/create`.
  Активный питомник офлайн нигде не кэшируется.
  (б) `frontend/src/stores/auth.store.js:187-191` — `initAuth` не различает 401 и сетевую
  ошибку: офлайн-сбой `/auth/refresh` → `clearSession()` → редирект на `/login`.
  *Исправление:* офлайн-фолбэк контекста питомника из IndexedDB/localStorage; чистить сессию
  только при `status === 401`.

### Важно

- **F5. Logout стирает несинхронизированную очередь без предупреждения.** ✅ **Исправлено 2026-07-24** — `logout({force})` + `hasUnsyncedData()` (sync_queue/pending_photos); при непустой очереди возвращает `{ok:false, pending:true}`, компоненты (AppLayout/ChangePasswordPage) показывают подтверждение перед разрушением.
  `frontend/src/stores/auth.store.js:138-149` — `logout()` вызывает `clearDomainTables()`,
  а `DOMAIN_TABLES` (`db/indexedDb.js:37-53`) включает `sync_queue` и `pending_photos`.
  Гарда, аналогичного `ensureCanSwitch`, нет — офлайн-работа теряется молча.

- **F6. Кросс-аккаунтная утечка кэша при истечении сессии.** ✅ **Исправлено 2026-07-24** — `clearSession` (async) чистит Dexie (`clearDomainTables`) и `/api`-кэши (`clearOfflineCaches`); app-shell/ассеты сохраняются ради офлайн-оболочки; вызовы в http.js/initAuth переведены на `await`.
  `frontend/src/services/http.js:29-40` — по невалидному refresh вызывается
  `clearSession()` (`auth.store.js:227-232`), который не чистит IndexedDB и SW-кэш:
  следующий пользователь браузера офлайн увидит чужие растения, а чужая `sync_queue` уйдёт
  под его сессией (см. F7). Кэш `api-v1` (`public/sw.js:15-20`) не чистится даже при обычном
  logout. *Исправление:* чистить Dexie и `caches.delete('api-v1')` в `clearSession`/logout.

- **F7. Очередь синхронизации не привязана к nurseryId.** ✅ **Исправлено 2026-07-24** —
  `nurseryId` кладётся в payload при `addToQueue` (create/update/delete/attach_photo), а
  `useSyncManager` берёт его из payload (`payload.nurseryId`), а не из активного стора. Покрыто
  фронт-тестом.
  `frontend/src/composables/useSyncManager.js:66-67, 104-105` — `nurseryId` берётся из стора
  в момент отправки, а не фиксируется при постановке в очередь (`operations.store.js:115`,
  `movements.store.js:99`). Активный питомник хранится на сервере: если его переключили с
  другого устройства, очередь после перезапуска уйдёт в чужой питомник.
  *Исправление:* сохранять `nurseryId` в payload при `addToQueue`.

- **F8. `local_` id офлайн-записей никогда не заменяются серверными.** ✅ **Исправлено 2026-07-24** —
  create-элемент несёт `localId`; после успешного синка `reconcileLocalId` удаляет локальную
  запись из Dexie, кладёт серверную и переписывает `local_`-ссылки (`id`/`operationId`) в
  остальных ещё не отправленных элементах очереди. В одном прогоне элементы перечитываются из
  БД перед отправкой, чтобы уже увидеть заменённый id. Покрыто фронт-тестами.
  `frontend/src/stores/operations.store.js:90-104`, `movements.store.js:81-98` — после
  успешного синка локальная запись не удаляется → дубль при следующем офлайн-просмотре;
  редактирование/удаление офлайн-созданной записи ставит в очередь `local_...` id
  (`operations.store.js:147, 173`) → PATCH/DELETE с несуществующим id гарантированно упадёт.
  *Исправление:* маппинг local→server id при обработке `create_*` с обновлением Dexie и
  последующих элементов очереди.

- **F9. «Сервер побеждает» не работает для удалений: кэш растений не инвалидируется.** ✅ **Исправлено 2026-07-24** —
  `fetchPlants` на базовой загрузке (первая страница без фильтров) делает `clearTable('plants')`
  перед `upsertMany` (удалённые на сервере растения не «воскресают»; растения офлайн не
  создаются, поэтому clear безопасен). `softDelete` пишет `deleted_at` в Dexie, `restore` —
  upsert. На страницах >1 и с фильтрами — прежний upsert, чтобы не терять кэш.
  `frontend/src/stores/plants.store.js:96-98` — `fetchPlants` делает `bulkPut` поверх кэша,
  ничего не удаляя: удалённые на сервере растения живут в IndexedDB вечно; `softDelete`
  (строки 190-191) не трогает Dexie — офлайн растение «воскресает». Корректный паттерн есть
  в `productionStages.store.js:31-32` (`clearTable` + `upsert`).

- **F10. Успешная смена пароля показывается как ошибка.** ✅ **Исправлено 2026-07-24** — успешная ветка `changePassword` возвращает `{ ok: true }`; `ChangePasswordPage` больше не показывает ложную ошибку.
  `frontend/src/stores/auth.store.js:205-210` — при успехе action делает `return` без
  значения; `ChangePasswordPage.vue:73-77` проверяет `if (!result?.ok)` → пользователь видит
  «Не удалось обновить пароль», хотя пароль сменён. *Исправление:* `return { ok: true }`.

- **F11. Справочники не читаются из кэша офлайн — `loadFromLocal` мёртв в 6 сторах.** ✅ **Исправлено 2026-07-24** — catch-ветка `fetch*` всех 6 справочных сторов (species/locations/tags/containerTypes/movementTypes/productionStages) зовёт `loadFromLocal()`; офлайн фильтры и названия работают из Dexie.
  `PlantsPage.vue:130-144`, `PlantDetailPage.vue:137-158` — офлайн fetch-методы возвращают
  `{ok:false}` и списки пусты; `loadFromLocal` в `species.store.js:41`, `locations.store.js:44`,
  `tags.store.js:39`, `containerTypes.store.js:44`, `movementTypes.store.js:41`,
  `productionStages.store.js:42` не вызываются нигде. Офлайн пропадают фильтры и названия
  локаций/стадий/типов.

- **F12. Сканер: необработанные исключения и зависший спиннер.** ✅ **Исправлено 2026-07-24** — `findByQr`/`findByNumericCode` в try/catch (404/500→null), `handleScanned`/`handleManualSearch` в try/catch с `finally { isSearching=false }`; 404 (в т.ч. кросс-nursery код от D8) → «не найдено», не краш.
  `frontend/src/stores/plants.store.js:259-262, 276-279` — онлайн-ветки `findByQr/findByNumericCode`
  не ловят ошибки HTTP; `ScannerPage.vue:82-98` — при исключении `isSearching.value = false`
  не выполняется: кнопка навсегда в loading; в `handleScanned` (58-68) — unhandled rejection.

- **F13. Фича фото недоделана, синк фото теряет данные by design.** ✅ **Исправлено 2026-07-24** —
  фото операций хранятся как **bytea** в Postgres (миграция `20260724160000`); загрузка
  мультипартом `POST .../photos` (multer, 512 КБ, image-only → 413/415), стрим
  `GET .../photos/:id/content` с tenant-гардами; фронт: клиентский downscale, онлайн→FormData,
  офлайн-съёмка (Blob в IndexedDB + очередь `attach_photo`, reconcile `local→server` доводит
  фото до операции), показ синк/локальных фото. Баг `{ url: File }`→`{}` устранён; старый
  невалидируемый `{url}`-путь убран (снимает вектор B18).
  `operations.store.js:222-236` — `syncPending` помечает pending-фото done, ничего не
  отправляя; `attachPhoto` (183-204) не вызывается ни из одного компонента;
  `pendingPhotos.service.js:3-13` кладёт `File` в поле `blob`, а `useSyncManager.js:119-122`
  шлёт `{ url: pending.blob }` — `File` сериализуется в `{}`. Пустые заглушки `syncPending`
  в `plants.store.js:313-315` и `movements.store.js:131-133`.
  *Исправление:* удалить или доделать (Blob + FormData либо base64).

- **F14. Обновление версии PWA: `skipWaiting` без перезагрузки клиентов.** ✅ **Исправлено 2026-07-24** — `controllerchange` перезагружает клиента один раз при смене уже активного SW (первую установку не трогает, guard от петли); синхронизирует бандл с новым кэшем.
  `frontend/public/sw.js:5-6` + `registerServiceWorker.js:53-55` — новый SW мгновенно
  перехватывает клиентов, но `controllerchange` только логирует: старое приложение работает
  с новым кэшем (возможны падения ленивых чанков), подсказки «доступна новая версия» нет.

### Незначительно

- **F15.** `frontend/public/sw.js:10-12` — `CacheFirst 'static-v1'` без ExpirationPlugin:
  бандлы старых деплоев копятся бессрочно.
- **F16.** `frontend/src/composables/useOnlineStatus.js:14-22` — вызывается внутри actions
  Pinia (`plants.store.js:252`, `operations.store.js:51`, `movements.store.js:50`):
  `onMounted` вне setup не сработает, `isOnline` там — разовый снапшот `navigator.onLine`.
- **F17.** `frontend/src/stores/movements.store.js:109-129` — `deleteMovement` без
  офлайн-ветки, хотя `delete_movement` объявлен и обрабатывается в syncManager; офлайн-ветка
  `createMovement` не применяет `applyMovementToPlant` — статус/локация растения офлайн не
  обновляются; `localOperation` (`operations.store.js:90-97`) теряет поля formData.
- **F18.** `frontend/src/services/syncQueue.service.js` — файл-обёртка целиком мёртвый код
  (никем не импортируется); статусы `PROCESSING/DONE` из `constants/syncQueue.constants.js:12-14`
  не используются. Дублирует имя с `db/syncQueue.service.js` — риск рассинхронизации (см. T15).
- **F19.** `frontend/src/stores/auth.store.js:36-37, 81-96` — токенный код мёртв
  (аутентификация cookie-based), при этом refresh-токен хранился бы в localStorage —
  удалить вместе с Authorization-веткой `http.js:50-52`.
- **F20.** `frontend/src/stores/notifications.store.js:84-86` — поллинг каждые 60 с
  продолжается офлайн; `state.error` нигде не отображается.
- **F21.** `frontend/src/pages/scanner/components/QrScanner.vue:41-60` — при размонтировании
  до резолва `decodeFromVideoDevice` стрим камеры утекает; `props.active` без `watch`.
- **F22.** `frontend/src/stores/nursery.store.js:158-165` — `resetState` не сбрасывает `nurseryError`.
- **F23.** `frontend/src/pages/catalog/CatalogPage.vue` — 532 строки, крупнейший компонент
  (4 секции справочников инлайн); `LocationsPage.vue` — 407 строк.
- **F24.** `PlantsPage.vue:27-37` + `plants.store.js:32-74` — DataTable в режиме `lazy`
  получает `:value="plantsStore.filtered"`: клиентский getter повторно фильтрует серверную
  страницу, `totalRecords` может не совпадать с числом строк.
- **F25.** `AppLayout.vue:87-96` — мёртвые пункты меню с `visible: false`, продублированные
  в админ-секции; `main.js:45` — `http.get('/health').catch(() => {})` с проглоченной ошибкой.

---

## 3. База данных

### Критично

- **D1. Сид безусловно стирает все данные — включая продовые.** ✅ **Исправлено 2026-07-24** —
  все верхнеуровневые `del()` убраны. План Free провижинится через `onConflict('slug').merge()`;
  системные `movement_types`/`container_types`/`production_stages` — идемпотентным
  insert-if-not-exists по натуральному ключу при `nursery_id IS NULL` (составной UNIQUE с
  NULLABLE `nursery_id` не ловится через onConflict). Демо-данные строго под
  `NODE_ENV !== 'production'` и идемпотентны (ранний выход при существующем демо-аккаунте).
  `backend/db/seeds/001_mvp_seed.js:7-14` — `del()` по `subscriptions`, `users`, `nurseries`,
  `accounts`, `plans`, `movement_types`, `container_types`, `production_stages` выполняется
  без проверки окружения; гард `NODE_ENV !== 'production'` (строка 60) прикрывает только
  вставку демо-аккаунта. Сид при этом содержит производственные справочники (план `free`,
  системные типы), т.е. предназначен для прода. Запуск в prod удалит все аккаунты и каскадом —
  данные всех tenant'ов. Побочно: `movement_types.del()` упадёт с FK-ошибкой на любой БД с
  движениями. *Исправление:* справочники — идемпотентным upsert'ом (`onConflict().merge()`)
  без `del()`; демо-данные — в отдельный dev-only сид.

- **D2. FK не обеспечивают изоляцию между питомниками.** ✅ **Исправлено частично 2026-07-24** —
  миграция `20260724120000_tenant_isolation_composite_fks.js` перевела `plants.location_id` и
  `plants.nursery_species_id` на составные FK `(…, nursery_id) → parent(id, nursery_id)` с
  `UNIQUE(id, nursery_id)` на родителях и `ON DELETE SET NULL (col)` (PG15+). `container_id`/`stage_id`
  на composite FK не переводятся намеренно (системные строки с `nursery_id IS NULL`) — их изоляцию
  держит сервисный слой (B5). FK подтверждены в БД, миграция обратима.
  `backend/db/migrations/20260614140000_create_production_stages.js:26` (`plants.stage_id`),
  `20260409110000_refactor_species_to_global_catalog.js:36-42` (`plants.nursery_species_id`),
  `20260408073000_init_mvp_schema.js:149-150` (`plants.location_id`, `plants.container_id`) —
  FK ссылаются только на `id` родителя, не требуя совпадения `nursery_id`; сервис
  принадлежность тоже не проверяет (см. B5). Схема — последний рубеж изоляции, и он отсутствует.
  *Исправление:* составные FK `(nursery_id, location_id) REFERENCES locations(id, nursery_id)`
  (с `UNIQUE(id, nursery_id)` на родителях; для `stage_id` — с учётом системных NULL-строк)
  и/или обязательная валидация в сервисе.

### Важно

- **D3. schema.sql устарел — весь v2 в нём отсутствует.** ✅ **Исправлено 2026-07-24** —
  `documentation/schema.sql` реконструирован из миграций (без живой БД): добавлены таблицы
  `production_stages`, `plant_stage_history`, `stage_labor_norms`, `notifications`; колонки
  `plants.stage_id`, `accounts.last_active_nursery_id`, `operations/movements.client_request_id`;
  значение `change_stage` в CHECK `operations.type`; составные FK изоляции для `plants`; шапка → v2.
  Закомментированный сид контейнеров приведён к фактическому (`TRENCH`/`COLD_STORAGE`/`GREENHOUSE`).
  `backend/documentation/schema.sql:3` (версия «MVP v0.8») — нет таблиц `notifications`,
  `production_stages`, `plant_stage_history`, `stage_labor_norms`, колонок `plants.stage_id`,
  `accounts.last_active_nursery_id`, значения `change_stage` в CHECK операций.
  Закомментированный сид (`schema.sql:403-405`) расходится с фактическим
  (`001_mvp_seed.js:48-50`: `TRENCH/COLD_STORAGE/GREENHOUSE`).
  *Исправление:* перегенерировать из фактической БД (`pg_dump --schema-only`).

- **D4. Справочные данные разъехались между миграциями и сидами.** ✅ **Исправлено 2026-07-24** — сид (`001_mvp_seed.js`) стал единым идемпотентным провижинером всех трёх системных справочников (movement_types/container_types/production_stages); дублирующий data-insert стадий убран из миграции `20260614140000` (DDL не тронут).
  `20260614140000_create_production_stages.js:1-6, 54-56` — системные стадии зашиты в
  миграцию, тогда как системные `movement_types`/`container_types` существуют только в сиде.
  Свежая БД «только миграции» получает стадии, но не типы движений — `arrival/sale/write_off`
  неработоспособны. Плюс дублирование 4 стадий в миграции и сиде.
  *Исправление:* один механизм провижининга системных справочников (идемпотентный сид) для всех трёх таблиц.

- **D5. Системные строки справочников не защищены UNIQUE из-за NULL.** ✅ **Исправлено 2026-07-24** — миграция `20260724170000`: partial-unique `WHERE nursery_id IS NULL` на production_stages(slug)/movement_types(slug)/container_types(code). Заметка: на проде с уже существующими дублями индекс упадёт — нужна предварительная дедупликация.
  `20260614140000:14, 22` — `nursery_id` nullable + `UNIQUE(nursery_id, slug)`: в PostgreSQL
  NULL'ы в unique различны, системные строки можно дублировать. То же у `movement_types`
  (init:121) и `container_types` (init:139).
  *Исправление:* partial unique `... WHERE nursery_id IS NULL` либо `UNIQUE NULLS NOT DISTINCT` (PG15+).

- **D6. Горячие запросы не покрыты композитными индексами.** ✅ **Исправлено 2026-07-24** — миграция `20260724171000`: `plants(nursery_id, created_at DESC, id) WHERE deleted_at IS NULL`, `activity_logs(nursery_id, created_at DESC)`, `notifications(nursery_id, user_id, created_at DESC)`.
  Реестр растений (`plant.repository.js:52-74`): `WHERE nursery_id AND deleted_at IS NULL
  ORDER BY created_at DESC, id` — есть только `idx_plants_active(nursery_id)` (init:227),
  нужен `(nursery_id, created_at DESC, id) WHERE deleted_at IS NULL`.
  Лента активности (`activityLog.repository.js:7-26`): индексы раздельные (init:248, 251),
  нужен `(nursery_id, created_at DESC)`.
  Уведомления (`notification.repository.js:19-27`): `idx_notifications_user(nursery_id, user_id)`
  без `created_at`; `idx_notifications_created_at` не используется ни одним запросом,
  нужен `(nursery_id, user_id, created_at DESC)`.

- **D7. notifications нарушает заявленные принципы схемы.** ✅ **Исправлено 2026-07-24** — миграция `20260724172000`: `notifications.updated_at` (NOT NULL DEFAULT now()) + `chk_notifications_type` CHECK по полному списку типов из `notification.constants.js`.
  `20260614130000_create_notifications.js:5-13` — таблица мутируемая (`is_read`), но
  `updated_at` отсутствует; `type` — свободный текст без CHECK, хотя у всех остальных таблиц
  CHECK-и есть.

- **D8. Глобальная уникальность numeric_code/qr_code не адаптирована к мультитенантности.** ✅ **Исправлено 2026-07-24** — миграция `20260724173000`: сняты глобальные `UNIQUE(qr_code)`/`UNIQUE(numeric_code)`, добавлены составные partial `(nursery_id, qr_code)`/`(nursery_id, numeric_code)`; `findByQrCode`/`findByNumericCode` и генератор кода заскоуплены по питомнику (сканер строго nursery-scoped, кросс-nursery код → 404).
  `20260408073000:151-152` — `UNIQUE(qr_code)`/`UNIQUE(numeric_code)` глобальные;
  8-значный код генерируется из `Date.now()` (`plant.service.js:184-194`) в общем на всех
  tenant'ов пространстве: коды конкурируют между питомниками, вероятность коллизий растёт с
  числом клиентов, после 10 неудач — HTTP 500. Изоляция чтения держится на app-проверке
  после глобального поиска (`plant.repository.js:107-113`).
  *Исправление:* для v2 — составной unique `(nursery_id, numeric_code)` + скоуп поиска в репозитории.

### Незначительно

- **D9. Дублирующие/избыточные индексы** (лишняя запись при INSERT/UPDATE в самой горячей таблице):
  `init:225-226` (`idx_plants_qr`, `idx_plants_numeric_code` дублируют UNIQUE);
  `init:223` (`idx_plants_nursery` перекрыт `idx_plants_active`);
  `init:243` (`idx_plant_tags_plant` дублирует префикс PK);
  `20260409110000:118` (дублирует `unique('gbif_usage_key')`);
  одиночные индексы по `nursery_id`, дублирующие префикс составных unique: `init:232, 236`,
  `20260614140000:49, 52`, `20260409110000:122`;
  `init:246` (`idx_users_role` — низкая кардинальность, запросов по нему нет).
- **D10. FK-колонки с ON DELETE-политикой без индекса** — `subscriptions.plan_id` (init:36),
  `operations.user_id` (init:178), `movements.user_id/from_location_id/to_location_id`
  (init:199-202), `plant_stage_history.stage_id/changed_by` (20260614140000:32-33),
  `accounts.last_active_nursery_id` (20260614120000:4-8). Для operations/movements стоит добавить.
- **D11. Отсутствующие UNIQUE в пределах питомника** — `tags` без `UNIQUE(nursery_id, name)`
  (init:100-109); `users` без `UNIQUE(nursery_id, email)` (init:63).
- **D12. Нет partial-unique «одна активная подписка на аккаунт»** — `idx_subscriptions_active`
  (init:240-242) не UNIQUE; БД допускает две строки `active` на аккаунт.
- **D13. stage_labor_norms без CHECK** — `norm_minutes` без `CHECK (> 0)`, `operation_type`
  без CHECK по списку (20260614140000:42-43).
- **D14. down-миграция сломается на данных** — `20260614150000:14-19` повторно вешает узкий
  CHECK; при наличии строк `type='change_stage'` ALTER упадёт.
- **D15. accounts.last_active_nursery_id без проверки принадлежности** (20260614120000:2-9) —
  на уровне БД может указывать на питомник чужого аккаунта.
- **D16. locations.parent_id ON DELETE SET NULL** (init:76) — удаление участка молча делает
  его секции/ряды корневыми; RESTRICT безопаснее для иерархии.

---

## 4. Тестовое покрытие

Факты: backend/tests — 21 файл, **160 тестов** (не 130, как в README); все 13 роутеров имеют
тестовые файлы, непокрытых эндпоинтов не выявлено; изоляция per-test образцовая
(`tests/setup.js` чистит аккаунты в `beforeEach`, фикстуры через `helpers.js`).

### Критично

- **T1. Frontend — полное отсутствие тестов и тестовой инфраструктуры.** ✅ **Исправлено 2026-07-24** —
  добавлены `vitest` + `jsdom` + `fake-indexeddb`, `vitest.config.js`, `tests/setup.js`, скрипт
  `npm test`. Первые **16 тестов** на ядро офлайн-логики: `src/db/syncQueue.service.test.js`
  (очередь + `reconcileLocalId`), `src/composables/useSyncManager.test.js` (мьютекс F1, F7, F8,
  идемпотентное удаление), `src/composables/useNurserySwitch.test.js` (гард переключения).
  Остальные кандидаты (stores, indexedDb) — по мере касания.
  В `frontend/package.json` нет ни test-скрипта, ни vitest/jest; ни одного `*.test.*`/`*.spec.*`
  файла. Самая сложная логика продукта (offline-first) не защищена вообще. Первые кандидаты:
  `composables/useSyncManager.js` (процессинг очереди, ретраи), `db/syncQueue.service.js`
  (Dexie-очередь), `composables/useNurserySwitch.js` (гард переключения — защита от потери
  данных), `stores/auth.store.js`, `stores/plants.store.js`, `db/indexedDb.js` (схема/версии).
  *Исправление:* vitest + @vue/test-utils + fake-indexeddb, начать с чистых юнитов очереди и гарда.

- **T2. Отсутствие CI.** ✅ **Исправлено 2026-07-24** — `.github/workflows/ci.yml`: джоб
  `backend` (PG-сервис `postgres:16`, `lint` + `vitest run --coverage` с порогами 90/80 из
  конфига), джоб `frontend` (`test` + `build`; `lint` неблокирующий — техдолг locations),
  джоб `acceptance` (boot backend :3100 + прогон `acceptance-check.mjs`, гейт по exit-коду).
  Триггеры `push`/`pull_request`.
  Каталога `.github/` (и любого CI-конфига) нет. Пороги покрытия в `backend/vitest.config.js`
  (90/80) нигде автоматически не проверяются; `npm test` гоняет тесты без coverage.
  *Исправление:* GitHub Actions с сервис-контейнером Postgres: lint + `vitest run --coverage`
  для backend, build + lint для frontend.

- **T3. acceptance-check.mjs не знает о v2.** ✅ **Исправлено 2026-07-24** — добавлено 13
  проверок v2: M14 (in-app уведомления: список, изоляция чтения/записи, mark-read), M15
  (производственные стадии: системные стадии, `change_stage` пишет `plants.stage_id` +
  `plant_stage_history`, нормы труда), M16 (мультипитомник: создание 2-го питомника, изоляция
  ресурсов A↔B, `requireNurseryAccess` 403, `switch` + `last_active_nursery_id`). Скрипт даёт
  `exit 1` при любом FAIL — теперь гейтится в CI-джобе `acceptance`.
  `backend/scripts/acceptance-check.mjs` — 81 `check()` строго по модулям M2–M13; ни одного
  упоминания notifications, production stages, switch, мульти-питомников. В CI не включён.
  «Приёмка» зелёная при сломанной v2-функциональности.

- **T4. Один-единственный тест на изоляцию мульти-питомников.** ✅ **Исправлено 2026-07-24** —
  добавлен `backend/tests/tenantIsolation.test.js` (16 тестов): полная матрица B1–B7 (кросс-аккаунтный
  вектор), позитивный контроль (системные контейнер/стадия/тип движения не блокируются) и
  same-account v2-сценарий (два питомника на аккаунте + switch, изоляция списков и операций).
  `backend/tests/multiNurseryRoles.test.js` проверяет только «сотрудник A отсутствует в
  списке B» и раздельные owner-строки. Нет негативов per-nursery ролей (staff питомника A →
  `POST /:nurseryId/switch` чужого, прямые запросы к ресурсам питомника B того же аккаунта,
  JWT со старой ролью после смены роли). Изоляция данных между питомниками одного аккаунта
  проверена только для стадий/норм и уведомлений — для plants/locations/movements/activity
  таких тестов нет; вся изоляция держится на одном сравнении в `requireNurseryAccess.js`
  (а B1–B7 показывают, что вложенные id этим не покрыты).

### Важно

- **T5. Нет тестов конкурентности.** ✅ **Исправлено 2026-07-24** — добавлен
  `backend/tests/concurrencyLimits.test.js`: три теста (plant/nursery/user limit) шлют по два
  параллельных POST при остатке 1 и ждут ровно один 201 + один 403, с проверкой итогового
  count в БД. Проверено, что с отключённым `lockAccount` тесты падают (`created:2`).
  `Promise.all` не встречается ни в одном тестовом файле;
  гонка «два параллельных POST при остатке 1 до лимита» не проверена — checkLimit подвержен
  TOCTOU (см. B10). *Исправление:* тест с `Promise.all` из двух запросов, ожидание ровно одного 201.
- **T6. Офлайн-синхронизация не тестируется на стороне API.** ✅ **Исправлено частично 2026-07-24** —
  `backend/tests/offlineSync.test.js` (3 теста) покрывает идемпотентность replay POST по
  `clientRequestId` для операций и движений + контроль (без ключа дубли не блокируются).
  Конфликт устаревшего PATCH (оптимистичная конкуренция) пока не покрыт — отдельная задача.
  Нет тестов повторной доставки
  (идемпотентность replay POST из очереди — см. F2) и конфликта устаревшего PATCH. Для
  offline-first продукта это ядро корректности.
- **T7. Слабые/толерантные assertions.** ✅ **Исправлено 2026-07-24** — 28 толерантных
  ассертов статуса в 10 тест-файлах заменены на точный `expect(res.status).toBe(<N>)` (каждый
  сверен с контроллером и прогоном). `productionStages` дубль → строго `409` (fallback
  `23505`→409 в `errorHandler` подтверждён, правка кода не потребовалась). `offlineSync`:
  первый POST и идемпотентный replay → строго `201` при сохранении смысла идемпотентности.
  Прогон **182/182** зелёный. Оставлены легитимные `toBeGreaterThanOrEqual(N)` на размер
  выборки (не статус). Было: 27 мест вида `expect([200, 204]).toContain(...)`
  (dictionary.test.js, plants.test.js, operations.test.js и др.). Худшее —
  productionStages.test.js: `expect(dup.status).toBeGreaterThanOrEqual(400)` принимает и 500,
  маскируя немаппированную unique-ошибку (должен быть 409 через маппинг 23505).
- **T8. Staff-аутентификация в тестах подделывается.** ✅ **Исправлено 2026-07-24** — добавлен аддитивный `loginStaff` (реальный `POST /auth/login`) в `helpers.js`, `staffAuth.test.js` переведён на него; сценарий «staff логинится → must_change_password → смена → работает» уже был покрыт. `helpers.js` подписывает JWT напрямую
  через `signAccess`, минуя логин (сам комментарий признаёт «staff не логинятся через API» —
  см. B11). Сценарий «staff логинится → обязан сменить пароль → работает» не проходится нигде.
- **T9. Хрупкость tests/globalSetup.js.** ✅ **Исправлено 2026-07-24** — ранняя валидация обязательных env (DB_HOST/PORT/USER/PASSWORD) с внятной ошибкой до connect; логика миграций/сида не тронута. Для `CREATE DATABASE palisad_test` подключается к
  основной БД (`DB_NAME || 'palisad'`) — падает невнятно при неполном .env; валидации env нет.
  `fileParallelism: false` — сюита строго последовательная.
- **T10. GBIF-мок — риск дрейфа контракта.** ✅ **Исправлено 2026-07-24** — `gbifContract.test.js`: реалистичная фикстура ответа GBIF `/species/search` + проверка маппинга во внутреннюю форму (ловит дрейф формы). Интеграционные тесты мокают весь
  `gbif.client.js`, юнит мокает `global.fetch` рукописными фикстурами; реальная форма ответов
  GBIF нигде не сверяется. *Исправление:* contract-тест по расписанию или снапшоты реальных ответов.

### Незначительно

- **T11.** README.md устарел: «130 тестов» при фактических 160; цифры покрытия записаны до
  трёх v2-этапов.
- **T12.** `backend/src/utils/cleanupCron.js` исключён из coverage (vitest.config.js) —
  cron-обвязка не тестируется никак (сервисная функция очистки покрыта).
- **T13.** RBAC-матрица неполная: выборочные негативы есть, но не «каждая роль × каждый
  эндпоинт»; для notifications role-негативов нет; worker-негатив в dictionary спрятан в
  двусмысленном `[400, 403]`. *Исправление:* табличный `it.each` по матрице.
- **T14.** auth.test.js — 0 обращений к `res.body`: не проверяется отсутствие
  `password_hash` в ответах (актуально — см. B17); нет тестов reuse refresh-токена после
  logout и истёкшего access-токена.
- **T15.** Два одноимённых файла очереди — `frontend/src/services/syncQueue.service.js`
  (мёртвый shim) и `frontend/src/db/syncQueue.service.js` — без единого теста; при
  рефакторинге легко рассинхронизировать (см. F18).

---

## Предлагаемый порядок исправления (на утверждение)

1. ✅ **ВЫПОЛНЕНО 2026-07-24. Изоляция tenant'ов (до любого релиза v2):** B1–B7 + тест-матрица
   изоляции T4; затем схемный рубеж D2. Это связанный пакет: правки в 3 сервисах + негативные тесты.
   Итог: 176/176 тестов зелёные, линт чист, миграция обратима.
2. ✅ **ВЫПОЛНЕНО 2026-07-24. Защита данных при эксплуатации:** D1 (сид), B9 (транзакции),
   B10+T5 (лимиты под конкуренцией), B15 (PATCH затирает поля), B17 (утечка password_hash),
   B8 (errorHandler). Заодно B35. Итог: 179/179 тестов зелёные, линт чист.
3. ✅ **ВЫПОЛНЕНО 2026-07-24. Офлайн-ядро:** F1–F4 (гонки, дубли, офлайн-старт, precache) +
   F7–F9; параллельно T1 (первые фронтенд-тесты именно на эту логику) и B-сторона
   идемпотентности (F2/T6). Итог: backend 182/182, frontend 16/16, оба линта без ошибок,
   миграция `20260724130000` обратима. Вне пакета: F6 (полная очистка кэша при logout),
   конфликт устаревшего PATCH (T6) — отдельными задачами.
4. ✅ **ВЫПОЛНЕНО 2026-07-24. Инфраструктура качества:** T2 (CI — GitHub Actions,
   backend/frontend/acceptance джобы), T3 (acceptance-check знает о v2, +13 проверок), T7 (28
   ассертов ужесточены), D3 (schema.sql реконструирован из миграций). Итог: backend **182/182**
   зелёные, backend-линт 0 ошибок, CI-конфиг + приёмка v2. 4 домена сделаны параллельными
   агентами, пересечений файлов нет. Коммит — за пользователем.
5. ✅ **ВЫПОЛНЕНО 2026-07-24. Продуктовые решения:** B11 (staff-логин доделан — вход через
   `/auth/login`, RBAC ожил), B12 (смена тарифа → 403), B13 (истечение trial 14 дн + cron
   downgrade на free + уведомление за 3 дня), F13 (фото как bytea + multipart/стрим +
   офлайн-съёмка). Итог: backend **207/207** (покрытие 94/87/97/94), frontend **24/24**, оба
   линта чисты; миграции `20260724140000`/`20260724160000` обратимы; приёмка обновлена.
   4 домена — параллельными агентами, пересечений файлов нет. Коммит — за пользователем.
6. ✅ **«Важно» ВЫПОЛНЕНО 2026-07-24.** Backend B14/B16/B19/B21, frontend F5/F6/F10/F11/F12/F14,
   БД D4–D8, тесты T8/T9/T10 (B18 снят ещё через F13). Итог: backend **226/226** (покрытие
   94.5/87/97.5/94.5), frontend **53/53**, оба линта 0 ошибок, миграции `20260724170000`–`173000`
   обратимы, `schema.sql` синхронизирован. 5 доменов — параллельными агентами, пересечений нет.
   Инфра (B20/B29/B34) отложена по решению. «Незначительно» (~36 находок) — фоном, по мере касания
   файлов. Коммит — за пользователем.
