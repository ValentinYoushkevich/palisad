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
 * Откат сужает CHECK обратно до набора без 'change_stage'. Если в данных уже есть
 * операции type='change_stage', ADD CONSTRAINT на узкий список упал бы (D14) —
 * поэтому перед сужением конвертируем такие строки в 'other' (значение из узкого
 * набора; запись операции сохраняется, теряется лишь точный подтип). Делаем это до
 * пересоздания CHECK, чтобы откат был прод-безопасным и не падал на реальных данных.
 *
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('ALTER TABLE operations DROP CONSTRAINT IF EXISTS chk_operations_type');
  await knex.raw("UPDATE operations SET type = 'other' WHERE type = 'change_stage'");
  await knex.raw(
    "ALTER TABLE operations ADD CONSTRAINT chk_operations_type CHECK (type IN ('grafting', 'pruning', 'treatment', 'transplant', 'inspection', 'other'))"
  );
}
