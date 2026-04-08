import * as authService from '@/services/auth.service.js';

export async function register(req, res, next) {
  try {
    await authService.register(req.body);
    return res.status(201).json({ message: 'Аккаунт создан' });
  } catch (err) {
    return next(err);
  }
}

export async function login(req, res, next) {
  try {
    const result = await authService.login(req.body.email, req.body.password, res);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export function logout(_req, res) {
  authService.logout(res);
  return res.json({ message: 'Выход выполнен' });
}

export async function refresh(req, res, next) {
  try {
    await authService.refresh(req, res);
    return res.json({ message: 'Токен обновлён' });
  } catch (err) {
    return next(err);
  }
}

export async function changePassword(req, res, next) {
  try {
    await authService.changePassword(
      req.user.accountId,
      req.body.currentPassword,
      req.body.newPassword
    );
    return res.json({ message: 'Пароль изменён' });
  } catch (err) {
    return next(err);
  }
}
