/**
 * Идемпотентность повторной доставки офлайн-очереди (аудит F2 / T6).
 *
 * Клиент при создании операции/движения может прислать необязательный
 * client_request_id (UUID, генерируется на устройстве). При повторной доставке
 * того же запроса (нестабильная сеть, ретраи офлайн-очереди) бэкенд должен
 * создать РОВНО одну запись, а повтор с тем же client_request_id — вернуть уже
 * созданную, без дублирования и повторных побочных эффектов.
 *
 * Дедуп на уровне БД обеспечивается ЧАСТИЧНЫМ уникальным индексом по
 * client_request_id (WHERE client_request_id IS NOT NULL): NULL-значения
 * (запросы без ключа) под уникальность не попадают и не блокируются.
 *
 * Partial unique index создаётся через knex.raw: schema builder этой версии не
 * умеет .where() на .unique().
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('operations', (table) => {
    table.uuid('client_request_id').nullable();
  });
  await knex.schema.alterTable('movements', (table) => {
    table.uuid('client_request_id').nullable();
  });

  await knex.raw(`
    CREATE UNIQUE INDEX idx_operations_client_request_id
      ON operations (client_request_id)
      WHERE client_request_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX idx_movements_client_request_id
      ON movements (client_request_id)
      WHERE client_request_id IS NOT NULL
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_movements_client_request_id');
  await knex.raw('DROP INDEX IF EXISTS idx_operations_client_request_id');

  await knex.schema.alterTable('movements', (table) => {
    table.dropColumn('client_request_id');
  });
  await knex.schema.alterTable('operations', (table) => {
    table.dropColumn('client_request_id');
  });
}
