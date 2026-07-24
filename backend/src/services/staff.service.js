import argon2 from 'argon2';

import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { NOTIFICATION_TYPES } from '@/constants/notification.constants.js';
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import * as userRepo from '@/repositories/user.repository.js';
import { AppError } from '@/utils/AppError.js';
import { logActivity } from '@/utils/logActivity.js';
import { notify } from '@/utils/notify.js';
import { lockAccount } from '@/utils/planGuards.js';

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

export async function createUser(nurseryId, accountId, data, actorUserId) {
  const passwordHash = await argon2.hash(data.password);

  // Лимит пользователей проверяется под advisory-lock'ом в той же транзакции, что и
  // вставка — иначе параллельные createUser пробивают user_limit (B10).
  const user = await db.transaction(async (trx) => {
    await lockAccount(trx, accountId);
    await checkUserLimit(nurseryId, accountId, trx);
    return userRepo.create(
      {
        nursery_id: nurseryId,
        name: data.name,
        role: data.role,
        password_hash: passwordHash,
        email: data.email,
        is_active: true,
        must_change_password: true,
      },
      trx
    );
  });
  await logActivity({
    nurseryId,
    userId: actorUserId,
    eventType: EVENT_TYPES.USER_CREATED,
    entityType: ENTITY_TYPES.USER,
    entityId: user.id,
    details: { role: user.role },
  });
  return user;
}

export async function updateUser(nurseryId, id, data) {
  await requireUser(nurseryId, id);
  return userRepo.updateById(id, data);
}

export async function changeRole(nurseryId, id, role, actorUserId) {
  await requireUser(nurseryId, id);
  const user = await userRepo.updateById(id, { role });
  await logActivity({
    nurseryId,
    userId: actorUserId,
    eventType: EVENT_TYPES.USER_ROLE_CHANGED,
    entityType: ENTITY_TYPES.USER,
    entityId: id,
    details: { role },
  });
  await notify({
    nurseryId,
    userId: id,
    type: NOTIFICATION_TYPES.ROLE_CHANGED,
    payload: { role, changedBy: actorUserId },
  });
  return user;
}

export async function toggleStatus(nurseryId, id, actorUserId) {
  const user = await requireUser(nurseryId, id);
  if (user.is_active) {
    await guardLastOwner(nurseryId, user);
  }

  const updated = await userRepo.updateById(id, { is_active: !user.is_active });
  if (!updated.is_active) {
    await logActivity({
      nurseryId,
      userId: actorUserId,
      eventType: EVENT_TYPES.USER_DEACTIVATED,
      entityType: ENTITY_TYPES.USER,
      entityId: id,
      details: null,
    });
  }
  return updated;
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

async function checkUserLimit(nurseryId, accountId, executor) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId, executor);
  if (!sub || sub.user_limit === null) {
    return;
  }

  const count = await userRepo.countByNursery(nurseryId, executor);
  if (count >= sub.user_limit) {
    throw new AppError('Достигнут лимит пользователей по текущему плану', 403);
  }
}
