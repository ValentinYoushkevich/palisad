import db from '@/config/knex.js';
import logger from '@/config/logger.js';
import { startCleanupCron } from '@/utils/cleanupCron.js';
import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 3100;

async function start() {
  try {
    await db.raw('SELECT 1');
    logger.info('PostgreSQL connected');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      startCleanupCron();
      logger.info('Cleanup cron started');
    });
  } catch (err) {
    logger.error('Failed to connect to DB', { error: err.message });
    process.exitCode = 1;
  }
}

start();
