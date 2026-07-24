import { COOKIE_ACCESS } from '@/constants/auth.constants.js';
import * as userRepo from '@/repositories/user.repository.js';
import { AppError } from '@/utils/AppError.js';
import { verifyAccess } from '@/utils/jwt.js';

export async function requireAuth(req, _res, next) {
  const token = req.cookies[COOKIE_ACCESS];
  if (!token) {
    return next(new AppError('Не авторизован', 401));
  }

  let payload;
  try {
    payload = verifyAccess(token);
  } catch {
    return next(new AppError('Токен недействителен', 401));
  }

  try {
    // B31: access-токен живёт 15 минут; чтобы деактивированный владельцем сотрудник
    // (toggleStatus) не работал по старому токену до истечения, сверяем АКТУАЛЬНУЮ строку
    // users. Отклоняем только найденного-неактивного — токены без userId или с
    // несуществующим субъектом (например, форжённые в тестах) не трогаем.
    if (payload.userId) {
      const user = await userRepo.findById(payload.userId);
      if (user?.is_active === false) {
        return next(new AppError('Учётная запись неактивна', 401));
      }
    }
    req.user = payload;
    return next();
  } catch (err) {
    return next(err);
  }
}
