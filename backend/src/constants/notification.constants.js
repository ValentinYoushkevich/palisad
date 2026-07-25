// Типы in-app уведомлений. Набор растёт по мере появления фич-продюсеров
// (задачи/дедлайны, конфликты синхронизации, истечение подписки и т.д.).
// В БД тип зажат CHECK'ом chk_notifications_type (миграция 20260724172000, D7):
// новый тип требует и правки здесь, и миграции, расширяющей CHECK.
export const NOTIFICATION_TYPES = {
  ROLE_CHANGED: 'user.role_changed',
  SYNC_CONFLICT: 'sync.conflict',
  SUBSCRIPTION_EXPIRING: 'subscription.expiring',
  TASK_DUE: 'task.due',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
};
