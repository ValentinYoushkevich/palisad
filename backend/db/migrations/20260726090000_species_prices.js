/**
 * Прайс-лист питомника (v3, Э1 «Экспорт» — фундамент).
 *
 * species_prices — цена за вид × тип контейнера в пределах питомника. Один вид может
 * иметь разные цены в разных контейнерах; тройка
 * (nursery_id, nursery_species_id, container_type_id) уникальна — по ней идёт upsert.
 *
 * Тенант-изоляция на уровне БД (defense-in-depth, паттерн D2): составной FK
 * (nursery_species_id, nursery_id) → nursery_species(id, nursery_id) физически не даёт
 * привязать цену к виду ЧУЖОГО питомника. container_type_id — обычный FK: справочник
 * контейнеров содержит системные строки (nursery_id IS NULL), общие для всех питомников,
 * поэтому составной FK по nursery_id для него невозможен — валидность контейнера в
 * контексте питомника проверяется в сервисном слое (price.service.js, паттерн B5).
 *
 * CHECK price >= 0 — через knex.raw (fluent .check() в проекте не используется).
 *
 * Экспорт CSV прайс-листа (Э2/Э3) будет гейтиться feature_export; само управление
 * ценами (Э1) — нет (доступно на любом тарифе).
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.createTable('species_prices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('nursery_id').notNullable().references('id').inTable('nurseries').onDelete('CASCADE');
    table.uuid('nursery_species_id').notNullable();
    table
      .uuid('container_type_id')
      .notNullable()
      .references('id')
      .inTable('container_types')
      .onDelete('CASCADE');
    table.decimal('price', 10, 2).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['nursery_id', 'nursery_species_id', 'container_type_id']);
    table.index(['nursery_id']);
  });

  await knex.raw(
    'ALTER TABLE species_prices ADD CONSTRAINT chk_species_prices_price CHECK (price >= 0)'
  );

  // Тенант-изоляция (D2): составной FK (nursery_species_id, nursery_id) →
  // nursery_species(id, nursery_id). Отдельный одностолбцовый FK на nursery_species_id
  // не добавляем — составной уже обеспечивает и существование вида, и совпадение питомника.
  await knex.raw(`
    ALTER TABLE species_prices
      ADD CONSTRAINT species_prices_nursery_species_id_nursery_foreign
      FOREIGN KEY (nursery_species_id, nursery_id)
      REFERENCES nursery_species (id, nursery_id)
      ON DELETE CASCADE
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('species_prices');
}
