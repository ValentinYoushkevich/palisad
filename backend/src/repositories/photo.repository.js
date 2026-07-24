import db from '@/config/knex.js';

// Метаданные фото без самих байтов (image) — для списков и ответов API.
// Байты отдаём только через стрим-эндпоинт (findByIdForStream).
const META_COLUMNS = ['id', 'operation_id', 'mime_type', 'size', 'created_at'];

// Метаданные фото по набору операций — одним запросом для списка операций.
export function findMetaByOperationIds(operationIds) {
  return db('photos')
    .select(META_COLUMNS)
    .whereIn('operation_id', operationIds)
    .orderBy('created_at');
}

// Вставка байтов: data = { operation_id, image: Buffer, mime_type, size }.
// Возвращаем только метаданные — байты в JSON-ответ не отдаём.
export function create(data) {
  return db('photos')
    .insert(data)
    .returning(META_COLUMNS)
    .then((rows) => rows[0]);
}

// Для delete/guard достаточно метаданных (operation_id) — байты не поднимаем.
export function findById(id) {
  return db('photos').select(META_COLUMNS).where({ id }).first();
}

// Для стрим-эндпоинта: сами байты + mime_type + operation_id (проверка принадлежности).
export function findByIdForStream(id) {
  return db('photos').select('id', 'operation_id', 'mime_type', 'image').where({ id }).first();
}

export function deleteById(id) {
  return db('photos').where({ id }).delete();
}
