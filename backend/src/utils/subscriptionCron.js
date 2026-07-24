import cron from 'node-cron';

import logger from '@/config/logger.js';
import * as subscriptionService from '@/services/subscription.service.js';

// B13: тонкая cron-обёртка над лайфцикл-логикой подписок. Вся бизнес-логика —
// в subscription.service (expireOverdue/notifyExpiring) и покрыта тестами; здесь
// только расписание, поэтому файл исключён из coverage (vitest.config.js).
// Ежедневно в 03:10 (после cleanup-крона в 03:00): сначала downgrade просроченных
// на free, затем рассылка предупреждений об истечении.
export function startSubscriptionCron() {
  cron.schedule('10 3 * * *', async () => {
    try {
      const { expired, downgraded } = await subscriptionService.expireOverdue();
      const { notified } = await subscriptionService.notifyExpiring();
      logger.info(
        `Subscription lifecycle: expired ${expired}, downgraded ${downgraded}, notified ${notified}`
      );
    } catch (err) {
      logger.error('Subscription lifecycle cron failed', { error: err.message });
    }
  });
}
