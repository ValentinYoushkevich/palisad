/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('type').notNullable();
    table.jsonb('payload');
    table.boolean('is_read').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw('CREATE INDEX idx_notifications_user ON notifications(nursery_id, user_id)');
  await knex.schema.raw(
    'CREATE INDEX idx_notifications_unread ON notifications(nursery_id, user_id) WHERE is_read = false'
  );
  await knex.schema.raw('CREATE INDEX idx_notifications_created_at ON notifications(created_at)');
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('notifications');
}
