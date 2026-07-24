import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';

// Сериализует конкурентные проверки лимитов в пределах аккаунта. Транзакционный
// advisory-lock держится до COMMIT/ROLLBACK, поэтому пара «посчитал → вставил»
// становится атомарной, и параллельные запросы не пробивают plant/user/nursery_limit
// (TOCTOU-гонка, см. B10). Ключ — 64-битный хэш accountId (UUID-строка).
export function lockAccount(trx, accountId) {
  return trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0)) AS lock', [accountId]);
}

async function getActivePlan(accountId, executor) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId, executor);
  if (!sub) {
    throw new AppError('Активная подписка не найдена', 403);
  }

  return sub;
}

export async function checkLimit(accountId, resource, currentCount, executor) {
  const plan = await getActivePlan(accountId, executor);
  const limit = plan[resource];
  if (limit === null) {
    return;
  }

  if (currentCount >= limit) {
    throw new AppError(`Достигнут лимит по плану: ${resource}`, 403);
  }
}

export async function checkFeature(accountId, feature, executor) {
  const plan = await getActivePlan(accountId, executor);
  if (!plan[feature]) {
    throw new AppError(`Функция недоступна в текущем плане: ${feature}`, 403);
  }
}
