// Типы in-app уведомлений. Набор растёт по мере появления фич-продюсеров
// (задачи/дедлайны, конфликты синхронизации, истечение подписки и т.д.).
// CHECK-констрейнта на тип намеренно нет — чтобы новые типы не требовали миграции.
export const NOTIFICATION_TYPES = {
  ROLE_CHANGED: 'user.role_changed',
  SYNC_CONFLICT: 'sync.conflict',
  SUBSCRIPTION_EXPIRING: 'subscription.expiring',
  TASK_DUE: 'task.due',
};
