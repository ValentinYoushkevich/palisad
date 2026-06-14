import argon2 from 'argon2';

import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import {
  ACCESS_TTL_MS,
  COOKIE_ACCESS,
  COOKIE_OPTIONS,
  COOKIE_REFRESH,
  REFRESH_TTL_MS,
} from '@/constants/auth.constants.js';
import * as accountRepo from '@/repositories/account.repository.js';
import * as nurseryRepo from '@/repositories/nursery.repository.js';
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import * as userRepo from '@/repositories/user.repository.js';
import { AppError } from '@/utils/AppError.js';
import {
  signAccess,
  signRefresh,
  verifyRefresh,
} from '@/utils/jwt.js';
import { logActivity } from '@/utils/logActivity.js';

export async function register(data) {
  const existing = await accountRepo.findByEmail(data.email);
  if (existing) {
    throw new AppError('Email уже используется', 409);
  }

  const freePlan = await subscriptionRepo.getFreePlan();
  if (!freePlan) {
    throw new AppError('План free не найден', 500);
  }

  const passwordHash = await argon2.hash(data.password);
  const account = await accountRepo.create({
    email: data.email,
    password_hash: passwordHash,
    name: data.name,
  });

  await subscriptionRepo.create({
    account_id: account.id,
    plan_id: freePlan.id,
    status: 'trial',
  });

  return account;
}

export async function login(email, password, res) {
  const account = await accountRepo.findByEmail(email);
  if (!account) {
    throw new AppError('Неверный email или пароль', 401);
  }

  const valid = await argon2.verify(account.password_hash, password);
  if (!valid) {
    throw new AppError('Неверный email или пароль', 401);
  }

  const { user } = await resolveActiveContext(account.id);
  const payload = {
    accountId: account.id,
    userId: user?.id,
    nurseryId: user?.nursery_id,
    role: user?.role,
  };

  const accessToken = signAccess(payload);
  const refreshToken = signRefresh({ accountId: account.id });
  setTokenCookies(res, accessToken, refreshToken);

  if (user?.nursery_id) {
    await logActivity({
      nurseryId: user.nursery_id,
      userId: user.id,
      eventType: EVENT_TYPES.AUTH_LOGIN,
      entityType: ENTITY_TYPES.USER,
      entityId: user.id,
      details: { accountId: account.id },
    });
  }

  return {
    mustChangePassword: user?.must_change_password ?? false,
    user: mapAuthUser(user, account),
  };
}

export function logout(res) {
  res.clearCookie(COOKIE_ACCESS, COOKIE_OPTIONS);
  res.clearCookie(COOKIE_REFRESH, COOKIE_OPTIONS);
}

export async function refresh(req, res) {
  const token = req.cookies[COOKIE_REFRESH];
  if (!token) {
    throw new AppError('Нет refresh-токена', 401);
  }

  const decoded = verifyRefresh(token);
  const account = await accountRepo.findById(decoded.accountId);
  if (!account) {
    throw new AppError('Аккаунт не найден', 401);
  }

  const { user } = await resolveActiveContext(account.id);
  const payload = {
    accountId: account.id,
    userId: user?.id,
    nurseryId: user?.nursery_id,
    role: user?.role,
  };

  const accessToken = signAccess(payload);
  const refreshToken = signRefresh({ accountId: account.id });
  setTokenCookies(res, accessToken, refreshToken);

  return {
    mustChangePassword: user?.must_change_password ?? false,
    user: mapAuthUser(user, account),
  };
}

export async function changePassword(accountId, currentPassword, newPassword) {
  const account = await accountRepo.findById(accountId);
  if (!account) {
    throw new AppError('Аккаунт не найден', 404);
  }

  const valid = await argon2.verify(account.password_hash, currentPassword);
  if (!valid) {
    throw new AppError('Неверный текущий пароль', 400);
  }

  const newHash = await argon2.hash(newPassword);
  await accountRepo.updateById(accountId, { password_hash: newHash });
  await userRepo.clearMustChangePassword(accountId);
}

async function resolveActiveContext(accountId) {
  const account = await accountRepo.findById(accountId);
  let nursery = null;
  if (account?.last_active_nursery_id) {
    nursery = await nurseryRepo.findByIdAndAccount(account.last_active_nursery_id, accountId);
  }
  if (!nursery) {
    nursery = await nurseryRepo.findFirstByAccountId(accountId);
  }
  const user = nursery
    ? await userRepo.findOwnerByAccountAndNursery(accountId, nursery.id)
    : null;
  return { account, nursery, user };
}

export async function activateNursery(accountId, nurseryId, res) {
  const nursery = await nurseryRepo.findByIdAndAccount(nurseryId, accountId);
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }

  const user = await userRepo.findOwnerByAccountAndNursery(accountId, nurseryId);
  const account = await accountRepo.findById(accountId);

  const accessToken = signAccess({
    accountId,
    userId: user?.id,
    nurseryId: nursery.id,
    role: user?.role,
  });
  const refreshToken = signRefresh({ accountId });
  setTokenCookies(res, accessToken, refreshToken);

  await accountRepo.updateById(accountId, { last_active_nursery_id: nursery.id });

  return { user: mapAuthUser(user, account), nursery };
}

function setTokenCookies(res, accessToken, refreshToken) {
  res.cookie(COOKIE_ACCESS, accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_TTL_MS,
  });
  res.cookie(COOKIE_REFRESH, refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TTL_MS,
  });
}

function mapAuthUser(user, account) {
  return {
    id: user?.id ?? null,
    nursery_id: user?.nursery_id ?? null,
    role: user?.role ?? '',
    name: user?.name || account?.name || account?.email || 'Пользователь',
    email: account?.email || user?.email || '',
    must_change_password: Boolean(user?.must_change_password),
  };
}
