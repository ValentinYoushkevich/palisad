/**
 * Э2 (биллинг через лицензионные коды) — новый тип in-app уведомления
 * 'subscription.activated' (успешная активация лицензионного кода).
 *
 * notifications.type зажат CHECK'ом chk_notifications_type (см. 20260724172000).
 * Расширяем список допустимых значений добавлением 'subscription.activated'.
 * Канон значений — src/constants/notification.constants.js (NOTIFICATION_TYPES).
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type');
  await knex.raw(
    "ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type CHECK (type IN ('user.role_changed', 'sync.conflict', 'subscription.expiring', 'task.due', 'subscription.activated'))"
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notifications_type');
  await knex.raw(
    "ALTER TABLE notifications ADD CONSTRAINT chk_notifications_type CHECK (type IN ('user.role_changed', 'sync.conflict', 'subscription.expiring', 'task.due'))"
  );
}
