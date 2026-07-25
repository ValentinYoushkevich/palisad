/**
 * Биллинг через лицензионные коды (v3, Э1 — фундамент).
 *
 * license_codes — выпущенные платформенным админом коды активации тарифа
 *   (формат XXXX-XXXX-XXXX). Активация переводит issued → activated, отзыв — issued → revoked.
 * plan_requests — заявки аккаунтов на смену тарифа, обрабатываемые платформенным админом.
 * accounts.is_platform_admin — признак платформенного администратора (панель лицензий/заявок).
 *
 * CHECK-констрейнты — через knex.raw (fluent .check() в проекте не используется).
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('license_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('code').notNullable().unique();
    table.uuid('plan_id').notNullable().references('id').inTable('plans');
    table.integer('duration_days').notNullable();
    table.text('status').notNullable().defaultTo('issued');
    table.text('note');
    table.uuid('issued_by_account_id').references('id').inTable('accounts');
    table.uuid('activated_by_account_id').references('id').inTable('accounts');
    table.timestamp('activated_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    'ALTER TABLE license_codes ADD CONSTRAINT chk_license_codes_duration_days CHECK (duration_days > 0)'
  );
  await knex.raw(
    "ALTER TABLE license_codes ADD CONSTRAINT chk_license_codes_status CHECK (status IN ('issued', 'activated', 'revoked'))"
  );

  await knex.schema.createTable('plan_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('account_id').notNullable().references('id').inTable('accounts').onDelete('CASCADE');
    table.uuid('plan_id').notNullable().references('id').inTable('plans');
    table.text('comment');
    table.text('status').notNullable().defaultTo('new');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('processed_at', { useTz: true });
  });
  await knex.raw(
    "ALTER TABLE plan_requests ADD CONSTRAINT chk_plan_requests_status CHECK (status IN ('new', 'processed'))"
  );

  await knex.schema.alterTable('accounts', (table) => {
    table.boolean('is_platform_admin').notNullable().defaultTo(false);
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('accounts', (table) => {
    table.dropColumn('is_platform_admin');
  });
  await knex.schema.dropTableIfExists('plan_requests');
  await knex.schema.dropTableIfExists('license_codes');
}
