/**
 * Инвентаризация сканированием (v3, Э1 «Инвентаризация» — фундамент).
 *
 * inventory_sessions — одна сессия сканирования зоны: пользователь выбирает корневую
 * локацию (location_id), сканирует QR/числовые коды растений внутри её поддерева и
 * фиксирует результат сверки. started_at/completed_at приходят с устройства (сессия
 * может собираться офлайн и доставляться позже). Денормализованные счётчики
 * (matched/missing/foreign/unknown) хранятся на сессии — их не нужно каждый раз
 * пересчитывать при листинге истории.
 *
 * inventory_items — построчный результат сверки сессии. Категория растения:
 *   - matched  — отсканировано и находится в зоне (ожидаемо);
 *   - missing  — числится в зоне активным, но не отсканировано (plant_id есть, raw_code NULL);
 *   - foreign  — отсканировано, но растение принадлежит другой зоне (не туда положили);
 *   - unknown  — отсканирован код, которого нет среди активных растений (plant_id NULL).
 * applied_movement_id — аудит применения расхождений (перемещение, созданное на этапе
 * «применить» — заполняется в поздних стадиях, здесь NULL).
 *
 * Тенант-изоляция на уровне БД (defense-in-depth, паттерн D2): составной FK
 * (location_id, nursery_id) → locations(id, nursery_id) физически не даёт привязать
 * сессию к локации ЧУЖОГО питомника. Каскад тут не нужен (сессия — исторический
 * снимок), поэтому обычный FK без ON DELETE.
 *
 * Идемпотентность повторной доставки офлайн-очереди (паттерн F2): необязательный
 * client_request_id + ЧАСТИЧНЫЙ уникальный индекс (nursery_id, client_request_id)
 * WHERE client_request_id IS NOT NULL. В отличие от глобального индекса movements,
 * здесь дедуп скоуплен по питомнику — безопаснее (ключи генерятся на устройствах
 * разных питомников и не обязаны быть глобально уникальны). NULL под уникальность
 * не попадает — запросы без ключа не блокируются.
 *
 * CHECK на inventory_items.category — через knex.raw (fluent .check() в проекте не
 * используется); partial-unique — тоже через knex.raw (schema builder не умеет .where()).
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('inventory_sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.uuid('location_id').notNullable(); // корень отсканированной зоны; FK составной — см. ниже
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('started_at', { useTz: true }).notNullable();
    table.timestamp('completed_at', { useTz: true }).notNullable();
    table.uuid('client_request_id').nullable();
    table.integer('matched_count').notNullable().defaultTo(0);
    table.integer('missing_count').notNullable().defaultTo(0);
    table.integer('foreign_count').notNullable().defaultTo(0);
    table.integer('unknown_count').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // Индекс под пагинированный листинг истории (ORDER BY completed_at DESC в рамках питомника).
    table.index(['nursery_id', 'completed_at']);
  });

  // Тенант-изоляция (D2): составной FK (location_id, nursery_id) → locations(id, nursery_id).
  // Плоский, без каскада — сессия является историческим снимком.
  await knex.raw(`
    ALTER TABLE inventory_sessions
      ADD CONSTRAINT inventory_sessions_location_id_nursery_foreign
      FOREIGN KEY (location_id, nursery_id)
      REFERENCES locations (id, nursery_id)
  `);

  // Идемпотентность (F2): частичный уникальный индекс, скоуплен по питомнику.
  await knex.raw(`
    CREATE UNIQUE INDEX uq_inventory_sessions_client_request
      ON inventory_sessions (nursery_id, client_request_id)
      WHERE client_request_id IS NOT NULL
  `);

  await knex.schema.createTable('inventory_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('session_id')
      .notNullable()
      .references('id')
      .inTable('inventory_sessions')
      .onDelete('CASCADE');
    table.uuid('plant_id').nullable().references('id').inTable('plants').onDelete('SET NULL');
    table.text('raw_code').nullable(); // отсканированная строка; NULL для missing
    table.text('category').notNullable(); // CHECK IN (...) — см. ниже
    table.timestamp('scanned_at', { useTz: true }).nullable(); // NULL для missing
    table
      .uuid('applied_movement_id')
      .nullable()
      .references('id')
      .inTable('movements')
      .onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['session_id', 'category']);
  });

  await knex.raw(`
    ALTER TABLE inventory_items
      ADD CONSTRAINT chk_inventory_items_category
      CHECK (category IN ('matched', 'missing', 'foreign', 'unknown'))
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('inventory_items');
  await knex.schema.dropTableIfExists('inventory_sessions');
}
