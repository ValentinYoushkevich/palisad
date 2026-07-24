import db from '@/config/knex.js';
import logger from '@/config/logger.js';
import { startCleanupCron } from '@/utils/cleanupCron.js';
import { startSubscriptionCron } from '@/utils/subscriptionCron.js';
import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 3100;
// B20: сколько ждём завершения in-flight запросов; после — принудительный выход,
// чтобы зависшие соединения не держали контейнер до SIGKILL оркестратора.
const SHUTDOWN_TIMEOUT_MS = 10_000;

// B20: graceful shutdown — перестаём принимать новые соединения, останавливаем
// cron'ы и закрываем пул Knex. Обработчики нужны, чтобы SIGTERM от Docker/K8s
// завершал процесс штатно, а не убивал его по таймауту. В чистом пути выходим
// естественным дренажем event loop (process.exitCode), принудительно — только
// по таймауту, когда зависшие соединения не дают закрыться.
function installShutdownHooks(server, crons) {
  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);
    setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      // eslint-disable-next-line no-process-exit -- зависшие соединения не дадут выйти штатно
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    for (const task of crons) {
      task?.stop?.();
    }
    server.close(async () => {
      try {
        await db.destroy();
        logger.info('Shutdown complete');
        process.exitCode = 0;
      } catch (err) {
        logger.error('Error during shutdown', { error: err.message });
        process.exitCode = 1;
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function start() {
  try {
    await db.raw('SELECT 1');
    logger.info('PostgreSQL connected');
  } catch (err) {
    logger.error('Failed to connect to DB', { error: err.message });
    await db.destroy().catch(() => {});
    process.exitCode = 1;
    return;
  }

  const crons = [];
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    crons.push(startCleanupCron(), startSubscriptionCron());
    logger.info('Cron jobs started');
  });

  installShutdownHooks(server, crons);
}

start();
