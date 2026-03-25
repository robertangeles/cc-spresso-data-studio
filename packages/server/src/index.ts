import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import { verifyConnection } from './db/index.js';
import { seedBuiltinSkills } from './services/skills/seed.js';
import { seedAIProviders, seedRoles } from './services/admin.service.js';
import { providerRegistry } from './services/ai/provider.registry.js';
import { seedChannels } from './services/content.service.js';
import { seedDefaultPrompts } from './services/system-prompt.service.js';

async function start() {
  await verifyConnection();
  await seedBuiltinSkills();
  await seedRoles();
  await seedAIProviders();
  await seedChannels();
  await seedDefaultPrompts();
  await providerRegistry.loadFromDatabase();

  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
