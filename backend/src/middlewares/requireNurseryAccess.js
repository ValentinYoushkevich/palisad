import { AppError } from '@/utils/AppError.js';

export function requireNurseryAccess(req, _res, next) {
  const { nurseryId } = req.params;

  if (!nurseryId) {
    return next(new AppError('nurseryId не указан', 400));
  }
  if (req.user.nurseryId !== nurseryId) {
    return next(new AppError('Нет доступа к этому питомнику', 403));
  }

  return next();
}
