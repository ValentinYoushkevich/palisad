import argon2 from 'argon2';

import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import * as userRepo from '@/repositories/user.repository.js';
import { AppError } from '@/utils/AppError.js';

export function getUsers(nurseryId, filters) {
  return userRepo.findAllByNursery(nurseryId, {
    role: filters.role,
    isActive:
      filters.is_active !== undefined ? filters.is_active === 'true' : undefined,
  });
}

export function getUserById(nurseryId, id) {
  return requireUser(nurseryId, id);
}

export async function createUser(nurseryId, accountId, data) {
  await checkUserLimit(nurseryId, accountId);
  const passwordHash = await argon2.hash(data.password);

  return userRepo.create({
    nursery_id: nurseryId,
    name: data.name,
    role: data.role,
    password_hash: passwordHash,
    email: data.email,
    is_active: true,
    must_change_password: true,
  });
}

export async function updateUser(nurseryId, id, data) {
  await requireUser(nurseryId, id);
  return userRepo.updateById(id, data);
}

export async function changeRole(nurseryId, id, role) {
  await requireUser(nurseryId, id);
  return userRepo.updateById(id, { role });
}

export async function toggleStatus(nurseryId, id) {
  const user = await requireUser(nurseryId, id);
  if (user.is_active) {
    await guardLastOwner(nurseryId, user);
  }

  return userRepo.updateById(id, { is_active: !user.is_active });
}

async function requireUser(nurseryId, id) {
  const user = await userRepo.findByNurseryAndId(nurseryId, id);
  if (!user) {
    throw new AppError('Сотрудник не найден', 404);
  }

  return user;
}

async function guardLastOwner(nurseryId, user) {
  if (user.role !== 'owner') {
    return;
  }

  const activeOwners = await userRepo.countActiveOwners(nurseryId);
  if (activeOwners <= 1) {
    throw new AppError('Нельзя деактивировать единственного владельца', 400);
  }
}

async function checkUserLimit(nurseryId, accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub || sub.user_limit === null) {
    return;
  }

  const users = await userRepo.findAllByNursery(nurseryId);
  if (users.length >= sub.user_limit) {
    throw new AppError('Достигнут лимит пользователей по текущему плану', 403);
  }
}
