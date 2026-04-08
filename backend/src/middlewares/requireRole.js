import { AppError } from '@/utils/AppError.js';

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Не авторизован', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Недостаточно прав', 403));
    }

    return next();
  };
}
