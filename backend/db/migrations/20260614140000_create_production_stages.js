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

  // Системные строки (nursery_id = NULL) здесь НЕ вставляем (аудит D4): единый
  // канонический провижинер системных справочников — идемпотентный сид
  // db/seeds/001_mvp_seed.js (movement_types + container_types + production_stages).
  // Прогонять сид после миграций. Удаление data-insert безопасно: миграция уже
  // применена на существующих БД (строки там есть, сид их идемпотентно не тронет),
  // а свежая «только миграции» БД получает системные стадии из сида.
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
