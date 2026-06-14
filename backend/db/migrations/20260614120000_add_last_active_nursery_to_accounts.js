export async function up(knex) {
  await knex.schema.alterTable('accounts', (table) => {
    table
      .uuid('last_active_nursery_id')
      .nullable()
      .references('id')
      .inTable('nurseries')
      .onDelete('SET NULL');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('accounts', (table) => {
    table.dropColumn('last_active_nursery_id');
  });
}
