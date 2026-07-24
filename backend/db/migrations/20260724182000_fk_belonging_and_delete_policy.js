/**
 * Принадлежность last_active_nursery_id аккаунту на уровне БД (аудит D15).
 *
 * accounts.last_active_nursery_id (миграция 20260614120000) сейчас — одностолбцовый FK
 * на nurseries(id) без привязки к аккаунту: на уровне БД он может указывать на питомник
 * ЧУЖОГО аккаунта (изоляцию держит только сервис authService.activateNursery, который
 * сверяет nurseryRepo.findByIdAndAccount). Вводим составной FK
 *   accounts(id, last_active_nursery_id) -> nurseries(account_id, id),
 * который физически требует, чтобы указанный питомник принадлежал этому же аккаунту.
 * Для составного FK нужен UNIQUE ровно по (account_id, id) на nurseries (PK по одному id
 * недостаточно) — добавляем его.
 *
 * MATCH SIMPLE (дефолт): когда last_active_nursery_id IS NULL, составной FK не
 * проверяется (accounts.id всегда NOT NULL, но один из ссылочных столбцов NULL —
 * ограничение считается выполненным) — то есть «активный питомник не выбран» остаётся
 * валидным.
 *
 * ON DELETE SET NULL (last_active_nursery_id): при удалении питомника обнуляем ТОЛЬКО
 * ссылочный столбец (синтаксис PG15+ `SET NULL (col)`) — обнулять accounts.id (PK)
 * нельзя. Поведение эквивалентно прежнему одностолбцовому SET NULL.
 *
 * ВНИМАНИЕ (prod): если в существующих данных есть аккаунт, чей last_active_nursery_id
 * указывает на чужой питомник, ADD CONSTRAINT упадёт — это выявит реальное загрязнение,
 * которое надо устранить перед накатом. На тестовой БД таких данных нет.
 *
 * D16 (locations.parent_id ON DELETE SET NULL -> RESTRICT) СОЗНАТЕЛЬНО НЕ включена в эту
 * миграцию — см. отчёт: RESTRICT на self-FK ломает штатный каскад удаления
 * (accounts -> nurseries -> locations), а orphaning через сервис уже исключён проверкой
 * childrenCount в locationService.deleteLocation. Оставляем SET NULL.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // Цель составного FK: UNIQUE(account_id, id) на nurseries.
  await knex.schema.alterTable('nurseries', (table) => {
    table.unique(['account_id', 'id']);
  });

  // Снимаем прежний одностолбцовый FK (имя — дефолтное Knex из миграции 20260614120000).
  await knex.raw('ALTER TABLE accounts DROP CONSTRAINT accounts_last_active_nursery_id_foreign');

  // Составной FK «питомник принадлежит аккаунту».
  await knex.raw(`
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_last_active_nursery_fk
      FOREIGN KEY (id, last_active_nursery_id)
      REFERENCES nurseries (account_id, id)
      ON DELETE SET NULL (last_active_nursery_id)
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw('ALTER TABLE accounts DROP CONSTRAINT accounts_last_active_nursery_fk');

  // Возвращаем одностолбцовый FK как в миграции 20260614120000.
  await knex.raw(`
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_last_active_nursery_id_foreign
      FOREIGN KEY (last_active_nursery_id)
      REFERENCES nurseries (id)
      ON DELETE SET NULL
  `);

  await knex.schema.alterTable('nurseries', (table) => {
    table.dropUnique(['account_id', 'id']);
  });
}
