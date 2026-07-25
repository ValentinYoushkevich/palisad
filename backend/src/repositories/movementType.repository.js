import db from '@/config/knex.js';

export function findAll(nurseryId) {
  return db('movement_types')
    .where(function scope() {
      this.where({ nursery_id: nurseryId }).orWhereNull('nursery_id');
    })
    .orderBy('is_system', 'desc')
    .orderBy('created_at', 'asc');
}

export function findById(nurseryId, id) {
  return db('movement_types')
    .where({ id })
    .where(function scope() {
      this.where({ nursery_id: nurseryId }).orWhereNull('nursery_id');
    })
    .first();
}

// Системный тип движения по slug (nursery_id IS NULL, is_system). Нужен, когда бизнес
// разрешает КАНОНИЧЕСКИЙ тип не по выбранному пользователем id, а по смыслу (напр.
// «перемещение» при применении расхождений инвентаризации). Однозначен: системные slug'и
// защищены частичным UNIQUE (slug) WHERE nursery_id IS NULL.
export function findSystemBySlug(slug) {
  return db('movement_types').where({ slug, is_system: true }).whereNull('nursery_id').first();
}

export function create(data) {
  return db('movement_types')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function updateById(id, data) {
  return db('movement_types')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
