import argon2 from 'argon2';

import { DEFAULT_OWNER_ROLE } from '@/constants/nursery.constants.js';
import * as accountRepo from '@/repositories/account.repository.js';
import * as nurseryRepo from '@/repositories/nursery.repository.js';
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import * as userRepo from '@/repositories/user.repository.js';
import { AppError } from '@/utils/AppError.js';

export async function getMyNursery(accountId) {
  const nursery = await nurseryRepo.findByAccountId(accountId);
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }

  return nursery;
}

export async function createNursery(accountId, data) {
  const existing = await nurseryRepo.findByAccountId(accountId);
  if (existing) {
    throw new AppError('Питомник уже создан', 409);
  }

  await checkNurseryLimit(accountId);

  const account = await accountRepo.findById(accountId);
  if (!account) {
    throw new AppError('Аккаунт не найден', 404);
  }

  const nursery = await nurseryRepo.create({ ...data, account_id: accountId });
  const passwordHash = await argon2.hash(Math.random().toString(36));
  await userRepo.create({
    nursery_id: nursery.id,
    name: account.name,
    role: DEFAULT_OWNER_ROLE,
    password_hash: passwordHash,
    email: account.email,
    is_active: true,
    must_change_password: false,
  });

  return nursery;
}

export async function updateNursery(accountId, data) {
  const nursery = await nurseryRepo.findByAccountId(accountId);
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }

  return nurseryRepo.updateById(nursery.id, data);
}

async function checkNurseryLimit(accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub) {
    return;
  }

  const { nursery_limit: nurseryLimit } = sub;
  if (nurseryLimit === null) {
    return;
  }

  const count = await nurseryRepo.countByAccountId(accountId);
  if (count >= nurseryLimit) {
    throw new AppError('Достигнут лимит питомников по текущему плану', 403);
  }
}
