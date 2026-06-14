import * as notificationRepo from '@/repositories/notification.repository.js';
import { AppError } from '@/utils/AppError.js';

export async function getNotifications(nurseryId, userId, query) {
  const { page = 1, perPage = 20, unread } = query;
  const filters = { unread: unread === 'true' || unread === true };
  const pagination = { page: Number(page), perPage: Number(perPage) };

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
