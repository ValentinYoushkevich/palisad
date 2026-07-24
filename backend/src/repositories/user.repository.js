import db from '@/config/knex.js';

// Публичные колонки users. НИКОГДА не отдаём password_hash наружу: create/updateById
// раньше делали returning('*'), а findByNurseryAndId — select('*'), и хэш утекал в
// ответы staff-API (см. B17).
const SAFE_USER_COLUMNS = [
  'id',
  'nursery_id',
  'name',
  'role',
  'email',
  'is_active',
  'must_change_password',
  'created_at',
  'updated_at',
];

export function findOwnerByAccountId(accountId) {
  return db('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('nurseries.account_id', accountId)
    .where('users.role', 'owner')
    .select('users.*')
    .first();
}

export function findOwnerByAccountAndNursery(accountId, nurseryId) {
  return db('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('nurseries.account_id', accountId)
    .where('users.nursery_id', nurseryId)
    .where('users.role', 'owner')
    .select('users.*')
    .first();
}

export function clearMustChangePassword(accountId) {
  return db('users')
    .whereIn(
      'nursery_id',
      db('nurseries').select('id').where({ account_id: accountId })
    )
    .andWhere({ role: 'owner' })
    .update({
      must_change_password: false,
      updated_at: db.fn.now(),
    });
}

// B11: staff-логин. POST /api/auth/login не знает заранее, чей это email —
// аккаунта-владельца или сотрудника, поэтому ищем активного сотрудника ГЛОБАЛЬНО
// (среди всех питомников всех аккаунтов). account_id нужен для JWT/planGuards —
// достаём его join'ом с nurseries. password_hash отдаём ТОЛЬКО для внутренней
// проверки пароля в auth.service; наружу он не уходит (mapAuthUser его не включает).
//
// ДОПУЩЕНИЕ (B11): email активного сотрудника считаем ГЛОБАЛЬНО УНИКАЛЬНЫМ среди
// строк с is_active=true. БД этого не гарантирует (уникального индекса на users.email
// нет). Поэтому если вдруг найдётся несколько активных сотрудников с одинаковым
// email, выбираем детерминированно — самого раннего по created_at (id как tie-break),
// — чтобы результат логина был воспроизводимым, а не зависел от порядка выборки.
export function findActiveByEmail(email) {
  return db('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('users.email', email)
    .andWhere('users.is_active', true)
    .orderBy('users.created_at', 'asc')
    .orderBy('users.id', 'asc')
    .select(
      'users.id',
      'users.nursery_id',
      'users.name',
      'users.role',
      'users.email',
      'users.is_active',
      'users.must_change_password',
      'users.password_hash',
      'users.created_at',
      'nurseries.account_id'
    )
    .first();
}

// B11: восстановление staff-сессии при refresh по userId из refresh-токена. Фильтр
// is_active=true намеренный: деактивированный владельцем сотрудник не продлит сессию
// (на следующем refresh его выкинет в 401). account_id — тем же join'ом.
export function findActiveById(id) {
  return db('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('users.id', id)
    .andWhere('users.is_active', true)
    .select(
      'users.id',
      'users.nursery_id',
      'users.name',
      'users.role',
      'users.email',
      'users.is_active',
      'users.must_change_password',
      'nurseries.account_id'
    )
    .first();
}

// B11: смена пароля залогиненным сотрудником правит ИМЕННО его строку в users
// (owner-флоу правит accounts.password_hash; здесь — users.password_hash).
export function updatePassword(id, passwordHash) {
  return db('users')
    .where({ id })
    .update({ password_hash: passwordHash, updated_at: db.fn.now() });
}

// B11: снимаем must_change_password у КОНКРЕТНОГО сотрудника (по users.id).
// clearMustChangePassword выше чистит флаг только у owner-строк аккаунта и для staff
// не подходит.
export function clearMustChangePasswordById(id) {
  return db('users')
    .where({ id })
    .update({ must_change_password: false, updated_at: db.fn.now() });
}

export function create(data, executor = db) {
  return executor('users')
    .insert(data)
    .returning(SAFE_USER_COLUMNS)
    .then((rows) => rows[0]);
}

export function findAllByNursery(nurseryId, filters = {}) {
  const query = db('users').where({ nursery_id: nurseryId });

  if (filters.role) {
    query.where({ role: filters.role });
  }
  if (filters.isActive !== undefined) {
    query.where({ is_active: filters.isActive });
  }

  return query.select(
    'id',
    'name',
    'role',
    'email',
    'is_active',
    'must_change_password',
    'created_at'
  );
}

export function findById(id) {
  return db('users').where({ id }).first();
}

export function findByNurseryAndId(nurseryId, id) {
  return db('users')
    .where({ nursery_id: nurseryId, id })
    .select(SAFE_USER_COLUMNS)
    .first();
}

export function countByNursery(nurseryId, executor = db) {
  return executor('users')
    .where({ nursery_id: nurseryId })
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}

export function countActiveOwners(nurseryId) {
  return db('users')
    .where({ nursery_id: nurseryId, role: 'owner', is_active: true })
    .count('id as count')
    .then((rows) => Number(rows[0].count));
}

export function updateById(id, data) {
  return db('users')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning(SAFE_USER_COLUMNS)
    .then((rows) => rows[0]);
}
