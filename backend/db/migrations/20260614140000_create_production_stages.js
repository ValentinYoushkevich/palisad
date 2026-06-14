const SYSTEM_STAGES = [
  { name: 'Размножение', slug: 'propagation', sort_order: 1 },
  { name: 'Подвой (Liner)', slug: 'liner', sort_order: 2 },
  { name: 'Контейнер', slug: 'container', sort_order: 3 },
  { name: 'Поле', slug: 'field', sort_order: 4 },
];

/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('production_stages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').references('id').inTable('nurseries').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('slug').notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.boolean('is_system').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['nursery_id', 'slug']);
  });

  await knex.schema.alterTable('plants', (table) => {
    table.uuid('stage_id').references('id').inTable('production_stages').onDelete('SET NULL');
  });

  await knex.schema.createTable('plant_stage_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('plant_id').notNullable().references('id').inTable('plants').onDelete('CASCADE');
    table.uuid('stage_id').references('id').inTable('production_stages').onDelete('SET NULL');
    table.uuid('changed_by').references('id').inTable('users').onDelete('SET NULL');
    table.text('notes');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('stage_labor_norms', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.uuid('stage_id').notNullable().references('id').inTable('production_stages').onDelete('CASCADE');
    table.text('operation_type').notNullable();
    table.integer('norm_minutes').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['nursery_id', 'stage_id', 'operation_type']);
  });

  await knex.schema.raw('CREATE INDEX idx_production_stages_nursery ON production_stages(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_plants_stage ON plants(stage_id) WHERE deleted_at IS NULL');
  await knex.schema.raw('CREATE INDEX idx_plant_stage_history_plant ON plant_stage_history(plant_id)');
  await knex.schema.raw('CREATE INDEX idx_stage_labor_norms_nursery ON stage_labor_norms(nursery_id)');

  await knex('production_stages').insert(
    SYSTEM_STAGES.map((stage) => ({ ...stage, is_system: true, is_active: true }))
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('stage_labor_norms');
  await knex.schema.dropTableIfExists('plant_stage_history');
  await knex.schema.alterTable('plants', (table) => {
    table.dropColumn('stage_id');
  });
  await knex.schema.dropTableIfExists('production_stages');
}
