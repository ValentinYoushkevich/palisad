import * as notificationService from '@/services/notification.service.js';

export async function getNotifications(req, res, next) {
  try {
    const result = await notificationService.getNotifications(
      req.params.nurseryId,
      req.user.userId,
      req.query
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    await notificationService.markRead(req.params.nurseryId, req.user.userId, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req, res, next) {
  try {
    await notificationService.markAllRead(req.params.nurseryId, req.user.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
