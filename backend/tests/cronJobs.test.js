import { beforeEach, describe, expect, it, vi } from 'vitest';

import logger from '@/config/logger.js';
import * as activityRepo from '@/repositories/activityLog.repository.js';
import * as subscriptionService from '@/services/subscription.service.js';
import { startCleanupCron } from '@/utils/cleanupCron.js';
import { startSubscriptionCron } from '@/utils/subscriptionCron.js';
import cron from 'node-cron';

// T12 — cron-обвязка (cleanupCron / subscriptionCron) ранее была исключена из coverage.
// Здесь мы РЕАЛЬНО прогоняем её строки: node-cron мокаем, чтобы перехватить
// зарегистрированную задачу, а сервисную/репозиторную логику (уже покрытую своими
// тестами) подменяем, чтобы не дёргать БД. Тест проверяет: (1) регистрируется нужное
// расписание, (2) задача вызывает нужную сервисную функцию, (3) ошибка внутри задачи
// логируется и НЕ роняет процесс. После этого модули убраны из exclude в vitest.config.js.

// node-cron: schedule(expr, task) не запускаем по-настоящему — сохраняем task и дёргаем вручную.
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
// Логгер — чтобы тихо и чтобы проверить ветку ошибки.
vi.mock('@/config/logger.js', () => ({ default: { info: vi.fn(), error: vi.fn() } }));
// Бизнес-логика замокана: cron-обвязка не должна тянуть БД.
vi.mock('@/repositories/activityLog.repository.js', () => ({ deleteOlderThan: vi.fn() }));
vi.mock('@/services/subscription.service.js', () => ({
  expireOverdue: vi.fn(),
  notifyExpiring: vi.fn(),
}));

// Достаёт колбэк, зарегистрированный последним вызовом cron.schedule.
function scheduledTask() {
  const calls = cron.schedule.mock.calls;
  return calls[calls.length - 1][1];
}

describe('T12 — cron-обвязка', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startCleanupCron (очистка ленты активности)', () => {
    it('регистрирует ежедневное расписание в 03:00', () => {
      startCleanupCron();
      expect(cron.schedule).toHaveBeenCalledTimes(1);
      expect(cron.schedule).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
    });

    it('задача вызывает deleteOlderThan с датой «2 года назад» и логирует число удалённых', async () => {
      activityRepo.deleteOlderThan.mockResolvedValueOnce(7);
      startCleanupCron();

      await scheduledTask()();

      expect(activityRepo.deleteOlderThan).toHaveBeenCalledTimes(1);
      const cutoff = activityRepo.deleteOlderThan.mock.calls[0][0];
      expect(cutoff).toBeInstanceOf(Date);
      // Порог — примерно два года назад (допускаем секунды на исполнение).
      const expectedYear = new Date().getFullYear() - 2;
      expect(cutoff.getFullYear()).toBe(expectedYear);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('7'));
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('ошибка репозитория логируется и не пробрасывается', async () => {
      activityRepo.deleteOlderThan.mockRejectedValueOnce(new Error('db down'));
      startCleanupCron();

      await expect(scheduledTask()()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Activity logs cleanup failed', { error: 'db down' });
    });
  });

  describe('startSubscriptionCron (лайфцикл подписок)', () => {
    it('регистрирует ежедневное расписание в 03:10', () => {
      startSubscriptionCron();
      expect(cron.schedule).toHaveBeenCalledTimes(1);
      expect(cron.schedule).toHaveBeenCalledWith('10 3 * * *', expect.any(Function));
    });

    it('задача вызывает expireOverdue и notifyExpiring и логирует сводку', async () => {
      subscriptionService.expireOverdue.mockResolvedValueOnce({ expired: 2, downgraded: 2 });
      subscriptionService.notifyExpiring.mockResolvedValueOnce({ notified: 3 });
      startSubscriptionCron();

      await scheduledTask()();

      expect(subscriptionService.expireOverdue).toHaveBeenCalledTimes(1);
      expect(subscriptionService.notifyExpiring).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('expired 2, downgraded 2, notified 3')
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('ошибка внутри задачи логируется и не пробрасывается', async () => {
      subscriptionService.expireOverdue.mockRejectedValueOnce(new Error('boom'));
      startSubscriptionCron();

      await expect(scheduledTask()()).resolves.toBeUndefined();
      expect(subscriptionService.notifyExpiring).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Subscription lifecycle cron failed', { error: 'boom' });
    });
  });
});
