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
