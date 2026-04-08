import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';

export async function getCurrent(accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub) {
    throw new AppError('Активная подписка не найдена', 404);
  }

  return sub;
}

export function getPlans() {
  return subscriptionRepo.getAllPlans();
}

export async function changePlan(accountId, planId) {
  const plan = await subscriptionRepo.getPlanById(planId);
  if (!plan) {
    throw new AppError('План не найден', 404);
  }

  await subscriptionRepo.cancelActive(accountId);
  return subscriptionRepo.create({
    account_id: accountId,
    plan_id: planId,
    status: 'active',
  });
}
