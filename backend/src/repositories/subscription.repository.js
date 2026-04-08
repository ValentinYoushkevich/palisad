import db from '@/config/knex.js';

export function getFreePlan() {
  return db('plans').where({ slug: 'free', is_active: true }).first();
}

export function create(data) {
  return db('subscriptions')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

export function getActive(accountId) {
  return db('subscriptions')
    .where({ account_id: accountId })
    .whereIn('status', ['trial', 'active'])
    .orderBy('created_at', 'desc')
    .first();
}
