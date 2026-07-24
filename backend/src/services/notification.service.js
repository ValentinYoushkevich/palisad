import * as notificationRepo from '@/repositories/notification.repository.js';
import { AppError } from '@/utils/AppError.js';
import { parsePagination } from '@/utils/validators/pagination.validators.js';

export async function getNotifications(nurseryId, userId, query) {
  const { unread } = query;
  const filters = { unread: unread === 'true' || unread === true };
  // Валидируем/зажимаем пагинацию: perPage ограничен 100, кривые значения → дефолты (B21).
  const pagination = parsePagination(query);

  const [data, total, unreadCount] = await Promise.all([
    notificationRepo.findByUser(nurseryId, userId, filters, pagination),
    notificationRepo.countByUser(nurseryId, userId, filters),
    notificationRepo.countUnread(nurseryId, userId),
  ]);

  return { data, total, unreadCount, page: pagination.page, perPage: pagination.perPage };
}

export async function markRead(nurseryId, userId, id) {
  const updated = await notificationRepo.markRead(nurseryId, userId, id);
  if (!updated) {
    throw new AppError('Уведомление не найдено', 404);
  }
}

export async function markAllRead(nurseryId, userId) {
  await notificationRepo.markAllRead(nurseryId, userId);
}
