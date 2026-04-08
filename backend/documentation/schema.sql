-- ============================================================
-- Палисад — предварительная схема БД (PostgreSQL)
-- Версия: MVP v0.7
-- Изменения v0.7:
--   - добавлена таблица container_types (справочник типов контейнеров)
--   - plants.container_id → FK на container_types
-- ============================================================

-- ------------------------------------------------------------
-- Аккаунты и подписки
-- ------------------------------------------------------------

CREATE TABLE accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
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
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Справочник видов питомника (через GBIF)
--
-- gbif_id        — уникальный ключ из GBIF (usageKey)
-- scientific_name — латинское название из GBIF
-- display_name_ru — русское название, заданное пользователем
-- gbif_family    — семейство из GBIF (для отображения)
-- gbif_genus     — род из GBIF (для отображения)
--
-- Контроль дублей: UNIQUE (nursery_id, gbif_id)
-- Деактивация вместо удаления если вид привязан к растениям.
-- Добавление только онлайн через GBIF suggest API.
-- ------------------------------------------------------------

CREATE TABLE species (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id      UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  gbif_id         INTEGER     NOT NULL,
  scientific_name TEXT        NOT NULL,
  display_name_ru TEXT        NOT NULL,
  gbif_family     TEXT,
  gbif_genus      TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nursery_id, gbif_id)
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
-- Стандартные типы (is_system = true, nursery_id = NULL):
--   P9, C1, C2, C3, C5, C10, C15, C25, C35, ОКС, Прикоп, Теплица, Холодильник
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
-- v2: container_types будут связаны со стадиями производственного цикла
--     и расчётом себестоимости (стоимость горшка, субстрата).
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
-- Растения
--
-- container_id  — текущий тип контейнера/условие содержания
-- variety       — сорт, свободный текст, привязан к растению
-- qr_code       — уникальный строковый код (PAL-{nanoid})
-- numeric_code  — уникальный числовой код (fallback при недоступности камеры)
--
-- Создание только онлайн (ограничение на уровне приложения).
-- Мягкое удаление: deleted_at.
-- ------------------------------------------------------------

CREATE TABLE plants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id    UUID        NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  species_id    UUID        REFERENCES species(id) ON DELETE SET NULL,
  location_id   UUID        REFERENCES locations(id) ON DELETE SET NULL,
  container_id  UUID        REFERENCES container_types(id) ON DELETE SET NULL,
  qr_code       TEXT        NOT NULL UNIQUE,
  numeric_code  TEXT        NOT NULL UNIQUE,
  variety       TEXT,
  status        TEXT        NOT NULL DEFAULT 'growing'
                            CONSTRAINT chk_plants_status
                            CHECK (status IN ('growing', 'storage', 'sold', 'written_off')),
  planted_at    DATE,
  source        TEXT        CONSTRAINT chk_plants_source
                            CHECK (source IS NULL OR source IN ('own', 'purchased')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE plant_tags (
  plant_id  UUID NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (plant_id, tag_id)
);

-- ------------------------------------------------------------
-- Операции — жизненный цикл
--
-- Операция transplant фиксирует смену контейнера.
-- В notes или в будущем в отдельном поле можно хранить
-- предыдущий и новый тип контейнера.
-- Мягкое удаление: deleted_at.
-- ------------------------------------------------------------

CREATE TABLE operations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id    UUID        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL
                          CONSTRAINT chk_operations_type
                          CHECK (type IN ('grafting', 'pruning', 'treatment',
                                          'transplant', 'inspection', 'other')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE photos (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id  UUID        NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  url           TEXT        NOT NULL,
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
-- Индексы
-- ------------------------------------------------------------

CREATE INDEX idx_plants_nursery        ON plants(nursery_id);
CREATE INDEX idx_plants_status         ON plants(status)          WHERE deleted_at IS NULL;
CREATE INDEX idx_plants_qr             ON plants(qr_code);
CREATE INDEX idx_plants_numeric_code   ON plants(numeric_code);
CREATE INDEX idx_plants_active         ON plants(nursery_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_plants_species        ON plants(species_id)      WHERE deleted_at IS NULL;
CREATE INDEX idx_plants_container      ON plants(container_id)    WHERE deleted_at IS NULL;

CREATE INDEX idx_species_nursery       ON species(nursery_id);
CREATE INDEX idx_species_gbif          ON species(nursery_id, gbif_id);

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

-- INSERT INTO container_types (code, name, container_kind, volume_liters, side_cm, is_system) VALUES
--   ('P9',        'Горшок P9 (9×9 см)',     'pot',        NULL, 9,    true),
--   ('C1',        'Контейнер C1 (1 л)',      'pot',        1,    NULL, true),
--   ('C2',        'Контейнер C2 (2 л)',      'pot',        2,    NULL, true),
--   ('C3',        'Контейнер C3 (3 л)',      'pot',        3,    NULL, true),
--   ('C5',        'Контейнер C5 (5 л)',      'pot',        5,    NULL, true),
--   ('C10',       'Контейнер C10 (10 л)',    'pot',        10,   NULL, true),
--   ('C15',       'Контейнер C15 (15 л)',    'pot',        15,   NULL, true),
--   ('C25',       'Контейнер C25 (25 л)',    'pot',        25,   NULL, true),
--   ('C35',       'Контейнер C35 (35 л)',    'pot',        35,   NULL, true),
--   ('OKS',       'Открытый грунт (ОКС)',    'open_root',  NULL, NULL, true),
--   ('PRIKOP',    'Прикоп',                  'trench',     NULL, NULL, true),
--   ('ХОЛОДИЛЬНИК','Холодное хранение',      'cold_room',  NULL, NULL, true),
--   ('ТЕПЛИЦА',   'Теплица',                 'greenhouse', NULL, NULL, true);

-- ------------------------------------------------------------
-- Заметка для v2:
-- container_types будут расширены для поддержки производственных
-- стадий и расчёта себестоимости:
--   - стоимость контейнера
--   - стоимость субстрата
--   - нормы трудозатрат на пересадку
-- Связь со стадиями производственного цикла (Propagation → Liner
-- → Container → Field) реализуется в отдельной таблице
-- production_stages в рамках v2.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Автоудаление логов (cron, раз в сутки):
-- DELETE FROM activity_logs WHERE created_at < now() - INTERVAL '2 years';
-- ------------------------------------------------------------

