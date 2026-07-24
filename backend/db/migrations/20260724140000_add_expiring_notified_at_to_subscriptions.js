/**
 * Лайфцикл подписки (аудит B13).
 *
 * subscriptions.expires_at уже существует с init-миграции (20260408073000) — здесь
 * НЕ дублируем. Добавляем только флаг-дедуп expiring_notified_at: cron рассылает
 * SUBSCRIPTION_EXPIRING за 3 дня до истечения и, чтобы не слать дубли ежедневно,
 * уведомляет лишь по подпискам с NULL в этой колонке, затем проставляет метку.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('subscriptions', (table) => {
    table.timestamp('expiring_notified_at', { useTz: true }).nullable();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('subscriptions', (table) => {
    table.dropColumn('expiring_notified_at');
  });
}
