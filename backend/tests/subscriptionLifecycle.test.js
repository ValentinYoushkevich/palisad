import { describe, expect, it } from 'vitest';

import { createOwnerWithNursery, db } from './helpers.js';
import { NOTIFICATION_TYPES } from '@/constants/notification.constants.js';
import * as subscriptionService from '@/services/subscription.service.js';

describe('B13 — лайфцикл подписки', () => {
  it('trial при регистрации получает expires_at ≈ +14 дней', async () => {
    const ctx = await createOwnerWithNursery();
    const trial = await db('subscriptions')
      .where({ account_id: ctx.account.id, status: 'trial' })
      .first();
    expect(trial.expires_at).toBeTruthy();
    const days = (new Date(trial.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
  });

  it('expireOverdue: помечает просроченную expired и создаёт активную free', async () => {
    const ctx = await createOwnerWithNursery();
    const trial = await db('subscriptions').where({ account_id: ctx.account.id }).first();
    // Искусственно просрочим срок на сутки назад.
    await db('subscriptions')
      .where({ id: trial.id })
      .update({ expires_at: db.raw("now() - interval '1 day'") });

    const res = await subscriptionService.expireOverdue();
    expect(res.expired).toBe(1);
    expect(res.downgraded).toBe(1);

    const expired = await db('subscriptions').where({ id: trial.id }).first();
    expect(expired.status).toBe('expired');

    // Downgrade: свежая активная free-подписка с expires_at NULL (бессрочная).
    const freePlan = await db('plans').where({ slug: 'free' }).first();
    const active = await db('subscriptions')
      .where({ account_id: ctx.account.id, status: 'active' })
      .first();
    expect(active).toBeTruthy();
    expect(active.plan_id).toBe(freePlan.id);
    expect(active.expires_at).toBeNull();

    // getActiveWithPlan (через getCurrent) продолжает отдавать активную free-подписку.
    const current = await subscriptionService.getCurrent(ctx.account.id);
    expect(current.status).toBe('active');
    expect(current.slug).toBe('free');
  });

  it('expireOverdue: не трогает не просроченные подписки', async () => {
    const ctx = await createOwnerWithNursery();
    const trial = await db('subscriptions').where({ account_id: ctx.account.id }).first();
    // Дефолтный trial истекает через ~14 дней — не просрочен.
    const res = await subscriptionService.expireOverdue();
    expect(res.expired).toBe(0);

    const still = await db('subscriptions').where({ id: trial.id }).first();
    expect(still.status).toBe('trial');
    const rows = await db('subscriptions').where({ account_id: ctx.account.id });
    expect(rows.length).toBe(1); // новых подписок не создано
  });

  it('notifyExpiring: уведомляет в окне 3 дней, ставит флаг и идемпотентен', async () => {
    const ctx = await createOwnerWithNursery();
    const trial = await db('subscriptions').where({ account_id: ctx.account.id }).first();
    // Подвинем срок в окно уведомления (через 2 дня).
    await db('subscriptions')
      .where({ id: trial.id })
      .update({ expires_at: db.raw("now() + interval '2 days'") });

    const res1 = await subscriptionService.notifyExpiring();
    expect(res1.notified).toBe(1);

    const filter = {
      nursery_id: ctx.nursery.id,
      user_id: ctx.owner.id,
      type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
    };
    const notifs = await db('notifications').where(filter);
    expect(notifs.length).toBe(1);
    expect(notifs[0].payload.subscriptionId).toBe(trial.id);

    const flagged = await db('subscriptions').where({ id: trial.id }).first();
    expect(flagged.expiring_notified_at).not.toBeNull();

    // Идемпотентность: повторный вызов не шлёт дубль (флаг уже проставлен).
    const res2 = await subscriptionService.notifyExpiring();
    expect(res2.notified).toBe(0);
    const after = await db('notifications').where(filter);
    expect(after.length).toBe(1);
  });

  it('notifyExpiring: подписку вне окна 3 дней не трогает', async () => {
    const ctx = await createOwnerWithNursery();
    // Дефолтный trial истекает через ~14 дней — вне окна уведомления.
    const res = await subscriptionService.notifyExpiring();
    expect(res.notified).toBe(0);

    const trial = await db('subscriptions').where({ account_id: ctx.account.id }).first();
    expect(trial.expiring_notified_at).toBeNull();
  });
});
