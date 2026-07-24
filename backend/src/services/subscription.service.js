import db from '@/config/knex.js';
import { NOTIFICATION_TYPES } from '@/constants/notification.constants.js';
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';
import { notify } from '@/utils/notify.js';

export async function getCurrent(accountId) {
  const sub = await subscriptionRepo.getActiveWithPlan(accountId);
  if (!sub) {
    throw new AppError('Активная подписка не найдена', 404);
  }

  return sub;
}

export function getPlans() {
  return subscriptionRepo.getAllPlans();
}

// B12: смена тарифа отключена. Self-service апгрейд без оплаты недопустим, а биллинга
// в проекте нет — поэтому эндпоинт POST /subscriptions/change остаётся смонтированным
// (не ломаем API-контракт), но всегда отвечает 403. Прежняя реализация мгновенно
// делала cancelActive + create({status:'active'}) в транзакции (B9) — это и был апгрейд
// без оплаты.
// TODO(billing): вернуть смену плана, когда появится платёжный провайдер — после
// подтверждения оплаты выполнять cancelActive + create в одной транзакции (см. B9).
export function changePlan() {
  throw new AppError('Смена тарифа недоступна: биллинг не подключён', 403);
}

// B13: истечение подписки с downgrade на free. Находим просроченные trial/active
// (expires_at < now()), помечаем их expired и заводим для аккаунта свежую активную
// free-подписку (expires_at NULL — free бессрочен). Downgrade реализован именно так,
// чтобы getActiveWithPlan продолжал возвращать активную подписку (уже free), а не
// отдавал 404 и не провоцировал 403 в planGuards: после истечения лимиты аккаунта
// становятся free. Каждый аккаунт обрабатываем атомарно (транзакция) и идемпотентно —
// новая free-строка с expires_at NULL под findOverdue уже не попадает.
export async function expireOverdue() {
  const overdue = await subscriptionRepo.findOverdue();
  if (overdue.length === 0) {
    return { expired: 0, downgraded: 0 };
  }

  const freePlan = await subscriptionRepo.getFreePlan();

  // Группируем по аккаунту: у аккаунта может быть несколько «активных» строк.
  const idsByAccount = new Map();
  for (const sub of overdue) {
    const ids = idsByAccount.get(sub.account_id) ?? [];
    ids.push(sub.id);
    idsByAccount.set(sub.account_id, ids);
  }

  let expired = 0;
  for (const [accountId, ids] of idsByAccount) {
    // Атомарно на аккаунт: помечаем просроченные expired и создаём активную free.
    await db.transaction(async (trx) => {
      await subscriptionRepo.markExpired(ids, trx);
      await subscriptionRepo.create(
        { account_id: accountId, plan_id: freePlan.id, status: 'active' },
        trx
      );
    });
    expired += ids.length;
  }

  return { expired, downgraded: idsByAccount.size };
}

// B13: уведомление SUBSCRIPTION_EXPIRING за 3 дня до истечения. Берём trial/active,
// у которых expires_at в окне (now(); now()+3 дня] и по которым ещё НЕ уведомляли
// (expiring_notified_at IS NULL). Дедуп: после отправки проставляем expiring_notified_at,
// чтобы ежедневный cron не слал дубли. Адресаты — owner каждого питомника аккаунта
// (notifications.nursery_id/user_id NOT NULL, поэтому шлём по owner на nursery).
export async function notifyExpiring() {
  const expiring = await subscriptionRepo.findExpiringSoon();

  let notified = 0;
  for (const sub of expiring) {
    const owners = await subscriptionRepo.findAccountOwners(sub.account_id);
    for (const owner of owners) {
      await notify({
        nurseryId: owner.nursery_id,
        userId: owner.id,
        type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
        payload: { subscriptionId: sub.id, expiresAt: sub.expires_at },
      });
    }
    // Флаг ставим даже если owner'ов не нашлось или notify не удался: notify —
    // best-effort (как logActivity), а флаг гарантирует отсутствие ежедневных дублей.
    await subscriptionRepo.markExpiringNotified(sub.id);
    notified += 1;
  }

  return { notified };
}
