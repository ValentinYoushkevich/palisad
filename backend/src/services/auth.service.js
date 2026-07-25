import argon2 from 'argon2';

import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import {
  ACCESS_TTL_MS,
  COOKIE_ACCESS,
  COOKIE_OPTIONS,
  COOKIE_REFRESH,
  REFRESH_COOKIE_OPTIONS,
  REFRESH_TTL_MS,
} from '@/constants/auth.constants.js';
import { ROLES } from '@/constants/roles.constants.js';
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

  // Аккаунт и его стартовая подписка создаются атомарно: без транзакции сбой второго
  // insert оставлял аккаунт без подписки, и любой planGuard кидал бы 403 (см. B9).
  return db.transaction(async (trx) => {
    const account = await accountRepo.create(
      { email: data.email, password_hash: passwordHash, name: data.name },
      trx
    );
    await subscriptionRepo.create(
      { account_id: account.id, plan_id: freePlan.id, status: 'trial' },
      trx
    );
    return account;
  });
}

export async function login(email, password, res) {
  const account = await accountRepo.findByEmail(email);
  if (account) {
    // Владелец: аутентификация по accounts.password_hash (флоу без изменений).
    const valid = await argon2.verify(account.password_hash, password);
    if (!valid) {
      throw new AppError('Неверный email или пароль', 401);
    }
    return issueOwnerSession(account, res, { logLogin: true });
  }

  // B11: email не принадлежит ни одному аккаунту → пробуем staff-логин по users.
  // Так POST /api/auth/login обслуживает и владельцев, и сотрудников без изменения
  // фронт-контракта. findActiveByEmail отфильтровывает is_active=false, поэтому
  // неактивный сотрудник и вовсе не найдётся — ответ будет тем же 401, что и при
  // отсутствии email, чтобы не палить существование учётки.
  const staff = await userRepo.findActiveByEmail(email);
  if (!staff) {
    throw new AppError('Неверный email или пароль', 401);
  }
  const valid = await argon2.verify(staff.password_hash, password);
  if (!valid) {
    throw new AppError('Неверный email или пароль', 401);
  }
  return issueStaffSession(staff, res, { logLogin: true });
}

export function logout(res) {
  res.clearCookie(COOKIE_ACCESS, COOKIE_OPTIONS);
  // B30: чистим refresh тем же path, которым он выставлен, иначе браузер его не удалит.
  res.clearCookie(COOKIE_REFRESH, REFRESH_COOKIE_OPTIONS);
}

export async function refresh(req, res) {
  const token = req.cookies[COOKIE_REFRESH];
  if (!token) {
    throw new AppError('Нет refresh-токена', 401);
  }

  const decoded = verifyRefresh(token);

  // B11: refresh-токен сотрудника несёт userId → восстанавливаем staff-контекст по
  // АКТУАЛЬНОЙ строке users (свежие role/nursery/must_change_password). Фильтр
  // is_active внутри findActiveById означает, что деактивированный владельцем
  // сотрудник не продлит сессию — на этом refresh его выкинет.
  if (decoded.userId) {
    const staff = await userRepo.findActiveById(decoded.userId);
    if (!staff) {
      throw new AppError('Аккаунт не найден', 401);
    }
    return issueStaffSession(staff, res);
  }

  const account = await accountRepo.findById(decoded.accountId);
  if (!account) {
    throw new AppError('Аккаунт не найден', 401);
  }

  return issueOwnerSession(account, res);
}

// B11: меняем пароль ТОГО принципала, кто залогинен (принимаем весь req.user).
// Владелец (role='owner') логинится по accounts.password_hash → правим accounts.
// Сотрудник — по users.password_hash → правим его строку в users. Роль owner
// недостижима для staff (createUserSchema/changeRoleSchema разрешают только
// agronomist/worker/observer), поэтому role — надёжный дискриминатор сессии; если
// role пуст (аккаунт без питомника) — это тоже owner-сессия.
export function changePassword(principal, currentPassword, newPassword) {
  if (principal.userId && principal.role && principal.role !== ROLES.OWNER) {
    return changeStaffPassword(principal.userId, currentPassword, newPassword);
  }
  return changeOwnerPassword(principal.accountId, currentPassword, newPassword);
}

async function changeOwnerPassword(accountId, currentPassword, newPassword) {
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

async function changeStaffPassword(userId, currentPassword, newPassword) {
  // findById(users) отдаёт все колонки, включая password_hash — он нужен здесь для
  // верификации текущего пароля и за пределы функции не уходит.
  const staff = await userRepo.findById(userId);
  if (!staff?.is_active) {
    throw new AppError('Сотрудник не найден', 404);
  }

  const valid = await argon2.verify(staff.password_hash, currentPassword);
  if (!valid) {
    throw new AppError('Неверный текущий пароль', 400);
  }

  const newHash = await argon2.hash(newPassword);
  await userRepo.updatePassword(userId, newHash);
  await userRepo.clearMustChangePasswordById(userId);
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

// Владельческая сессия: активный контекст подбирается resolveActiveContext (owner-
// строка активного питомника). logLogin=true только при явном логине — refresh
// (logLogin по умолчанию false) как и раньше событий auth.login не пишет.
async function issueOwnerSession(account, res, { logLogin = false } = {}) {
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

  if (logLogin && user?.nursery_id) {
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

// B11: staff-сессия. Активный питомник = users.nursery_id, роль — реальная
// (agronomist/worker/observer), поэтому с этого момента RBAC (requireRole/
// requireNurseryAccess) работает по-настоящему. accountId владельца питомника кладём
// в JWT для planGuards/фич. Refresh-токен несёт userId — по нему refresh поднимает
// именно staff-контекст (иначе resolveActiveContext вернул бы owner). mapAuthUser с
// account=null отдаёт email/имя самого сотрудника, а не владельца аккаунта.
async function issueStaffSession(staff, res, { logLogin = false } = {}) {
  const payload = {
    accountId: staff.account_id,
    userId: staff.id,
    nurseryId: staff.nursery_id,
    role: staff.role,
  };

  const accessToken = signAccess(payload);
  const refreshToken = signRefresh({ accountId: staff.account_id, userId: staff.id });
  setTokenCookies(res, accessToken, refreshToken);

  if (logLogin) {
    await logActivity({
      nurseryId: staff.nursery_id,
      userId: staff.id,
      eventType: EVENT_TYPES.AUTH_LOGIN,
      entityType: ENTITY_TYPES.USER,
      entityId: staff.id,
      details: { accountId: staff.account_id },
    });
  }

  return {
    mustChangePassword: staff.must_change_password ?? false,
    user: mapAuthUser(staff, null),
  };
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
    ...REFRESH_COOKIE_OPTIONS,
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
    // Э3: флаг платформенного админа едет на фронт (показ /admin на Э6). Привилегия
    // проверяется на бэке из БД (requirePlatformAdmin), здесь — только UI-подсказка.
    // account может быть null (staff-сессия) → Boolean(undefined) = false.
    is_platform_admin: Boolean(account?.is_platform_admin),
  };
}
