import db from '@/config/knex.js';

export function getFreePlan() {
  return db('plans').where({ slug: 'free', is_active: true }).first();
}

export function create(data, executor = db) {
  const row = { ...data };
  // B13: политика trial-срока — 14 дней. auth.service.register создаёт trial без
  // expires_at; дефолт проставляем здесь (единая точка), не трогая auth.service.
  // Для active/free expires_at не ставим: free-подписка бессрочна.
  if (row.status === 'trial' && row.expires_at === undefined) {
    row.expires_at = db.raw("now() + interval '14 days'");
  }
  return executor('subscriptions')
    .insert(row)
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

// B25: раньше select('subscriptions.*', 'plans.*') — плановые колонки шли ПОСЛЕ и затирали
// одноимённые колонки подписки (id, created_at, updated_at), из-за чего GET
// /subscriptions/current возвращал id ПЛАНА вместо id подписки. Ставим plans.* ПЕРВЫМ, а
// subscriptions.* — ПОСЛЕДНИМ: на коллизиях (id/created_at/updated_at) побеждают поля
// подписки (последний столбец в SELECT перекрывает одноимённый в объекте-строке), а
// плановые поля (slug, name, plant_limit, feature_*) сохраняют РОДНЫЕ имена — на них
// опираются planGuards, staff.service, фронт и acceptance-check. Идентичность плана также
// доступна как subscriptions.plan_id.
export function getActiveWithPlan(accountId, executor = db) {
  return executor('subscriptions')
    .join('plans', 'subscriptions.plan_id', 'plans.id')
    .where('subscriptions.account_id', accountId)
    .whereIn('subscriptions.status', ['trial', 'active'])
    .select('plans.*', 'subscriptions.*')
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

// B12: getPlanById удалён вместе с self-service сменой тарифа — план по id больше
// нигде не ищется. Вернуть при подключении биллинга (см. changePlan в сервисе).

// B13: просроченные подписки trial/active (expires_at < now()). expires_at IS NOT NULL —
// бессрочные free-подписки (expires_at NULL) под истечение не попадают.
export function findOverdue(executor = db) {
  return executor('subscriptions')
    .whereIn('status', ['trial', 'active'])
    .whereNotNull('expires_at')
    .where('expires_at', '<', db.fn.now())
    .select('id', 'account_id');
}

// B13: пометить перечисленные подписки истёкшими (downgrade выполняет сервис).
export function markExpired(ids, executor = db) {
  return executor('subscriptions')
    .whereIn('id', ids)
    .update({ status: 'expired', updated_at: db.fn.now() });
}

// B13: подписки trial/active в окне «истекает за 3 дня» (now(); now()+3 дня],
// по которым ещё не уведомляли (expiring_notified_at IS NULL).
export function findExpiringSoon(executor = db) {
  return executor('subscriptions')
    .whereIn('status', ['trial', 'active'])
    .whereNotNull('expires_at')
    .whereNull('expiring_notified_at')
    .where('expires_at', '>', db.fn.now())
    .where('expires_at', '<=', db.raw("now() + interval '3 days'"))
    .select('id', 'account_id', 'expires_at');
}

// B13: отметить, что по подписке отправлено уведомление об истечении (дедуп cron).
export function markExpiringNotified(id, executor = db) {
  return executor('subscriptions')
    .where({ id })
    .update({ expiring_notified_at: db.fn.now(), updated_at: db.fn.now() });
}

// B13: владельцы всех питомников аккаунта — адресаты уведомлений о подписке.
// user.repository.findOwnerByAccountId возвращает лишь ОДНОГО owner'а; для multi-nursery
// нужны все (по одному owner на каждый nursery), поэтому запрос живёт здесь.
export function findAccountOwners(accountId, executor = db) {
  return executor('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('nurseries.account_id', accountId)
    .where('users.role', 'owner')
    .where('users.is_active', true)
    .select('users.id', 'users.nursery_id');
}
