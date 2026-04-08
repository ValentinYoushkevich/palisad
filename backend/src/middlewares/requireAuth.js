import { COOKIE_ACCESS } from '@/constants/auth.constants.js';
import { AppError } from '@/utils/AppError.js';
import { verifyAccess } from '@/utils/jwt.js';

export function requireAuth(req, _res, next) {
  const token = req.cookies[COOKIE_ACCESS];
  if (!token) {
    return next(new AppError('Не авторизован', 401));
  }

  try {
    req.user = verifyAccess(token);
    return next();
  } catch {
    return next(new AppError('Токен недействителен', 401));
  }
}
