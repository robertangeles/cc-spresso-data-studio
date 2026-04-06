import { defaultUserSkills } from './defaults/index.js';
import { createSkill } from '../skill.service.js';
import { logger } from '../../config/logger.js';

/**
 * Seed default Anthropic skills into a new user's account.
 * Fire-and-forget — errors are logged but never thrown.
 * Idempotent: duplicate slugs are silently skipped.
 */
export async function seedDefaultSkillsForUser(userId: string): Promise<void> {
  let seeded = 0;
  let skipped = 0;

  for (const skill of defaultUserSkills) {
    try {
      await createSkill(
        {
          name: skill.name,
          slug: skill.slug,
          description: skill.description,
          category: skill.category,
          icon: skill.icon,
          tags: skill.tags,
          config: skill.config,
        },
        userId,
      );
      seeded++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already have a skill')) {
        skipped++;
      } else {
        logger.warn({ err, userId, skill: skill.slug }, 'Failed to seed default skill');
      }
    }
  }

  logger.info(
    { userId, seeded, skipped, total: defaultUserSkills.length },
    'Default skills seeded for new user',
  );
}
