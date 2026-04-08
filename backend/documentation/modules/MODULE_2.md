# MODULE_2 — Backend: Аутентификация аккаунта

**Зависит от:** MODULE_1

---

## Шаг 1. Константы

`src/constants/auth.constants.js`:

```js
export const COOKIE_ACCESS = 'access_token';
export const COOKIE_REFRESH = 'refresh_token';
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
```

---

## Шаг 2. Утилиты JWT

`src/utils/jwt.js`:

```js
import jwt from 'jsonwebtoken';

export function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
}

export function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

export function verifyAccess(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function verifyRefresh(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}
```

---

## Шаг 3. Схемы валидации Zod

`src/utils/validators/auth.validators.js`:

```js
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Минимум 8 символов')
  .regex(/[A-Z]/, 'Нужна заглавная буква')
  .regex(/[a-z]/, 'Нужна строчная буква')
  .regex(/[0-9]/, 'Нужна цифра')
  .regex(/[^A-Za-z0-9]/, 'Нужен спецсимвол');

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(2).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
```

---

## Шаг 4. Middleware валидации

`src/middlewares/validate.js`:

```js
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.flatten().fieldErrors });
    }
    req.body = result.data;
    next();
  };
}
```

---

## Шаг 5. Middleware requireAuth

`src/middlewares/requireAuth.js`:

```js
import { verifyAccess } from '@/utils/jwt.js';
import { COOKIE_ACCESS } from '@/constants/auth.constants.js';
import { AppError } from '@/utils/AppError.js';

export function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_ACCESS];
  if (!token) return next(new AppError('Не авторизован', 401));

  try {
    req.user = verifyAccess(token);
    next();
  } catch {
    next(new AppError('Токен недействителен', 401));
  }
}
```

---

## Шаг 6. Repository

`src/repositories/account.repository.js`:

```js
import db from '@/config/knex.js';

export function findByEmail(email) {
  return db('accounts').where({ email }).first();
}

export function findById(id) {
  return db('accounts').where({ id }).first();
}

export function create(data) {
  return db('accounts').insert(data).returning('*').then(rows => rows[0]);
}

export function updateById(id, data) {
  return db('accounts')
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning('*')
    .then(rows => rows[0]);
}
```

---

## Шаг 7. Service

`src/services/auth.service.js`:

```js
import argon2 from 'argon2';
import * as accountRepo from '@/repositories/account.repository.js';
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import * as userRepo from '@/repositories/user.repository.js';
import { signAccess, signRefresh, verifyRefresh } from '@/utils/jwt.js';
import { AppError } from '@/utils/AppError.js';
import {
  COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_OPTIONS,
  ACCESS_TTL_MS, REFRESH_TTL_MS,
} from '@/constants/auth.constants.js';

export async function register(data) {
  const existing = await accountRepo.findByEmail(data.email);
  if (existing) throw new AppError('Email уже используется', 409);

  const freePlan = await subscriptionRepo.getFreePlan();
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
  if (!account) throw new AppError('Неверный email или пароль', 401);

  const valid = await argon2.verify(account.password_hash, password);
  if (!valid) throw new AppError('Неверный email или пароль', 401);

  const user = await userRepo.findOwnerByAccountId(account.id);

  const payload = {
    accountId: account.id,
    userId: user?.id,
    nurseryId: user?.nursery_id,
    role: user?.role,
  };

  const accessToken = signAccess(payload);
  const refreshToken = signRefresh({ accountId: account.id });

  setTokenCookies(res, accessToken, refreshToken);

  return { mustChangePassword: user?.must_change_password ?? false };
}

export function logout(res) {
  res.clearCookie(COOKIE_ACCESS);
  res.clearCookie(COOKIE_REFRESH);
}

export async function refresh(req, res) {
  const token = req.cookies[COOKIE_REFRESH];
  if (!token) throw new AppError('Нет refresh-токена', 401);

  const decoded = verifyRefresh(token);
  const account = await accountRepo.findById(decoded.accountId);
  if (!account) throw new AppError('Аккаунт не найден', 401);

  const user = await userRepo.findOwnerByAccountId(account.id);

  const payload = {
    accountId: account.id,
    userId: user?.id,
    nurseryId: user?.nursery_id,
    role: user?.role,
  };

  const accessToken = signAccess(payload);
  const refreshToken = signRefresh({ accountId: account.id });

  setTokenCookies(res, accessToken, refreshToken);
}

export async function changePassword(accountId, currentPassword, newPassword) {
  const account = await accountRepo.findById(accountId);
  const valid = await argon2.verify(account.password_hash, currentPassword);
  if (!valid) throw new AppError('Неверный текущий пароль', 400);

  const newHash = await argon2.hash(newPassword);
  await accountRepo.updateById(accountId, { password_hash: newHash });

  // Сбросить флаг must_change_password у owner-пользователя
  await userRepo.clearMustChangePassword(accountId);
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
```

---

## Шаг 8. Controller

`src/controllers/auth.controller.js`:

```js
import * as authService from '@/services/auth.service.js';

export async function register(req, res, next) {
  try {
    await authService.register(req.body);
    res.status(201).json({ message: 'Аккаунт создан' });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const result = await authService.login(req.body.email, req.body.password, res);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  authService.logout(res);
  res.json({ message: 'Выход выполнен' });
}

export async function refresh(req, res, next) {
  try {
    await authService.refresh(req, res);
    res.json({ message: 'Токен обновлён' });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req, res, next) {
  try {
    await authService.changePassword(
      req.user.accountId,
      req.body.currentPassword,
      req.body.newPassword
    );
    res.json({ message: 'Пароль изменён' });
  } catch (err) {
    next(err);
  }
}
```

---

## Шаг 9. Router

`src/routes/auth.router.js`:

```js
import { Router } from 'express';
import { validate } from '@/middlewares/validate.js';
import { requireAuth } from '@/middlewares/requireAuth.js';
import * as authController from '@/controllers/auth.controller.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
} from '@/utils/validators/auth.validators.js';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);
router.post('/change-password', requireAuth, validate(changePasswordSchema), authController.changePassword);

export default router;
```

Подключить в `app.js`:

```js
import authRouter from '@/routes/auth.router.js';
app.use('/api/auth', authRouter);
```

---

## Шаг 10. Subscription repository (заготовка)

`src/repositories/subscription.repository.js`:

```js
import db from '@/config/knex.js';

export function getFreePlan() {
  return db('plans').where({ slug: 'free', is_active: true }).first();
}

export function create(data) {
  return db('subscriptions').insert(data).returning('*').then(rows => rows[0]);
}

export function getActive(accountId) {
  return db('subscriptions')
    .where({ account_id: accountId })
    .whereIn('status', ['trial', 'active'])
    .orderBy('created_at', 'desc')
    .first();
}
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | Регистрация создаёт аккаунт и trial-подписку | `POST /api/auth/register` → 201; проверить в БД обе записи |
| 2 | Повторная регистрация с тем же email → 409 | `POST /api/auth/register` дважды с одним email |
| 3 | Логин устанавливает HttpOnly куки | `POST /api/auth/login` → куки `access_token` и `refresh_token` в Set-Cookie |
| 4 | Неверный пароль → 401 | `POST /api/auth/login` с неверным паролем |
| 5 | Refresh обновляет access-токен | `POST /api/auth/refresh` с валидным refresh-куки → новый access |
| 6 | Logout очищает куки | `POST /api/auth/logout` → куки удалены |
| 7 | Смена пароля работает | `POST /api/auth/change-password` с requireAuth → 200 |
| 8 | Слабый пароль при регистрации → 400 | Передать `password: "123"` → ошибки валидации Zod |
| 9 | Защищённый роут без токена → 401 | `POST /api/auth/change-password` без куки → 401 |
