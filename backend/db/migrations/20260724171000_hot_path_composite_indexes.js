/**
 * Композитные индексы под горячие запросы (аудит D6).
 *
 * DESC-сортировка и partial-условие требуют raw SQL (knex chainable этого не даёт).
 * Существующие индексы НЕ трогаем — их избыточность/дубли разбирает отдельная
 * незначительная находка D9, вне scope этой миграции.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Реестр растений: лента по питомнику, свежие сверху; id — тай-брейкер для
  // стабильного keyset-пейджинга. Partial WHERE deleted_at IS NULL — реестр не
  // показывает удалённые.
  await knex.raw(
    'CREATE INDEX idx_plants_nursery_created ON plants (nursery_id, created_at DESC, id) WHERE deleted_at IS NULL'
  );
  // Лента активности по питомнику, свежие сверху.
  await knex.raw(
    'CREATE INDEX idx_activity_logs_nursery_created ON activity_logs (nursery_id, created_at DESC)'
  );
  // Уведомления пользователя внутри питомника, свежие сверху.
  await knex.raw(
    'CREATE INDEX idx_notifications_nursery_user_created ON notifications (nursery_id, user_id, created_at DESC)'
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_notifications_nursery_user_created');
  await knex.raw('DROP INDEX IF EXISTS idx_activity_logs_nursery_created');
  await knex.raw('DROP INDEX IF EXISTS idx_plants_nursery_created');
}
