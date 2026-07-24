import db from '@/config/knex.js';

export function getFreePlan() {
  return db('plans').where({ slug: 'free', is_active: true }).first();
}

export function create(data, executor = db) {
  return executor('subscriptions')
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

export function getActiveWithPlan(accountId, executor = db) {
  return executor('subscriptions')
    .join('plans', 'subscriptions.plan_id', 'plans.id')
    .where('subscriptions.account_id', accountId)
    .whereIn('subscriptions.status', ['trial', 'active'])
    .select('subscriptions.*', 'plans.*')
    .orderBy('subscriptions.created_at', 'desc')
    .first();
}

export function getAllPlans() {
  return db('plans').where({ is_active: true }).orderBy('created_at', 'asc');
}

export function cancelActive(accountId, executor = db) {
  return executor('subscriptions')
    .where({ account_id: accountId })
    .whereIn('status', ['trial', 'active'])
    .update({
      status: 'cancelled',
      cancelled_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
}

export function getPlanById(id) {
  return db('plans').where({ id, is_active: true }).first();
}
