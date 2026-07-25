import db from '@/config/knex.js';

export function create(data, executor = db) {
  return executor('plan_requests')
    .insert(data)
    .returning('*')
    .then((rows) => rows[0]);
}

// Дуп-гард (Э4): открытая (status = 'new') заявка этого аккаунта на этот план.
export function findOpenByAccountAndPlan({ accountId, planId }, executor = db) {
  return executor('plan_requests')
    .where({ account_id: accountId, plan_id: planId, status: 'new' })
    .first();
}

export function findByAccount(accountId, executor = db) {
  return executor('plan_requests')
    .where({ account_id: accountId })
    .orderBy('created_at', 'desc');
}

// Э4 (owner «мои заявки»): свои заявки со статусами + имя/slug запрошенного плана.
// inner join — plan_id NOT NULL, строк не теряет.
export function findByAccountDetailed(accountId, executor = db) {
  return executor('plan_requests')
    .join('plans', 'plan_requests.plan_id', 'plans.id')
    .where('plan_requests.account_id', accountId)
    .select('plan_requests.*', 'plans.name as plan_name', 'plans.slug as plan_slug')
    .orderBy('plan_requests.created_at', 'desc');
}

export function listByStatus({ status, limit, offset }, executor = db) {
  const query = executor('plan_requests').orderBy('created_at', 'desc');
  if (status) {
    query.where({ status });
  }
  if (limit !== undefined) {
    query.limit(limit);
  }
  if (offset !== undefined) {
    query.offset(offset);
  }
  return query;
}

export function countByStatus({ status }, executor = db) {
  const query = executor('plan_requests');
  if (status) {
    query.where({ status });
  }
  return query.count('id as count').then((rows) => Number(rows[0].count));
}

// Э3 (админ-список): заявки с email аккаунта и инфо запрошенного плана (name/slug).
// join — account_id/plan_id NOT NULL, поэтому inner join строк не теряет.
export function listDetailedByStatus({ status, limit, offset }, executor = db) {
  const query = executor('plan_requests')
    .join('accounts', 'plan_requests.account_id', 'accounts.id')
    .join('plans', 'plan_requests.plan_id', 'plans.id')
    .select(
      'plan_requests.*',
      'accounts.email as account_email',
      'plans.name as plan_name',
      'plans.slug as plan_slug'
    )
    .orderBy('plan_requests.created_at', 'desc');
  if (status) {
    query.where('plan_requests.status', status);
  }
  if (limit !== undefined) {
    query.limit(limit);
  }
  if (offset !== undefined) {
    query.offset(offset);
  }
  return query;
}

// Обработка заявки: new → processed с фиксацией processed_at. undefined — если 0 строк.
export function markProcessed(id, executor = db) {
  return executor('plan_requests')
    .where({ id, status: 'new' })
    .update({ status: 'processed', processed_at: executor.fn.now() })
    .returning('*')
    .then((rows) => rows[0]);
}
