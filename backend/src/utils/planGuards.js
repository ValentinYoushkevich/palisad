import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';

async function getActivePlan(accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub) {
    throw new AppError('Активная подписка не найдена', 403);
  }

  return sub;
}

export async function checkLimit(accountId, resource, currentCount) {
  const plan = await getActivePlan(accountId);
  const limit = plan[resource];
  if (limit === null) {
    return;
  }

  if (currentCount >= limit) {
    throw new AppError(`Достигнут лимит по плану: ${resource}`, 403);
  }
}

export async function checkFeature(accountId, feature) {
  const plan = await getActivePlan(accountId);
  if (!plan[feature]) {
    throw new AppError(`Функция недоступна в текущем плане: ${feature}`, 403);
  }
}
