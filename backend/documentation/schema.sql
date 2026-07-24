-- ============================================================
-- Палисад — предварительная схема БД (PostgreSQL)
-- Версия: v2
-- Изменения v2:
--   - производственные стадии: production_stages (справочник стадий, системные + кастомные),
--     plants.stage_id → FK на production_stages, plant_stage_history (журнал смен стадии),
--     stage_labor_norms (нормы трудозатрат по стадиям)                [миграция 20260614140000]
--   - operations.type: добавлено значение 'change_stage' в CHECK      [миграция 20260614150000]
--   - in-app уведомления: таблица notifications                       [миграция 20260614130000]
--   - мультипитомник: accounts.last_active_nursery_id → FK на nurseries  [миграция 20260614120000]
--   - изоляция питомников на уровне БД: составные FK plants(location_id, nursery_id) →
--     locations(id, nursery_id) и plants(nursery_species_id, nursery_id) →
--     nursery_species(id, nursery_id); UNIQUE (id, nursery_id) на родителях [миграция 20260724120000]
--   - идемпотентность офлайн-очереди: operations.client_request_id и
--     movements.client_request_id + частичные UNIQUE-индексы           [миграция 20260724130000]
--   - фото операций как байты: photos.image (bytea), photos.mime_type, photos.size;
--     photos.url → nullable (старый путь по URL выведен из использования) [миграция 20260724160000]
-- Изменения v0.8:
--   - виды: глобальный species_catalog + привязка nursery_species (вместо per-nursery species)
--   - plants.nursery_species_id → FK на nursery_species (вместо plants.species_id → species)
-- Изменения v0.7:
--   - добавлена таблица container_types (справочник типов контейнеров)
--   - plants.container_id → FK на container_types
-- ============================================================

-- ------------------------------------------------------------
-- Аккаунты и подписки
-- ------------------------------------------------------------

CREATE TABLE accounts (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  TEXT        NOT NULL UNIQUE,
  password_hash          TEXT        NOT NULL,
  name                   TEXT        NOT NULL,
  last_active_nursery_id UUID,       -- v2: последний активный питомник (мультипитомник);
                                     -- FK на nurseries добавляется ALTER'ом ниже (миграция 20260614120000)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plans (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  slug                TEXT        NOT NULL UNIQUE,
  plant_limit         INTEGER,
  user_limit          INTEGER,
  nursery_limit       INTEGER,
  feature_tags        BOOLEAN     NOT NULL DEFAULT false,
  feature_operations  BOOLEAN     NOT NULL DEFAULT false,
  feature_qr          BOOLEAN     NOT NULL DEFAULT false,
  feature_photos      BOOLEAN     NOT NULL DEFAULT false,
  feature_export      BOOLEAN     NOT NULL DEFAULT false,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  plan_id       UUID        NOT NULL REFERENCES plans(id),
  status        TEXT        NOT NULL DEFAULT 'trial'
                            CONSTRAINT chk_subscriptions_status
                            CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Питомник и сотрудники
-- ------------------------------------------------------------

CREATE TABLE nurseries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- v2: FK accounts.last_active_nursery_id → nurseries. Вынесен в ALTER, т.к. accounts
-- создаётся раньше nurseries (миграция 20260614120000).
ALTER TABLE accounts
  ADD CONSTRAINT accounts_last_active_nursery_id_foreign
  FOREIGN KEY (last_active_nursery_id) REFERENCES nurseries(id) ON DELETE SET NULL;

-- Роли:
--   owner      — полный доступ, управляет подпиской и сотрудниками
--   agronomist — полный доступ к растениям + управление структурой и справочниками
--   worker     — операции и движения, без управления структурой
--   observer   — только чтение

CREATE TABLE users (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id           UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  name                 TEXT        NOT NULL,
  role                 TEXT        NOT NULL DEFAULT 'worker'
                                   CONSTRAINT chk_users_role
                                   CHECK (role IN ('owner', 'agronomist', 'worker', 'observer')),
  password_hash        TEXT        NOT NULL,
  email                TEXT,
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  must_change_password BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Структура питомника
-- Иерархия: участок (area) → секция (section) → ряд (row) → место (place)
-- ------------------------------------------------------------

CREATE TABLE locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id  UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES locations(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'section'
                          CONSTRAINT chk_locations_type
                          CHECK (type IN ('area', 'section', 'row', 'place')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- v2: цель составного FK plants(location_id, nursery_id) — изоляция
  -- питомников на уровне БД (миграция 20260724120000).
  UNIQUE (id, nursery_id)
);

-- ------------------------------------------------------------
-- Глобальный каталог видов (GBIF) + привязка к питомнику
--
-- species_catalog — один таксон на всё приложение (по gbif_usage_key из GBIF usageKey).
-- nursery_species — какой вид «включён» в справочник питомника; русское имя задаётся здесь.
-- Контроль дублей: UNIQUE (gbif_usage_key) в каталоге; UNIQUE (nursery_id, species_catalog_id)
-- у привязки. Растение ссылается на строку nursery_species (plants.nursery_species_id).
-- ------------------------------------------------------------

CREATE TABLE species_catalog (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gbif_usage_key   INTEGER     NOT NULL UNIQUE,
  scientific_name  TEXT        NOT NULL,
  canonical_name   TEXT,
  authorship       TEXT,
  rank             TEXT,
  taxonomic_status TEXT,
  family           TEXT,
  genus            TEXT,
  source           TEXT        NOT NULL DEFAULT 'gbif',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nursery_species (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id          UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  species_catalog_id  UUID        NOT NULL REFERENCES species_catalog(id) ON DELETE CASCADE,
  display_name_ru     TEXT        NOT NULL,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nursery_id, species_catalog_id),
  -- v2: цель составного FK plants(nursery_species_id, nursery_id) — изоляция
  -- питомников на уровне БД (миграция 20260724120000).
  UNIQUE (id, nursery_id)
);

-- ------------------------------------------------------------
-- Теги
-- color обязателен, формат #RRGGBB
-- ------------------------------------------------------------

CREATE TABLE tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id  UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#888888'
                          CONSTRAINT chk_tags_color
                          CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Справочник типов движений
-- Системные (is_system = true, nursery_id = NULL) нельзя удалять.
-- sets_status — статус растения после движения (NULL = не меняется).
-- ------------------------------------------------------------

CREATE TABLE movement_types (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id  UUID        REFERENCES nurseries(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  sets_status TEXT        CONSTRAINT chk_movement_types_status
                          CHECK (sets_status IS NULL OR
                                 sets_status IN ('growing', 'storage', 'sold', 'written_off')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nursery_id, slug)
);

-- ------------------------------------------------------------
-- Справочник типов контейнеров
--
-- Фиксирует в какой ёмкости или условиях содержится растение.
-- Стандартные типы (is_system = true, nursery_id = NULL), коды сида:
--   P9, C1, C2, C3, C5, C10, C15, C25, C35, OKS, TRENCH, GREENHOUSE, COLD_STORAGE
-- Кастомные типы (is_system = false) добавляет питомник.
--
-- container_kind — физический тип содержания:
--   pot       — горшок/контейнер (ЗКС)
--   open_root — открытый грунт (ОКС)
--   trench    — прикоп
--   cold_room — холодильник/холодное хранение
--   greenhouse— теплица/оранжерея
--
-- volume_liters — объём в литрах (для C-контейнеров), NULL для остальных
-- side_cm       — длина стороны в см (для P-контейнеров), NULL для остальных
--
-- Смена контейнера фиксируется через операцию transplant.
-- История смен видна в журнале операций растения.
--
-- v2: производственные стадии реализованы в отдельной таблице production_stages
--     (миграция 20260614140000). Дальнейшее развитие — расчёт себестоимости
--     на базе container_types (стоимость горшка, субстрата).
-- ------------------------------------------------------------

CREATE TABLE container_types (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id     UUID        REFERENCES nurseries(id) ON DELETE CASCADE,
  code           TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  container_kind TEXT        NOT NULL DEFAULT 'pot'
                             CONSTRAINT chk_container_types_kind
                             CHECK (container_kind IN ('pot', 'open_root', 'trench', 'cold_room', 'greenhouse')),
  volume_liters  NUMERIC(6,1),
  side_cm        NUMERIC(5,1),
  is_system      BOOLEAN     NOT NULL DEFAULT false,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nursery_id, code)
);

-- ------------------------------------------------------------
-- Производственные стадии (v2, миграция 20260614140000)
--
-- Справочник стадий производственного цикла.
-- Системные (is_system = true, nursery_id = NULL) — общие для всех питомников:
--   propagation (Размножение) → liner (Подвой) → container (Контейнер) → field (Поле).
-- Кастомные (is_system = false) добавляет питомник.
-- plants.stage_id ссылается на текущую стадию; журнал смен — plant_stage_history.
-- ------------------------------------------------------------

CREATE TABLE production_stages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id  UUID        REFERENCES nurseries(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nursery_id, slug)
);

-- ------------------------------------------------------------
-- Растения
--
-- container_id  — текущий тип контейнера/условие содержания
-- variety       — сорт, свободный текст, привязан к растению
-- qr_code       — уникальный строковый код (PAL-{nanoid})
-- numeric_code  — уникальный числовой код (fallback при недоступности камеры)
--
-- Создание только онлайн (ограничение на уровне приложения).
-- Мягкое удаление: deleted_at.
-- nursery_species_id — выбранный вид из справочника питомника (см. nursery_species).
-- ------------------------------------------------------------

CREATE TABLE plants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id          UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  nursery_species_id  UUID,       -- v2: FK составной (nursery_species_id, nursery_id) — см. ниже
  location_id         UUID,       -- v2: FK составной (location_id, nursery_id) — см. ниже
  container_id        UUID        REFERENCES container_types(id) ON DELETE SET NULL,
  stage_id            UUID        REFERENCES production_stages(id) ON DELETE SET NULL,  -- v2 (миграция 20260614140000)
  qr_code             TEXT        NOT NULL,   -- v2 (D8): уникален в паре (nursery_id, qr_code) — см. индексы ниже
  numeric_code        TEXT        NOT NULL,   -- v2 (D8): уникален в паре (nursery_id, numeric_code) — см. индексы ниже
  variety             TEXT,
  status              TEXT        NOT NULL DEFAULT 'growing'
                                  CONSTRAINT chk_plants_status
                                  CHECK (status IN ('growing', 'storage', 'sold', 'written_off')),
  planted_at          DATE,
  source              TEXT        CONSTRAINT chk_plants_source
                                  CHECK (source IS NULL OR source IN ('own', 'purchased')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  -- v2: составные FK с nursery_id — изоляция питомников на уровне БД (миграция 20260724120000).
  -- container_id и stage_id сюда НЕ входят: их справочники содержат системные строки
  -- (nursery_id IS NULL), поэтому изоляция этих ссылок обеспечивается сервисным слоём.
  -- ON DELETE SET NULL задаётся только по ссылочному столбцу (синтаксис PG15+),
  -- т.к. plants.nursery_id NOT NULL и обнулять его нельзя.
  CONSTRAINT plants_nursery_species_id_nursery_foreign
    FOREIGN KEY (nursery_species_id, nursery_id)
    REFERENCES nursery_species (id, nursery_id) ON DELETE SET NULL (nursery_species_id),
  CONSTRAINT plants_location_id_nursery_foreign
    FOREIGN KEY (location_id, nursery_id)
    REFERENCES locations (id, nursery_id) ON DELETE SET NULL (location_id)
);

CREATE TABLE plant_tags (
  plant_id  UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (plant_id, tag_id)
);

-- ------------------------------------------------------------
-- Производственные стадии: журнал и нормы (v2, миграция 20260614140000)
--
-- plant_stage_history — журнал смен производственной стадии растения.
-- stage_labor_norms   — нормы трудозатрат (мин.) по стадии и типу операции,
--                       уникальны в пределах (nursery_id, stage_id, operation_type).
-- Вынесены после plants: plant_stage_history ссылается на plants.
-- ------------------------------------------------------------

CREATE TABLE plant_stage_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id    UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  stage_id    UUID        REFERENCES production_stages(id) ON DELETE SET NULL,
  changed_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stage_labor_norms (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id     UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  stage_id       UUID        NOT NULL REFERENCES production_stages(id) ON DELETE CASCADE,
  operation_type TEXT        NOT NULL,
  norm_minutes   INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nursery_id, stage_id, operation_type)
);

-- ------------------------------------------------------------
-- Операции — жизненный цикл
--
-- Операция transplant фиксирует смену контейнера.
-- Операция change_stage (v2) фиксирует смену производственной стадии.
-- В notes или в будущем в отдельном поле можно хранить
-- предыдущий и новый тип контейнера.
-- Мягкое удаление: deleted_at.
-- ------------------------------------------------------------

CREATE TABLE operations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id          UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  user_id           UUID        REFERENCES users(id) ON DELETE SET NULL,
  type              TEXT        NOT NULL
                                CONSTRAINT chk_operations_type
                                CHECK (type IN ('grafting', 'pruning', 'treatment', 'transplant',
                                                'change_stage', 'inspection', 'other')),
  notes             TEXT,
  client_request_id UUID,       -- v2: идемпотентность офлайн-очереди (миграция 20260724130000)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- Фото привязаны к операции (photos.operation_id). Мелкие изображения хранятся
-- как байты прямо в БД (image bytea); mime_type и size — метаданные для отдачи и
-- списков. url оставлен nullable для совместимости, новый путь загрузки его не
-- использует (v2, миграция 20260724160000).
CREATE TABLE photos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  UUID        NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  url           TEXT,       -- v2: nullable, выведен из использования (миграция 20260724160000)
  image         BYTEA,      -- v2: байты изображения
  mime_type     TEXT,       -- v2: Content-Type для стрим-эндпоинта
  size          INTEGER,    -- v2: размер в байтах
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Движения — учёт
-- type_id → movement_types (системные + кастомные)
-- ------------------------------------------------------------

CREATE TABLE movements (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id          UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  user_id           UUID        REFERENCES users(id) ON DELETE SET NULL,
  type_id           UUID        NOT NULL REFERENCES movement_types(id),
  from_location_id  UUID        REFERENCES locations(id) ON DELETE SET NULL,
  to_location_id    UUID        REFERENCES locations(id) ON DELETE SET NULL,
  quantity          INTEGER     NOT NULL DEFAULT 1
                                CONSTRAINT chk_movements_quantity
                                CHECK (quantity > 0),
  notes             TEXT,
  client_request_id UUID,       -- v2: идемпотентность офлайн-очереди (миграция 20260724130000)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Лента активности
-- Хранение 2 года, cron-удаление раз в сутки.
-- ------------------------------------------------------------

CREATE TABLE activity_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id   UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type   TEXT        NOT NULL,
  entity_type  TEXT        NOT NULL
                           CONSTRAINT chk_activity_entity_type
                           CHECK (entity_type IN ('plant', 'operation', 'movement',
                                                  'location', 'user', 'subscription')),
  entity_id    UUID,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- In-app уведомления (v2, миграция 20260614130000)
--
-- type    — код типа уведомления (строка приложения).
-- payload — произвольные данные уведомления (JSONB).
-- is_read — прочитано ли пользователем.
-- Персональные: привязаны к (nursery_id, user_id).
-- ------------------------------------------------------------

CREATE TABLE notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id  UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL
                          CONSTRAINT chk_notifications_type  -- v2 (D7, миграция 20260724172000)
                          CHECK (type IN ('user.role_changed', 'sync.conflict', 'subscription.expiring', 'task.due')),
  payload     JSONB,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()  -- v2 (D7, миграция 20260724172000)
);

-- ------------------------------------------------------------
-- Индексы
-- ------------------------------------------------------------

CREATE INDEX idx_plants_nursery        ON plants(nursery_id);
CREATE INDEX idx_plants_status         ON plants(status)          WHERE deleted_at IS NULL;
CREATE INDEX idx_plants_qr             ON plants(qr_code);
CREATE INDEX idx_plants_numeric_code   ON plants(numeric_code);
CREATE INDEX idx_plants_active         ON plants(nursery_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_plants_nursery_species ON plants(nursery_species_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_plants_container      ON plants(container_id)    WHERE deleted_at IS NULL;

CREATE INDEX idx_species_catalog_usage_key ON species_catalog(gbif_usage_key);
CREATE INDEX idx_species_catalog_scientific_name ON species_catalog(lower(scientific_name));
CREATE INDEX idx_nursery_species_nursery ON nursery_species(nursery_id);
CREATE INDEX idx_nursery_species_catalog ON nursery_species(species_catalog_id);

CREATE INDEX idx_container_types_nursery ON container_types(nursery_id);

CREATE INDEX idx_operations_plant      ON operations(plant_id)    WHERE deleted_at IS NULL;

CREATE INDEX idx_movements_plant       ON movements(plant_id);
CREATE INDEX idx_movements_type        ON movements(type_id);

CREATE INDEX idx_movement_types_nursery ON movement_types(nursery_id);

CREATE INDEX idx_locations_nursery     ON locations(nursery_id);
CREATE INDEX idx_locations_parent      ON locations(parent_id);

CREATE INDEX idx_subscriptions_acct    ON subscriptions(account_id);
CREATE INDEX idx_subscriptions_active  ON subscriptions(account_id, status)
                                        WHERE status IN ('trial', 'active');

CREATE INDEX idx_plant_tags_plant      ON plant_tags(plant_id);
CREATE INDEX idx_plant_tags_tag        ON plant_tags(tag_id);

CREATE INDEX idx_users_nursery         ON users(nursery_id);
CREATE INDEX idx_users_role            ON users(role);
CREATE INDEX idx_users_active          ON users(nursery_id)       WHERE is_active = true;

CREATE INDEX idx_activity_nursery      ON activity_logs(nursery_id);
CREATE INDEX idx_activity_user         ON activity_logs(user_id);
CREATE INDEX idx_activity_event_type   ON activity_logs(event_type);
CREATE INDEX idx_activity_created_at   ON activity_logs(created_at);
CREATE INDEX idx_activity_entity       ON activity_logs(entity_type, entity_id);

-- v2: производственные стадии (миграция 20260614140000)
CREATE INDEX idx_production_stages_nursery ON production_stages(nursery_id);
CREATE INDEX idx_plants_stage             ON plants(stage_id)         WHERE deleted_at IS NULL;
CREATE INDEX idx_plant_stage_history_plant ON plant_stage_history(plant_id);
CREATE INDEX idx_stage_labor_norms_nursery ON stage_labor_norms(nursery_id);

-- v2: in-app уведомления (миграция 20260614130000)
CREATE INDEX idx_notifications_user       ON notifications(nursery_id, user_id);
CREATE INDEX idx_notifications_unread     ON notifications(nursery_id, user_id) WHERE is_read = false;
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- v2: идемпотентность офлайн-очереди — частичные UNIQUE-индексы (миграция 20260724130000)
CREATE UNIQUE INDEX idx_operations_client_request_id ON operations(client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX idx_movements_client_request_id  ON movements(client_request_id)  WHERE client_request_id IS NOT NULL;

-- v2: горячие композитные индексы (D6, миграция 20260724171000)
CREATE INDEX idx_plants_nursery_created            ON plants(nursery_id, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_activity_logs_nursery_created     ON activity_logs(nursery_id, created_at DESC);
CREATE INDEX idx_notifications_nursery_user_created ON notifications(nursery_id, user_id, created_at DESC);

-- v2: per-nursery уникальность кодов растений (D8, миграция 20260724173000)
-- глобальные UNIQUE(qr_code)/UNIQUE(numeric_code) сняты; уникальность теперь в пределах питомника
CREATE UNIQUE INDEX uq_plants_nursery_qr           ON plants(nursery_id, qr_code)      WHERE qr_code IS NOT NULL;
CREATE UNIQUE INDEX uq_plants_nursery_numeric_code ON plants(nursery_id, numeric_code) WHERE numeric_code IS NOT NULL;

-- v2: защита системных строк справочников от дублей (D5, миграция 20260724170000)
-- (обычный UNIQUE(nursery_id, …) не ловит системные строки: NULL'ы в UNIQUE различны)
CREATE UNIQUE INDEX uq_production_stages_system_slug ON production_stages(slug) WHERE nursery_id IS NULL;
CREATE UNIQUE INDEX uq_movement_types_system_slug    ON movement_types(slug)    WHERE nursery_id IS NULL;
CREATE UNIQUE INDEX uq_container_types_system_code    ON container_types(code)   WHERE nursery_id IS NULL;

-- ------------------------------------------------------------
-- Seed: системные типы движений
-- nursery_id = NULL — общие для всех питомников.
-- ------------------------------------------------------------

-- INSERT INTO movement_types (name, slug, is_system, sets_status) VALUES
--   ('Поступление', 'arrival',   true, 'growing'),
--   ('Продажа',     'sale',      true, 'sold'),
--   ('Списание',    'write_off', true, 'written_off'),
--   ('Перемещение', 'transfer',  true, NULL);

-- ------------------------------------------------------------
-- Seed: системные типы контейнеров
-- Стандартная международная маркировка.
-- ------------------------------------------------------------

-- Коды и наименования соответствуют фактическому системному сиду
-- (backend/db/seeds/001_mvp_seed.js, backend/tests/globalSetup.js).
-- INSERT INTO container_types (code, name, container_kind, volume_liters, side_cm, is_system) VALUES
--   ('P9',           'Горшок P9 (9x9 см)',    'pot',        NULL, 9,    true),
--   ('C1',           'Контейнер C1 (1 л)',     'pot',        1,    NULL, true),
--   ('C2',           'Контейнер C2 (2 л)',     'pot',        2,    NULL, true),
--   ('C3',           'Контейнер C3 (3 л)',     'pot',        3,    NULL, true),
--   ('C5',           'Контейнер C5 (5 л)',     'pot',        5,    NULL, true),
--   ('C10',          'Контейнер C10 (10 л)',   'pot',        10,   NULL, true),
--   ('C15',          'Контейнер C15 (15 л)',   'pot',        15,   NULL, true),
--   ('C25',          'Контейнер C25 (25 л)',   'pot',        25,   NULL, true),
--   ('C35',          'Контейнер C35 (35 л)',   'pot',        35,   NULL, true),
--   ('OKS',          'Открытый грунт (ОКС)',   'open_root',  NULL, NULL, true),
--   ('TRENCH',       'Прикоп',                 'trench',     NULL, NULL, true),
--   ('GREENHOUSE',   'Теплица',                'greenhouse', NULL, NULL, true),
--   ('COLD_STORAGE', 'Холодное хранение',      'cold_room',  NULL, NULL, true);

-- ------------------------------------------------------------
-- Seed: системные производственные стадии (v2, миграция 20260614140000)
-- nursery_id = NULL — общие для всех питомников.
-- ------------------------------------------------------------

-- INSERT INTO production_stages (name, slug, sort_order, is_system, is_active) VALUES
--   ('Размножение',    'propagation', 1, true, true),
--   ('Подвой (Liner)', 'liner',       2, true, true),
--   ('Контейнер',      'container',   3, true, true),
--   ('Поле',           'field',       4, true, true);

-- ------------------------------------------------------------
-- Заметка (post-v2):
-- Стадии производственного цикла (Propagation → Liner → Container → Field)
-- реализованы в v2: production_stages, plant_stage_history, stage_labor_norms
-- (миграция 20260614140000). Нормы трудозатрат ведутся в stage_labor_norms.
-- Дальнейшее развитие — расчёт себестоимости на базе container_types
-- (стоимость контейнера/субстрата) и норм трудозатрат.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Автоудаление логов (cron, раз в сутки):
-- DELETE FROM activity_logs WHERE created_at < now() - INTERVAL '2 years';
-- ------------------------------------------------------------

