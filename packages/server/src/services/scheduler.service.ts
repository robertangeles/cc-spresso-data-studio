import { eq, and, asc, lte, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

/**
 * List all scheduled posts for a user, ordered by scheduledAt asc, pending first.
 */
export async function listScheduledPosts(userId: string) {
  return db.query.scheduledPosts.findMany({
    where: eq(schema.scheduledPosts.userId, userId),
    orderBy: [asc(schema.scheduledPosts.status), asc(schema.scheduledPosts.scheduledAt)],
  });
}

/**
 * Create a new scheduled post. Validates that scheduledAt is in the future.
 */
export async function schedulePost(data: {
  userId: string;
  contentItemId: string;
  channelId?: string;
  scheduledAt: string;
}) {
  const scheduledDate = new Date(data.scheduledAt);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    throw new Error('scheduledAt must be a valid future date');
  }

  const [post] = await db
    .insert(schema.scheduledPosts)
    .values({
      userId: data.userId,
      contentItemId: data.contentItemId,
      channelId: data.channelId ?? null,
      scheduledAt: scheduledDate,
      status: 'pending',
    })
    .returning();

  return post;
}

/**
 * Cancel a scheduled post. Checks ownership before updating.
 */
export async function cancelScheduledPost(id: string, userId: string) {
  const post = await db.query.scheduledPosts.findFirst({
    where: eq(schema.scheduledPosts.id, id),
  });

  if (!post) throw new NotFoundError('Scheduled post not found');
  if (post.userId !== userId) throw new ForbiddenError('Access denied');

  const [updated] = await db
    .update(schema.scheduledPosts)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(schema.scheduledPosts.id, id))
    .returning();

  return updated;
}

/**
 * Reschedule a post. Checks ownership and validates new date is in the future.
 */
export async function reschedulePost(id: string, scheduledAt: string, userId: string) {
  const post = await db.query.scheduledPosts.findFirst({
    where: eq(schema.scheduledPosts.id, id),
  });

  if (!post) throw new NotFoundError('Scheduled post not found');
  if (post.userId !== userId) throw new ForbiddenError('Access denied');

  const newDate = new Date(scheduledAt);
  if (isNaN(newDate.getTime()) || newDate <= new Date()) {
    throw new Error('scheduledAt must be a valid future date');
  }

  const [updated] = await db
    .update(schema.scheduledPosts)
    .set({ scheduledAt: newDate, updatedAt: new Date() })
    .where(eq(schema.scheduledPosts.id, id))
    .returning();

  return updated;
}

/**
 * Get scheduled posts within a date range for calendar view.
 */
export async function getCalendarPosts(userId: string, startDate: string, endDate: string) {
  return db.query.scheduledPosts.findMany({
    where: and(
      eq(schema.scheduledPosts.userId, userId),
      gte(schema.scheduledPosts.scheduledAt, new Date(startDate)),
      lte(schema.scheduledPosts.scheduledAt, new Date(endDate)),
    ),
    orderBy: [asc(schema.scheduledPosts.scheduledAt)],
  });
}

/**
 * Process all due posts: find pending posts with scheduledAt <= now,
 * mark as published, update corresponding content items.
 * Called by the cron job every minute.
 */
export async function processDuePosts(): Promise<number> {
  const now = new Date();

  const duePosts = await db.query.scheduledPosts.findMany({
    where: and(
      eq(schema.scheduledPosts.status, 'pending'),
      lte(schema.scheduledPosts.scheduledAt, now),
    ),
  });

  if (duePosts.length === 0) return 0;

  for (const post of duePosts) {
    try {
      // Mark scheduled post as published
      await db
        .update(schema.scheduledPosts)
        .set({ status: 'published', publishedAt: now, updatedAt: now })
        .where(eq(schema.scheduledPosts.id, post.id));

      // Update the corresponding content item status
      await db
        .update(schema.contentItems)
        .set({ status: 'published', updatedAt: now })
        .where(eq(schema.contentItems.id, post.contentItemId));

      logger.info({ postId: post.id, contentItemId: post.contentItemId }, 'Published scheduled post');
    } catch (err) {
      logger.error({ err, postId: post.id }, 'Failed to publish scheduled post');
      await db
        .update(schema.scheduledPosts)
        .set({ status: 'failed', error: String(err), updatedAt: now })
        .where(eq(schema.scheduledPosts.id, post.id));
    }
  }

  return duePosts.length;
}
