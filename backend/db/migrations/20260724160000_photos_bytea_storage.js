/**
 * Фото операций хранятся как БАЙТЫ в Postgres (аудит F13).
 *
 * Решение владельца: мелкие фото съёмки хранить прямо в БД (bytea), привязка —
 * к операции (photos.operation_id, существующая схема). Внешнее хранилище/URL не
 * используем, поэтому:
 *   - image      bytea   — сами байты изображения;
 *   - mime_type  text    — Content-Type для отдачи через стрим-эндпоинт;
 *   - size       integer — размер в байтах (метаданные списка, без загрузки байтов);
 *   - url        делаем nullable — старый путь загрузки по URL выведен из использования
 *                (колонку физически не дропаем, чтобы не терять исторические строки).
 *
 * Заодно закрывает B18 (attachPhoto без валидации входа): новый путь принимает файл
 * с проверкой mime/размера на уровне multer.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable('photos', (table) => {
    table.binary('image');
    table.text('mime_type');
    table.integer('size');
    table.text('url').nullable().alter();
  });
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.schema.alterTable('photos', (table) => {
    table.dropColumn('size');
    table.dropColumn('mime_type');
    table.dropColumn('image');
    table.text('url').notNullable().alter();
  });
}
