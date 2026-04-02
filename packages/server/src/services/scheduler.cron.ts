import cron from 'node-cron';
import { processDuePosts } from './scheduler.service.js';
import { refreshExpiringTokens } from './oauth/oauth.service.js';
import { cleanupExpiredTokens, cleanupUnverifiedAccounts } from './verification.service.js';
import { logger } from '../config/logger.js';

export function startSchedulerCron() {
  // Process due posts every minute
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

  // Refresh OAuth tokens expiring within 7 days — daily at 3am
  cron.schedule('0 3 * * *', async () => {
    try {
      const result = await refreshExpiringTokens();
      if (result.refreshed > 0 || result.failed > 0) {
        logger.info(result, 'Token refresh cron complete');
      }
    } catch (err) {
      logger.error({ err }, 'Token refresh cron error');
    }
  });
  logger.info('Token refresh cron started (daily at 3am)');

  // Cleanup expired verification tokens + unverified accounts — daily at 4am
  cron.schedule('0 4 * * *', async () => {
    try {
      const tokensDeleted = await cleanupExpiredTokens();
      const accountsDeleted = await cleanupUnverifiedAccounts();
      if (tokensDeleted > 0 || accountsDeleted > 0) {
        logger.info({ tokensDeleted, accountsDeleted }, 'Verification cleanup cron complete');
      }
    } catch (err) {
      logger.error({ err }, 'Verification cleanup cron error');
    }
  });
  logger.info('Verification cleanup cron started (daily at 4am)');
}
