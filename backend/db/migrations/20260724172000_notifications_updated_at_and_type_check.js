/**
 * notifications приводим к принципам схемы (аудит D7).
 *
 * Таблица мутируемая (меняется is_read), но не имела updated_at; type был
 * свободным текстом без CHECK. Добавляем:
 *   - updated_at timestamptz NOT NULL DEFAULT now();
 *   - CHECK на type по канону из src/constants/notification.constants.js
 *     (NOTIFICATION_TYPES): user.role_changed / sync.conflict /
 *     subscription.expiring / task.due.
 *
 * Примечание: обновление updated_at при markRead делается на уровне сервиса
 * (notification.service.js) отдельно — здесь только схема.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('notifications', (table) => {
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    "ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type CHECK (type IN ('user.role_changed', 'sync.conflict', 'subscription.expiring', 'task.due'))"
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type');
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('updated_at');
  });
}
