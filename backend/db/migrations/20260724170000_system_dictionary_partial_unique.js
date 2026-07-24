/**
 * Защита системных строк справочников от дублей (аудит D5).
 *
 * У movement_types / container_types / production_stages натуральный ключ
 * составной с NULLABLE nursery_id: UNIQUE(nursery_id, slug|code). Но PostgreSQL
 * считает NULL-ы в UNIQUE РАЗЛИЧНЫМИ, поэтому обычный составной UNIQUE НЕ мешает
 * вставить две системные строки с одинаковым slug/code и nursery_id = NULL.
 *
 * Добавляем partial unique индексы по натуральному ключу ТОЛЬКО для системных
 * строк (WHERE nursery_id IS NULL). Tenant-строки (nursery_id NOT NULL) по-прежнему
 * покрыты обычным составным UNIQUE и этими индексами не затрагиваются.
 *
 * Согласовано с идемпотентным сидом (insert-if-not-exists по натуральному ключу
 * при nursery_id IS NULL) и с тестовым сидом globalSetup.js (единичная пачка
 * системных строк с различными slug/code — конфликта не создаёт).
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw(
    'CREATE UNIQUE INDEX uq_production_stages_system_slug ON production_stages (slug) WHERE nursery_id IS NULL'
  );
  await knex.raw(
    'CREATE UNIQUE INDEX uq_movement_types_system_slug ON movement_types (slug) WHERE nursery_id IS NULL'
  );
  await knex.raw(
    'CREATE UNIQUE INDEX uq_container_types_system_code ON container_types (code) WHERE nursery_id IS NULL'
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS uq_container_types_system_code');
  await knex.raw('DROP INDEX IF EXISTS uq_movement_types_system_slug');
  await knex.raw('DROP INDEX IF EXISTS uq_production_stages_system_slug');
}
