import logger from '@/config/logger.js';
import * as notificationRepo from '@/repositories/notification.repository.js';

// Единый хелпер для отправки in-app уведомления конкретному пользователю.
// По аналогии с logActivity — никогда не бросает: ошибку только логирует,
// чтобы сбой уведомления не ронял основную бизнес-операцию.
export async function notify({ nurseryId, userId, type, payload }) {
  try {
    return await notificationRepo.create({ nurseryId, userId, type, payload });
  } catch (err) {
    logger.error('notify failed', { error: err.message, type });
    return null;
  }
}
