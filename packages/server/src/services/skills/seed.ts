import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { logger } from '../../config/logger.js';
import { builtinSkills } from './builtins/index.js';

export async function seedBuiltinSkills(): Promise<void> {
  for (const skill of builtinSkills) {
    const existing = await db.query.skills.findFirst({
      where: eq(schema.skills.slug, skill.slug),
    });

    if (existing) {
      // Update if config changed
      await db
        .update(schema.skills)
        .set({
          name: skill.name,
          description: skill.description,
          category: skill.category,
          icon: skill.icon,
          tags: skill.tags,
          config: skill.config,
          updatedAt: new Date(),
        })
        .where(eq(schema.skills.id, existing.id));
      logger.info({ slug: skill.slug }, 'Built-in skill updated');
    } else {
      const [created] = await db
        .insert(schema.skills)
        .values({
          slug: skill.slug,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          source: 'builtin',
          userId: null,
          icon: skill.icon,
          tags: skill.tags,
          config: skill.config,
          isPublished: true,
        })
        .returning({ id: schema.skills.id });

      // Create initial version
      await db.insert(schema.skillVersions).values({
        skillId: created.id,
        version: 1,
        config: skill.config,
        changelog: 'Initial version',
      });

      logger.info({ slug: skill.slug }, 'Built-in skill seeded');
    }
  }

  logger.info({ count: builtinSkills.length }, 'Built-in skills sync complete');
}
