/**
 * Коды растений уникальны в пределах ПИТОМНИКА, а не глобально (аудит D8).
 *
 * В init-миграции 20260408073000 qr_code и numeric_code были объявлены как
 * `.notNullable().unique()` — Knex создал глобальные UNIQUE-констрейнты
 * plants_qr_code_unique и plants_numeric_code_unique на всё общее (мультитенантное)
 * пространство. Проблема: 8-значный numeric_code генерируется из Date.now() в общем
 * пространстве всех клиентов — с ростом числа питомников растут коллизии (после ~10
 * неудачных попыток сервис отдаёт HTTP 500), а изоляция чтения держалась только на
 * app-проверке nursery_id после глобального поиска.
 *
 * Решение: снимаем глобальную уникальность и вводим составную per-nursery.
 * Уникальные индексы делаем PARTIAL (WHERE ... IS NOT NULL): сейчас обе колонки NOT
 * NULL, но partial-форма корректно ведёт себя и при будущей nullable-семантике кодов
 * (несколько NULL в одном питомнике не конфликтуют) и не индексирует NULL-строки.
 *
 * Плоские дублирующие индексы idx_plants_qr / idx_plants_numeric_code (находка D9)
 * здесь НЕ трогаем — они не обеспечивают уникальность, это отдельная чистка.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Снимаем глобальную уникальность (имена — дефолтные Knex-имена из init-миграции).
  await knex.raw('ALTER TABLE plants DROP CONSTRAINT plants_qr_code_unique');
  await knex.raw('ALTER TABLE plants DROP CONSTRAINT plants_numeric_code_unique');

  // Составная уникальность в пределах питомника.
  await knex.raw(
    'CREATE UNIQUE INDEX uq_plants_nursery_qr ON plants (nursery_id, qr_code) WHERE qr_code IS NOT NULL'
  );
  await knex.raw(
    'CREATE UNIQUE INDEX uq_plants_nursery_numeric_code ON plants (nursery_id, numeric_code) WHERE numeric_code IS NOT NULL'
  );
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS uq_plants_nursery_numeric_code');
  await knex.raw('DROP INDEX IF EXISTS uq_plants_nursery_qr');

  // Возвращаем глобальные UNIQUE как в init-миграции. Упадёт, если в данных появились
  // кросс-nursery дубликаты кодов (на тестовой БД их нет).
  await knex.raw('ALTER TABLE plants ADD CONSTRAINT plants_qr_code_unique UNIQUE (qr_code)');
  await knex.raw('ALTER TABLE plants ADD CONSTRAINT plants_numeric_code_unique UNIQUE (numeric_code)');
}
