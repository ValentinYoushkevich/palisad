import db from '@/config/knex.js';
import { ENTITY_TYPES, EVENT_TYPES } from '@/constants/activity.constants.js';
import { NOTIFICATION_TYPES } from '@/constants/notification.constants.js';
import * as licenseCodeRepo from '@/repositories/licenseCode.repository.js';
import * as subscriptionRepo from '@/repositories/subscription.repository.js';
import { AppError } from '@/utils/AppError.js';
import { normalizeLicenseCode } from '@/utils/generateLicenseCode.js';
import { logActivity } from '@/utils/logActivity.js';
import { notify } from '@/utils/notify.js';
import { lockAccount } from '@/utils/planGuards.js';

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

// Применяет уже активированный код к подпискам аккаунта (внутри транзакции, под
// advisory-lock). Стакание того же плана продлевает expires_at; иначе — гасим текущую
// активную и заводим новую active. partial-unique uq_subscriptions_active_account
// страхует от второй active; status='active' + явный expires_at → дефолт trial-14д не сработает.
async function applyActivatedCodeTx(trx, accountId, activated) {
  await lockAccount(trx, accountId);
  const current = await subscriptionRepo.getActiveWithPlan(accountId, trx);

  if (current && current.plan_id === activated.plan_id && current.expires_at !== null) {
    await subscriptionRepo.extendExpiry(current.id, activated.duration_days, trx);
    return;
  }

  await subscriptionRepo.cancelActive(accountId, trx);
  await subscriptionRepo.create(
    {
      account_id: accountId,
      plan_id: activated.plan_id,
      status: 'active',
      expires_at: trx.raw("now() + (? * interval '1 day')", [activated.duration_days]),
    },
    trx
  );
}

// Побочные эффекты активации вне критичного пути: уведомление владельцам аккаунта и
// аудит. notify и logActivity не бросают, поэтому сбой здесь не откатывает активацию.
async function emitActivationSideEffects({ accountId, userId, nurseryId, normalized, activated, result }) {
  const owners = await subscriptionRepo.findAccountOwners(accountId);
  for (const owner of owners) {
    await notify({
      nurseryId: owner.nursery_id,
      userId: owner.id,
      type: NOTIFICATION_TYPES.SUBSCRIPTION_ACTIVATED,
      payload: { subscriptionId: result.id, planId: activated.plan_id },
    });
  }

  await logActivity({
    nurseryId,
    userId,
    eventType: EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
    entityType: ENTITY_TYPES.SUBSCRIPTION,
    entityId: result.id,
    details: {
      code: normalized,
      planId: activated.plan_id,
      durationDays: activated.duration_days,
    },
  });
}

// Э2: активация лицензионного кода. Самый ответственный путь биллинга (безопасность,
// гонки). Вся мутация — в одной транзакции с транзакционным advisory-lock на аккаунт
// (lockAccount), поэтому параллельные активации сериализуются, а «прочитал active →
// вставил новую active» атомарно. Защита от двойной активации самого кода — атомарный
// UPDATE ... WHERE status='issued' в licenseCodeRepo.activateByCode (вернёт undefined на
// 0 строк). Единое сообщение об ошибке (нет кода / уже активирован / revoked / план
// неактивен) — чтобы не давать оракул о причине отказа.
export async function activateCode({ accountId, userId, nurseryId, code }) {
  const normalized = normalizeLicenseCode(code);

  const activated = await db.transaction(async (trx) => {
    // Атомарно переводим issued → activated: два параллельных запроса на один код —
    // ровно один получит строку, второй undefined → единый 404.
    const row = await licenseCodeRepo.activateByCode({ code: normalized, accountId }, trx);
    if (!row) {
      throw new AppError('Код недействителен или уже использован', 404);
    }

    // План кода должен существовать и быть активным. Тот же текст ошибки; throw откатывает
    // транзакцию, и код возвращается в issued (не «сгорает» зря).
    const plan = await trx('plans').where({ id: row.plan_id }).first();
    if (!plan || !plan.is_active) {
      throw new AppError('Код недействителен или уже использован', 404);
    }

    await applyActivatedCodeTx(trx, accountId, row);
    return row;
  });

  // Свежая активная подписка (форма как GET /subscriptions/current) — это и ответ.
  const result = await subscriptionRepo.getActiveWithPlan(accountId);
  await emitActivationSideEffects({ accountId, userId, nurseryId, normalized, activated, result });
  return result;
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
