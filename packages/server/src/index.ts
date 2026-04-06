import { createServer } from 'http';
import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { verifyConnection } from './db/index.js';
import { seedBuiltinSkills } from './services/skills/seed.js';
import { seedAIProviders, seedRoles } from './services/admin.service.js';
import { providerRegistry } from './services/ai/provider.registry.js';
import { seedChannels, seedRemixStylePrompts } from './services/content.service.js';
import { seedDefaultPrompts } from './services/system-prompt.service.js';
import { startSchedulerCron } from './services/scheduler.cron.js';
import { seedDefaultPlans } from './services/subscription.service.js';
import { seedDefaultCreditCosts } from './services/credit.service.js';
import { seedDefaultTemplates } from './services/emailTemplate.service.js';
import { initSocketIO } from './socket/index.js';
import { seedCommunityDefaults } from './seeds/community.seed.js';

async function start() {
  await verifyConnection();
  await seedBuiltinSkills();
  await seedRoles();
  await seedAIProviders();
  await seedChannels();
  await seedDefaultPrompts();
  await seedRemixStylePrompts();
  await providerRegistry.loadFromDatabase();
  await seedDefaultPlans();
  await seedDefaultCreditCosts();
  await seedDefaultTemplates();
  await seedCommunityDefaults();

  startSchedulerCron();

  const httpServer = createServer(app);
  initSocketIO(httpServer);

  httpServer.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
