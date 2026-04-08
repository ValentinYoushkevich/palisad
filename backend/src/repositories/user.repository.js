import db from '@/config/knex.js';

export function findOwnerByAccountId(accountId) {
  return db('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('nurseries.account_id', accountId)
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

export function create(data) {
  return db('users')
    .insert(data)
    .returning('*')
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
  return db('users').where({ nursery_id: nurseryId, id }).first();
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
    .returning('*')
    .then((rows) => rows[0]);
}
