/**
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw('ALTER TABLE operations DROP CONSTRAINT IF EXISTS chk_operations_type');
  await knex.raw(
    "ALTER TABLE operations ADD CONSTRAINT chk_operations_type CHECK (type IN ('grafting', 'pruning', 'treatment', 'transplant', 'change_stage', 'inspection', 'other'))"
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('ALTER TABLE operations DROP CONSTRAINT IF EXISTS chk_operations_type');
  await knex.raw(
    "ALTER TABLE operations ADD CONSTRAINT chk_operations_type CHECK (type IN ('grafting', 'pruning', 'treatment', 'transplant', 'inspection', 'other'))"
  );
}
