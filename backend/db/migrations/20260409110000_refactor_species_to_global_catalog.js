/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('species_catalog', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.integer('gbif_usage_key').notNullable().unique();
    table.text('scientific_name').notNullable();
    table.text('canonical_name');
    table.text('authorship');
    table.text('rank');
    table.text('taxonomic_status');
    table.text('family');
    table.text('genus');
    table.text('source').notNullable().defaultTo('gbif');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('nursery_species', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table
      .uuid('species_catalog_id')
      .notNullable()
      .references('id')
      .inTable('species_catalog')
      .onDelete('CASCADE');
    table.text('display_name_ru').notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['nursery_id', 'species_catalog_id']);
  });

  await knex.schema.alterTable('plants', (table) => {
    table
      .uuid('nursery_species_id')
      .references('id')
      .inTable('nursery_species')
      .onDelete('SET NULL');
  });

  await knex.raw(`
    INSERT INTO species_catalog (
      gbif_usage_key,
      scientific_name,
      canonical_name,
      authorship,
      rank,
      taxonomic_status,
      family,
      genus,
      source,
      created_at,
      updated_at
    )
    SELECT DISTINCT ON (s.gbif_id)
      s.gbif_id,
      s.scientific_name,
      s.scientific_name,
      NULL,
      'SPECIES',
      NULL,
      s.gbif_family,
      s.gbif_genus,
      'gbif',
      s.created_at,
      s.updated_at
    FROM species s
    ORDER BY s.gbif_id, s.created_at ASC
    ON CONFLICT (gbif_usage_key) DO NOTHING
  `);

  await knex.raw(`
    INSERT INTO nursery_species (
      nursery_id,
      species_catalog_id,
      display_name_ru,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      s.nursery_id,
      sc.id,
      s.display_name_ru,
      s.is_active,
      s.created_at,
      s.updated_at
    FROM species s
    JOIN species_catalog sc ON sc.gbif_usage_key = s.gbif_id
    ON CONFLICT (nursery_id, species_catalog_id)
    DO UPDATE SET
      display_name_ru = EXCLUDED.display_name_ru,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
  `);

  await knex.raw(`
    UPDATE plants p
    SET nursery_species_id = ns.id
    FROM species s
    JOIN species_catalog sc ON sc.gbif_usage_key = s.gbif_id
    JOIN nursery_species ns
      ON ns.nursery_id = s.nursery_id
     AND ns.species_catalog_id = sc.id
    WHERE p.species_id = s.id
  `);

  await knex.schema.alterTable('plants', (table) => {
    table.dropForeign(['species_id']);
    table.dropColumn('species_id');
  });

  await knex.schema.dropTable('species');

  await knex.schema.raw('CREATE INDEX idx_species_catalog_usage_key ON species_catalog(gbif_usage_key)');
  await knex.schema.raw(
    'CREATE INDEX idx_species_catalog_scientific_name ON species_catalog(lower(scientific_name))'
  );
  await knex.schema.raw('CREATE INDEX idx_nursery_species_nursery ON nursery_species(nursery_id)');
  await knex.schema.raw(
    'CREATE INDEX idx_nursery_species_catalog ON nursery_species(species_catalog_id)'
  );
  await knex.schema.raw(
    'CREATE INDEX idx_plants_nursery_species ON plants(nursery_species_id) WHERE deleted_at IS NULL'
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.createTable('species', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.integer('gbif_id').notNullable();
    table.text('scientific_name').notNullable();
    table.text('display_name_ru').notNullable();
    table.text('gbif_family');
    table.text('gbif_genus');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['nursery_id', 'gbif_id']);
  });

  await knex.raw(`
    INSERT INTO species (
      nursery_id,
      gbif_id,
      scientific_name,
      display_name_ru,
      gbif_family,
      gbif_genus,
      is_active,
      created_at,
      updated_at
    )
    SELECT
      ns.nursery_id,
      sc.gbif_usage_key,
      sc.scientific_name,
      ns.display_name_ru,
      sc.family,
      sc.genus,
      ns.is_active,
      ns.created_at,
      ns.updated_at
    FROM nursery_species ns
    JOIN species_catalog sc ON sc.id = ns.species_catalog_id
  `);

  await knex.schema.alterTable('plants', (table) => {
    table.uuid('species_id').references('id').inTable('species').onDelete('SET NULL');
  });

  await knex.raw(`
    UPDATE plants p
    SET species_id = s.id
    FROM nursery_species ns
    JOIN species_catalog sc ON sc.id = ns.species_catalog_id
    JOIN species s
      ON s.nursery_id = ns.nursery_id
     AND s.gbif_id = sc.gbif_usage_key
    WHERE p.nursery_species_id = ns.id
  `);

  await knex.schema.alterTable('plants', (table) => {
    table.dropForeign(['nursery_species_id']);
    table.dropColumn('nursery_species_id');
  });

  await knex.schema.dropTable('nursery_species');
  await knex.schema.dropTable('species_catalog');

  await knex.schema.raw('CREATE INDEX idx_species_nursery ON species(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_species_gbif ON species(nursery_id, gbif_id)');
  await knex.schema.raw(
    'CREATE INDEX idx_plants_species ON plants(species_id) WHERE deleted_at IS NULL'
  );
}
