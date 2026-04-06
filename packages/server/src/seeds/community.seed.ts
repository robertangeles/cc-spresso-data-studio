import { db } from '../db/index.js';
import { communityChannels, settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../config/logger.js';

/**
 * Seeds the default #general channel and community_enabled setting.
 */
export async function seedCommunityDefaults() {
  // Seed community_enabled setting if not exists
  const [existing] = await db
    .select({ id: settings.id })
    .from(settings)
    .where(eq(settings.key, 'community_enabled'))
    .limit(1);

  if (!existing) {
    await db.insert(settings).values({
      key: 'community_enabled',
      value: 'true',
      isSecret: false,
    });
    logger.info('Seeded community_enabled setting');
  }

  // Seed default #general channel if no default exists
  const [defaultChannel] = await db
    .select({ id: communityChannels.id })
    .from(communityChannels)
    .where(eq(communityChannels.isDefault, true))
    .limit(1);

  if (!defaultChannel) {
    await db.insert(communityChannels).values({
      name: 'General',
      slug: 'general',
      description: 'General discussion for the community',
      type: 'text',
      isDefault: true,
      sortOrder: 0,
    });
    logger.info('Seeded default #general channel');
  }

  // Seed #announcements channel if not exists
  const [announcementsChannel] = await db
    .select({ id: communityChannels.id })
    .from(communityChannels)
    .where(eq(communityChannels.slug, 'announcements'))
    .limit(1);

  if (!announcementsChannel) {
    await db.insert(communityChannels).values({
      name: 'Announcements',
      slug: 'announcements',
      description: 'Official announcements from the team',
      type: 'announcement',
      isDefault: false,
      sortOrder: 1,
    });
    logger.info('Seeded #announcements channel');
  }
}
