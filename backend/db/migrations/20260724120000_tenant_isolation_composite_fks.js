/**
 * Изоляция питомников на уровне БД (defense-in-depth к проверкам в сервисном слое).
 *
 * Заменяет одностолбцовые FK plants.location_id и plants.nursery_species_id на
 * составные, включающие nursery_id:
 *   plants(location_id, nursery_id)        -> locations(id, nursery_id)
 *   plants(nursery_species_id, nursery_id) -> nursery_species(id, nursery_id)
 * После этого БД физически не даст привязать растение к локации или виду ЧУЖОГО
 * питомника, даже если будущий код забудет проверку в сервисе.
 *
 * container_id и stage_id сюда НЕ включены намеренно: их справочники содержат
 * системные строки (nursery_id IS NULL), общие для всех питомников, поэтому составной
 * FK по nursery_id для них невозможен — изоляция этих ссылок обеспечивается сервисным
 * слоём (plant.service.js: resolveReferences).
 *
 * ON DELETE SET NULL задаётся только для ссылочного столбца (синтаксис PG15+
 * `SET NULL (col)`), т.к. plants.nursery_id NOT NULL и обнулять его при удалении
 * локации/вида нельзя — иначе SET NULL по обоим столбцам упал бы.
 *
 * ВНИМАНИЕ: если в существующих данных уже есть растение со ссылкой на чужой питомник,
 * ADD CONSTRAINT упадёт — это выявит реальное загрязнение данных, которое надо
 * устранить перед накатом в prod.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Составной FK требует UNIQUE ровно по (id, nursery_id) на родителе — PK по одному id
  // для этого недостаточно.
  await knex.schema.alterTable('locations', (table) => {
    table.unique(['id', 'nursery_id']);
  });
  await knex.schema.alterTable('nursery_species', (table) => {
    table.unique(['id', 'nursery_id']);
  });

  await knex.schema.alterTable('plants', (table) => {
    table.dropForeign(['location_id']);
    table.dropForeign(['nursery_species_id']);
  });

  await knex.raw(`
    ALTER TABLE plants
      ADD CONSTRAINT plants_location_id_nursery_foreign
      FOREIGN KEY (location_id, nursery_id)
      REFERENCES locations (id, nursery_id)
      ON DELETE SET NULL (location_id)
  `);
  await knex.raw(`
    ALTER TABLE plants
      ADD CONSTRAINT plants_nursery_species_id_nursery_foreign
      FOREIGN KEY (nursery_species_id, nursery_id)
      REFERENCES nursery_species (id, nursery_id)
      ON DELETE SET NULL (nursery_species_id)
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('ALTER TABLE plants DROP CONSTRAINT plants_nursery_species_id_nursery_foreign');
  await knex.raw('ALTER TABLE plants DROP CONSTRAINT plants_location_id_nursery_foreign');

  await knex.schema.alterTable('plants', (table) => {
    table.foreign('location_id').references('id').inTable('locations').onDelete('SET NULL');
    table
      .foreign('nursery_species_id')
      .references('id')
      .inTable('nursery_species')
      .onDelete('SET NULL');
  });

  await knex.schema.alterTable('nursery_species', (table) => {
    table.dropUnique(['id', 'nursery_id']);
  });
  await knex.schema.alterTable('locations', (table) => {
    table.dropUnique(['id', 'nursery_id']);
  });
}
