import cron from 'node-cron';

import logger from '@/config/logger.js';
import * as activityRepo from '@/repositories/activityLog.repository.js';

// Возвращает ScheduledTask — server.js останавливает его при graceful shutdown (B20).
export function startCleanupCron() {
  return cron.schedule('0 3 * * *', async () => {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const deleted = await activityRepo.deleteOlderThan(twoYearsAgo);
      logger.info(`Activity logs cleanup: removed ${deleted} records`);
    } catch (err) {
      logger.error('Activity logs cleanup failed', { error: err.message });
    }
  });
}
