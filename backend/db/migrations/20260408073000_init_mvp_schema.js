/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await knex.schema.createTable('accounts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('email').notNullable().unique();
    table.text('password_hash').notNullable();
    table.text('name').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('plans', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('name').notNullable();
    table.text('slug').notNullable().unique();
    table.integer('plant_limit');
    table.integer('user_limit');
    table.integer('nursery_limit');
    table.boolean('feature_tags').notNullable().defaultTo(false);
    table.boolean('feature_operations').notNullable().defaultTo(false);
    table.boolean('feature_qr').notNullable().defaultTo(false);
    table.boolean('feature_photos').notNullable().defaultTo(false);
    table.boolean('feature_export').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('account_id').notNullable().references('id').inTable('accounts').onDelete('CASCADE');
    table.uuid('plan_id').notNullable().references('id').inTable('plans');
    table.text('status').notNullable().defaultTo('trial');
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('cancelled_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    "ALTER TABLE subscriptions ADD CONSTRAINT chk_subscriptions_status CHECK (status IN ('trial', 'active', 'expired', 'cancelled'))"
  );

  await knex.schema.createTable('nurseries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('account_id').notNullable().references('id').inTable('accounts').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('address');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('role').notNullable().defaultTo('worker');
    table.text('password_hash').notNullable();
    table.text('email');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('must_change_password').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    "ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('owner', 'agronomist', 'worker', 'observer'))"
  );

  await knex.schema.createTable('locations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.uuid('parent_id').references('id').inTable('locations').onDelete('SET NULL');
    table.text('name').notNullable();
    table.text('type').notNullable().defaultTo('section');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    "ALTER TABLE locations ADD CONSTRAINT chk_locations_type CHECK (type IN ('area', 'section', 'row', 'place'))"
  );

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

  await knex.schema.createTable('tags', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('color').notNullable().defaultTo('#888888');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw("ALTER TABLE tags ADD CONSTRAINT chk_tags_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$')");

  await knex.schema.createTable('movement_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').references('id').inTable('nurseries').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('slug').notNullable();
    table.boolean('is_system').notNullable().defaultTo(false);
    table.text('sets_status');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['nursery_id', 'slug']);
  });
  await knex.raw(
    "ALTER TABLE movement_types ADD CONSTRAINT chk_movement_types_status CHECK (sets_status IS NULL OR sets_status IN ('growing', 'storage', 'sold', 'written_off'))"
  );

  await knex.schema.createTable('container_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').references('id').inTable('nurseries').onDelete('CASCADE');
    table.text('code').notNullable();
    table.text('name').notNullable();
    table.text('container_kind').notNullable().defaultTo('pot');
    table.decimal('volume_liters', 6, 1);
    table.decimal('side_cm', 5, 1);
    table.boolean('is_system').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['nursery_id', 'code']);
  });
  await knex.raw(
    "ALTER TABLE container_types ADD CONSTRAINT chk_container_types_kind CHECK (container_kind IN ('pot', 'open_root', 'trench', 'cold_room', 'greenhouse'))"
  );

  await knex.schema.createTable('plants', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.uuid('species_id').references('id').inTable('species').onDelete('SET NULL');
    table.uuid('location_id').references('id').inTable('locations').onDelete('SET NULL');
    table.uuid('container_id').references('id').inTable('container_types').onDelete('SET NULL');
    table.text('qr_code').notNullable().unique();
    table.text('numeric_code').notNullable().unique();
    table.text('variety');
    table.text('status').notNullable().defaultTo('growing');
    table.date('planted_at');
    table.text('source');
    table.text('notes');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });
  await knex.raw(
    "ALTER TABLE plants ADD CONSTRAINT chk_plants_status CHECK (status IN ('growing', 'storage', 'sold', 'written_off'))"
  );
  await knex.raw(
    "ALTER TABLE plants ADD CONSTRAINT chk_plants_source CHECK (source IS NULL OR source IN ('own', 'purchased'))"
  );

  await knex.schema.createTable('plant_tags', (table) => {
    table.uuid('plant_id').notNullable().references('id').inTable('plants').onDelete('CASCADE');
    table.uuid('tag_id').notNullable().references('id').inTable('tags').onDelete('CASCADE');
    table.primary(['plant_id', 'tag_id']);
  });

  await knex.schema.createTable('operations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('plant_id').notNullable().references('id').inTable('plants').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.text('type').notNullable();
    table.text('notes');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });
  await knex.raw(
    "ALTER TABLE operations ADD CONSTRAINT chk_operations_type CHECK (type IN ('grafting', 'pruning', 'treatment', 'transplant', 'inspection', 'other'))"
  );

  await knex.schema.createTable('photos', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('operation_id').notNullable().references('id').inTable('operations').onDelete('CASCADE');
    table.text('url').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('movements', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('plant_id').notNullable().references('id').inTable('plants').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('type_id').notNullable().references('id').inTable('movement_types');
    table.uuid('from_location_id').references('id').inTable('locations').onDelete('SET NULL');
    table.uuid('to_location_id').references('id').inTable('locations').onDelete('SET NULL');
    table.integer('quantity').notNullable().defaultTo(1);
    table.text('notes');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('ALTER TABLE movements ADD CONSTRAINT chk_movements_quantity CHECK (quantity > 0)');

  await knex.schema.createTable('activity_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.text('event_type').notNullable();
    table.text('entity_type').notNullable();
    table.uuid('entity_id');
    table.jsonb('details');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    "ALTER TABLE activity_logs ADD CONSTRAINT chk_activity_entity_type CHECK (entity_type IN ('plant', 'operation', 'movement', 'location', 'user', 'subscription'))"
  );

  await knex.schema.raw('CREATE INDEX idx_plants_nursery ON plants(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_plants_status ON plants(status) WHERE deleted_at IS NULL');
  await knex.schema.raw('CREATE INDEX idx_plants_qr ON plants(qr_code)');
  await knex.schema.raw('CREATE INDEX idx_plants_numeric_code ON plants(numeric_code)');
  await knex.schema.raw('CREATE INDEX idx_plants_active ON plants(nursery_id) WHERE deleted_at IS NULL');
  await knex.schema.raw('CREATE INDEX idx_plants_species ON plants(species_id) WHERE deleted_at IS NULL');
  await knex.schema.raw('CREATE INDEX idx_plants_container ON plants(container_id) WHERE deleted_at IS NULL');
  await knex.schema.raw('CREATE INDEX idx_species_nursery ON species(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_species_gbif ON species(nursery_id, gbif_id)');
  await knex.schema.raw('CREATE INDEX idx_container_types_nursery ON container_types(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_operations_plant ON operations(plant_id) WHERE deleted_at IS NULL');
  await knex.schema.raw('CREATE INDEX idx_movements_plant ON movements(plant_id)');
  await knex.schema.raw('CREATE INDEX idx_movements_type ON movements(type_id)');
  await knex.schema.raw('CREATE INDEX idx_movement_types_nursery ON movement_types(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_locations_nursery ON locations(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_locations_parent ON locations(parent_id)');
  await knex.schema.raw('CREATE INDEX idx_subscriptions_acct ON subscriptions(account_id)');
  await knex.schema.raw(
    "CREATE INDEX idx_subscriptions_active ON subscriptions(account_id, status) WHERE status IN ('trial', 'active')"
  );
  await knex.schema.raw('CREATE INDEX idx_plant_tags_plant ON plant_tags(plant_id)');
  await knex.schema.raw('CREATE INDEX idx_plant_tags_tag ON plant_tags(tag_id)');
  await knex.schema.raw('CREATE INDEX idx_users_nursery ON users(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_users_role ON users(role)');
  await knex.schema.raw('CREATE INDEX idx_users_active ON users(nursery_id) WHERE is_active = true');
  await knex.schema.raw('CREATE INDEX idx_activity_nursery ON activity_logs(nursery_id)');
  await knex.schema.raw('CREATE INDEX idx_activity_user ON activity_logs(user_id)');
  await knex.schema.raw('CREATE INDEX idx_activity_event_type ON activity_logs(event_type)');
  await knex.schema.raw('CREATE INDEX idx_activity_created_at ON activity_logs(created_at)');
  await knex.schema.raw('CREATE INDEX idx_activity_entity ON activity_logs(entity_type, entity_id)');
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('activity_logs');
  await knex.schema.dropTableIfExists('movements');
  await knex.schema.dropTableIfExists('photos');
  await knex.schema.dropTableIfExists('operations');
  await knex.schema.dropTableIfExists('plant_tags');
  await knex.schema.dropTableIfExists('plants');
  await knex.schema.dropTableIfExists('container_types');
  await knex.schema.dropTableIfExists('movement_types');
  await knex.schema.dropTableIfExists('tags');
  await knex.schema.dropTableIfExists('species');
  await knex.schema.dropTableIfExists('locations');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('nurseries');
  await knex.schema.dropTableIfExists('subscriptions');
  await knex.schema.dropTableIfExists('plans');
  await knex.schema.dropTableIfExists('accounts');
}
