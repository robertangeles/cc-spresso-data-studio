import { eq, and, asc, lte, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../config/logger.js';
import {
  getConnectedAccount,
  getConnectedAccountById,
  updateAccountTokens,
} from './oauth/oauth.service.js';
import { publishToInstagram } from './publishers/instagram.publisher.js';
import { publishToBluesky } from './publishers/bluesky.publisher.js';

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
 * Delete a scheduled post. Checks ownership before removing.
 */
export async function deleteScheduledPost(id: string, userId: string) {
  const post = await db.query.scheduledPosts.findFirst({
    where: eq(schema.scheduledPosts.id, id),
  });

  if (!post) throw new NotFoundError('Scheduled post not found');
  if (post.userId !== userId) throw new ForbiddenError('Access denied');

  await db.delete(schema.scheduledPosts).where(eq(schema.scheduledPosts.id, id));

  return { deleted: true };
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
 * Retry a failed scheduled post. Resets status to pending and schedules 30s in the future.
 */
export async function retryScheduledPost(id: string, userId: string) {
  const post = await db.query.scheduledPosts.findFirst({
    where: eq(schema.scheduledPosts.id, id),
  });

  if (!post) throw new NotFoundError('Scheduled post not found');
  if (post.userId !== userId) throw new ForbiddenError('Access denied');
  if (post.status !== 'failed') throw new Error('Only failed posts can be retried');

  const [updated] = await db
    .update(schema.scheduledPosts)
    .set({
      status: 'pending',
      scheduledAt: new Date(Date.now() + 30_000),
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.scheduledPosts.id, id))
    .returning();

  return updated;
}

/**
 * Get scheduled posts within a date range for calendar view.
 * Joins contentItems and channels to provide title and platform for the UI.
 */
export async function getCalendarPosts(userId: string, startDate: string, endDate: string) {
  const rows = await db
    .select({
      id: schema.scheduledPosts.id,
      scheduledAt: schema.scheduledPosts.scheduledAt,
      status: schema.scheduledPosts.status,
      error: schema.scheduledPosts.error,
      title: schema.contentItems.title,
      platform: schema.channels.slug,
      accountName: schema.socialAccounts.accountName,
    })
    .from(schema.scheduledPosts)
    .leftJoin(schema.contentItems, eq(schema.scheduledPosts.contentItemId, schema.contentItems.id))
    .leftJoin(schema.channels, eq(schema.scheduledPosts.channelId, schema.channels.id))
    .leftJoin(
      schema.socialAccounts,
      and(
        eq(schema.socialAccounts.userId, schema.scheduledPosts.userId),
        eq(schema.socialAccounts.platform, schema.channels.slug),
        eq(schema.socialAccounts.isConnected, true),
      ),
    )
    .where(
      and(
        eq(schema.scheduledPosts.userId, userId),
        gte(schema.scheduledPosts.scheduledAt, new Date(startDate)),
        lte(schema.scheduledPosts.scheduledAt, new Date(endDate)),
      ),
    )
    .orderBy(asc(schema.scheduledPosts.scheduledAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? 'Untitled',
    platform: r.platform ?? 'unknown',
    accountName: r.accountName ?? null,
    scheduledAt: r.scheduledAt.toISOString(),
    status: r.status,
    error: r.error,
  }));
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
      // Resolve channel slug to determine target platform
      let channelSlug: string | null = null;
      if (post.channelId) {
        const channel = await db.query.channels.findFirst({
          where: eq(schema.channels.id, post.channelId),
        });
        channelSlug = channel?.slug ?? null;
      }

      // Fetch the content item for publishing payload
      const contentItem = await db.query.contentItems.findFirst({
        where: eq(schema.contentItems.id, post.contentItemId),
      });

      // Resolve the social account — prefer explicit socialAccountId, fall back to platform lookup
      let autoPublished = false;
      let publishError: string | null = null;

      const account = post.socialAccountId
        ? await getConnectedAccountById(post.socialAccountId)
        : channelSlug
          ? await getConnectedAccount(post.userId, channelSlug)
          : null;

      if (channelSlug && contentItem && account?.accessToken && account.accountId) {
        // Attempt auto-publish to Instagram
        if (channelSlug === 'instagram') {
          const result = await publishToInstagram({
            accessToken: account.accessToken,
            igUserId: account.accountId,
            caption: contentItem.body,
            imageUrl: contentItem.imageUrl ?? undefined,
          });

          if (result.success) {
            autoPublished = true;
            logger.info(
              { postId: post.id, igPostId: result.postId },
              'Auto-published to Instagram',
            );
          } else {
            publishError = result.error ?? 'Instagram publish failed';
            logger.warn({ postId: post.id, error: result.error }, 'Instagram auto-publish failed');
          }
        }

        // Attempt auto-publish to Bluesky
        if (channelSlug === 'bluesky') {
          const result = await publishToBluesky({
            accessToken: account.accessToken,
            did: account.accountId,
            text: contentItem.body,
            refreshToken: account.refreshToken ?? undefined,
            imageUrl: contentItem.imageUrl ?? undefined,
          });

          if (result.success) {
            autoPublished = true;
            if (result.newTokens) {
              await updateAccountTokens(account.id, result.newTokens);
            }
            logger.info({ postId: post.id, bskyUri: result.postUri }, 'Auto-published to Bluesky');
          } else {
            publishError = result.error ?? 'Bluesky publish failed';
            logger.warn({ postId: post.id, error: result.error }, 'Bluesky auto-publish failed');
          }
        }
      } else if (channelSlug) {
        publishError = `No connected ${channelSlug} account found`;
      }

      // Only mark as published if the platform publish actually succeeded (or no platform targeted)
      if (autoPublished || !channelSlug) {
        await db
          .update(schema.scheduledPosts)
          .set({ status: 'published', publishedAt: now, updatedAt: now })
          .where(eq(schema.scheduledPosts.id, post.id));

        await db
          .update(schema.contentItems)
          .set({ status: 'published', updatedAt: now })
          .where(eq(schema.contentItems.id, post.contentItemId));
      } else {
        // Platform publish failed — mark as failed so it can be retried
        await db
          .update(schema.scheduledPosts)
          .set({ status: 'failed', error: publishError, updatedAt: now })
          .where(eq(schema.scheduledPosts.id, post.id));
      }

      logger.info(
        { postId: post.id, contentItemId: post.contentItemId, autoPublished },
        'Published scheduled post',
      );
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
