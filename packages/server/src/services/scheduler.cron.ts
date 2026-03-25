import cron from 'node-cron';
import { processDuePosts } from './scheduler.service.js';
import { logger } from '../config/logger.js';

export function startSchedulerCron() {
  cron.schedule('* * * * *', async () => {
    try {
      const count = await processDuePosts();
      if (count > 0) {
        logger.info({ count }, 'Scheduler: published due posts');
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler cron error');
    }
  });
  logger.info('Scheduler cron started (every minute)');
}
