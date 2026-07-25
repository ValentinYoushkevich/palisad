import * as accountRepo from '@/repositories/account.repository.js';
import { AppError } from '@/utils/AppError.js';

// Э3: гард платформенного администратора для /api/admin/*. Привилегия НАМЕРЕННО не
// живёт в JWT — флаг is_platform_admin читается из АКТУАЛЬНОЙ строки accounts на каждый
// запрос (по образцу B31-проверки is_active в requireAuth). Поэтому снятие флага
// владельцем действует немедленно, не дожидаясь истечения access-токена.
export async function requirePlatformAdmin(req, _res, next) {
  try {
    const account = await accountRepo.findById(req.user.accountId);
    if (!account || account.is_platform_admin !== true) {
      return next(new AppError('Недостаточно прав', 403));
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
