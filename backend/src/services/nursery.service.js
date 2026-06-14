import argon2 from 'argon2';

import { DEFAULT_OWNER_ROLE } from '@/constants/nursery.constants.js';
import * as accountRepo from '@/repositories/account.repository.js';
import * as nurseryRepo from '@/repositories/nursery.repository.js';
import * as userRepo from '@/repositories/user.repository.js';
import { AppError } from '@/utils/AppError.js';
import { checkLimit } from '@/utils/planGuards.js';

export async function getMyNursery(accountId, activeNurseryId) {
  let nursery = activeNurseryId
    ? await nurseryRepo.findByIdAndAccount(activeNurseryId, accountId)
    : null;
  if (!nursery) {
    nursery = await nurseryRepo.findFirstByAccountId(accountId);
  }
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }

  return nursery;
}

export function listNurseries(accountId) {
  return nurseryRepo.findAllByAccountId(accountId);
}

export async function getNurseryById(accountId, nurseryId) {
  const nursery = await nurseryRepo.findByIdAndAccount(nurseryId, accountId);
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }

  return nursery;
}

export async function createNursery(accountId, data) {
  const count = await nurseryRepo.countByAccountId(accountId);
  await checkLimit(accountId, 'nursery_limit', count);

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

export async function updateNursery(accountId, nurseryId, data) {
  const nursery = nurseryId
    ? await nurseryRepo.findByIdAndAccount(nurseryId, accountId)
    : null;
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }

  return nurseryRepo.updateById(nursery.id, data);
}
