import { eq, and, asc, desc, lte, gte } from 'drizzle-orm';
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
import { publishToFacebook } from './publishers/facebook.publisher.js';
import { publishToThreads } from './publishers/threads.publisher.js';
import { publishToLinkedIn } from './publishers/linkedin.publisher.js';
import { publishToTwitter } from './publishers/twitter.publisher.js';
import { publishToPinterest } from './publishers/pinterest.publisher.js';
import { publishToYouTube } from './publishers/youtube.publisher.js';
import {
  publishToTikTok,
  checkTikTokPublishStatus,
  type TikTokPublishStatusResponse,
} from './publishers/tiktok.publisher.js';

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
  socialAccountId: string;
  metadata?: Record<string, unknown>;
}) {
  if (!data.socialAccountId) {
    throw new Error('socialAccountId is required — select an account for the platform');
  }

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
      socialAccountId: data.socialAccountId,
      scheduledAt: scheduledDate,
      status: 'pending',
      metadata: data.metadata ?? {},
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
      eq(schema.socialAccounts.id, schema.scheduledPosts.socialAccountId),
    )
    .where(
      and(
        eq(schema.scheduledPosts.userId, userId),
        gte(schema.scheduledPosts.scheduledAt, new Date(startDate)),
        lte(schema.scheduledPosts.scheduledAt, new Date(endDate)),
      ),
    )
    .orderBy(desc(schema.scheduledPosts.scheduledAt));

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

        // Attempt auto-publish to Facebook
        if (channelSlug === 'facebook') {
          const result = await publishToFacebook({
            accessToken: account.accessToken,
            pageId: account.accountId,
            message: contentItem.body,
            imageUrl: contentItem.imageUrl ?? undefined,
          });

          if (result.success) {
            autoPublished = true;
            logger.info({ postId: post.id, fbPostId: result.postId }, 'Auto-published to Facebook');
          } else {
            publishError = result.error ?? 'Facebook publish failed';
            logger.warn({ postId: post.id, error: result.error }, 'Facebook auto-publish failed');
          }
        }

        // Attempt auto-publish to Threads
        if (channelSlug === 'threads') {
          const result = await publishToThreads({
            accessToken: account.accessToken,
            threadsUserId: account.accountId,
            text: contentItem.body,
            imageUrl: contentItem.imageUrl ?? undefined,
          });

          if (result.success) {
            autoPublished = true;
            logger.info(
              { postId: post.id, threadsPostId: result.postId },
              'Auto-published to Threads',
            );
          } else {
            publishError = result.error ?? 'Threads publish failed';
            logger.warn({ postId: post.id, error: result.error }, 'Threads auto-publish failed');
          }
        }

        // Attempt auto-publish to LinkedIn
        if (channelSlug === 'linkedin') {
          const result = await publishToLinkedIn({
            accessToken: account.accessToken,
            memberId: account.accountId,
            text: contentItem.body,
            imageUrl: contentItem.imageUrl ?? undefined,
            accountType: account.accountType,
          });

          if (result.success) {
            autoPublished = true;
            logger.info(
              { postId: post.id, linkedinPostId: result.postId },
              'Auto-published to LinkedIn',
            );
          } else {
            publishError = result.error ?? 'LinkedIn publish failed';
            logger.warn({ postId: post.id, error: result.error }, 'LinkedIn auto-publish failed');
          }
        }
        // Attempt auto-publish to Twitter/X
        if (channelSlug === 'twitter') {
          const result = await publishToTwitter({
            accessToken: account.accessToken,
            accountId: account.accountId,
            text: contentItem.body,
            imageUrl: contentItem.imageUrl ?? undefined,
          });

          if (result.success) {
            autoPublished = true;
            logger.info({ postId: post.id, tweetId: result.postId }, 'Auto-published to Twitter/X');
          } else {
            publishError = result.error ?? 'Twitter publish failed';
            logger.warn({ postId: post.id, error: result.error }, 'Twitter auto-publish failed');
          }
        }
        // Attempt auto-publish to Pinterest
        if (channelSlug === 'pinterest') {
          // Per-post metadata (boardId, link) set in Data Studio at schedule time
          const postMeta = (post.metadata ?? {}) as { boardId?: string; link?: string };
          // Fall back to account-level default board if not set per-post
          const acctMeta = (account.metadata ?? {}) as { defaultBoardId?: string };
          const boardId = postMeta.boardId || acctMeta.defaultBoardId;

          if (!contentItem.imageUrl) {
            publishError = 'Pinterest requires an image — add an image to this content item';
          } else if (!boardId) {
            publishError = 'No Pinterest board selected — select a board when scheduling';
          } else {
            const result = await publishToPinterest({
              accessToken: account.accessToken,
              title: contentItem.title ?? '',
              description: contentItem.body,
              imageUrl: contentItem.imageUrl,
              boardId,
              link: postMeta.link,
            });

            if (result.success) {
              autoPublished = true;
              logger.info({ postId: post.id, pinId: result.pinId }, 'Auto-published to Pinterest');
            } else {
              publishError = result.error ?? 'Pinterest publish failed';
              logger.warn(
                { postId: post.id, error: result.error },
                'Pinterest auto-publish failed',
              );
            }
          }
        }
        // Attempt auto-publish to YouTube
        if (channelSlug === 'youtube') {
          // Refresh token if expired (YouTube tokens last 1 hour)
          if (
            account.tokenExpiresAt &&
            account.tokenExpiresAt < new Date() &&
            account.refreshToken
          ) {
            try {
              const provider = (await import('./oauth/oauth.service.js')).getOAuthProvider(
                'youtube',
              );
              // account.refreshToken is already decrypted by getConnectedAccountById/getConnectedAccount
              const newTokens = await provider.refreshToken(account.refreshToken);
              await updateAccountTokens(account.id, {
                accessToken: newTokens.accessToken,
                refreshToken: newTokens.refreshToken ?? account.refreshToken,
              });
              account.accessToken = newTokens.accessToken;
              logger.info({ postId: post.id }, 'YouTube token refreshed before publish');
            } catch (refreshErr) {
              publishError = 'YouTube token refresh failed — reconnect your account';
              logger.error({ err: refreshErr, postId: post.id }, 'YouTube token refresh failed');
            }
          }

          const postMeta = (post.metadata ?? {}) as { tags?: string[]; privacyStatus?: string };
          const videoUrl = contentItem.videoUrl;
          if (publishError) {
            // Token refresh failed — skip publish
          } else if (!videoUrl) {
            publishError = 'YouTube requires a video — upload a video to this content item';
          } else {
            const result = await publishToYouTube({
              accessToken: account.accessToken,
              title: contentItem.title ?? '',
              description: contentItem.body,
              tags: postMeta.tags,
              videoUrl,
              privacyStatus:
                (postMeta.privacyStatus as 'public' | 'unlisted' | 'private') ?? 'public',
            });

            if (result.success) {
              autoPublished = true;
              logger.info(
                { postId: post.id, videoId: result.videoId },
                'Auto-published to YouTube',
              );
            } else {
              publishError = result.error ?? 'YouTube publish failed';
              logger.warn({ postId: post.id, error: result.error }, 'YouTube auto-publish failed');
            }
          }
        }
        // Attempt auto-publish to TikTok (ASYNC — returns publish_id, not final status)
        if (channelSlug === 'tiktok') {
          // Refresh token if expired
          if (
            account.tokenExpiresAt &&
            account.tokenExpiresAt < new Date() &&
            account.refreshToken
          ) {
            try {
              const provider = (await import('./oauth/oauth.service.js')).getOAuthProvider(
                'tiktok',
              );
              const newTokens = await provider.refreshToken(account.refreshToken);
              await updateAccountTokens(account.id, {
                accessToken: newTokens.accessToken,
                refreshToken: newTokens.refreshToken ?? account.refreshToken,
              });
              account.accessToken = newTokens.accessToken;
              logger.info({ postId: post.id }, 'TikTok token refreshed before publish');
            } catch (refreshErr) {
              publishError = 'TikTok token refresh failed — reconnect your account';
              logger.error({ err: refreshErr, postId: post.id }, 'TikTok token refresh failed');
            }
          }

          const postMeta = (post.metadata ?? {}) as {
            privacyLevel?: string;
            disableComment?: boolean;
            disableDuet?: boolean;
            disableStitch?: boolean;
            brandContentToggle?: boolean;
            brandOrganicToggle?: boolean;
            isAigc?: boolean;
            coverImageIndex?: number;
          };
          const videoUrl = contentItem.videoUrl;

          if (publishError) {
            // Token refresh failed — skip
          } else if (!videoUrl) {
            publishError = 'TikTok requires a video — upload a video to this content item';
          } else {
            const result = await publishToTikTok({
              accessToken: account.accessToken,
              videoUrl,
              caption: contentItem.body,
              privacyLevel:
                (postMeta.privacyLevel as
                  | 'PUBLIC_TO_EVERYONE'
                  | 'MUTUAL_FOLLOW_FRIENDS'
                  | 'FOLLOWER_OF_CREATOR'
                  | 'SELF_ONLY') ?? 'PUBLIC_TO_EVERYONE',
              disableComment: postMeta.disableComment,
              disableDuet: postMeta.disableDuet,
              disableStitch: postMeta.disableStitch,
              brandContentToggle: postMeta.brandContentToggle,
              brandOrganicToggle: postMeta.brandOrganicToggle,
              isAigc: postMeta.isAigc,
              coverImageIndex: postMeta.coverImageIndex,
            });

            if (result.success && result.publishId) {
              // TikTok is ASYNC — mark as 'processing', not 'published'
              // The pollTikTokProcessingPosts() job will check for completion
              await db
                .update(schema.scheduledPosts)
                .set({
                  status: 'processing',
                  metadata: { ...(post.metadata as object), tiktokPublishId: result.publishId },
                  updatedAt: now,
                })
                .where(eq(schema.scheduledPosts.id, post.id));
              logger.info(
                { postId: post.id, publishId: result.publishId },
                'TikTok publish initiated — polling for completion',
              );
              continue; // Skip the normal published/failed logic below
            } else {
              publishError = result.error ?? 'TikTok publish failed';
              logger.warn({ postId: post.id, error: result.error }, 'TikTok auto-publish failed');
            }
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

/**
 * Poll TikTok publish status for posts in 'processing' state.
 * Called every 30 seconds by the cron job.
 *
 * TikTok's async publish flow:
 *   1. publishToTikTok() returns a publish_id → post status = 'processing'
 *   2. This function polls TikTok's status endpoint
 *   3. When PUBLISH_COMPLETE → mark published
 *   4. When FAILED → mark failed with reason
 *   5. Stale check: if processing > 10 minutes → mark failed (timeout)
 */
export async function pollTikTokProcessingPosts(): Promise<number> {
  const now = new Date();
  const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  // Find all posts in 'processing' state (TikTok async publishes)
  const processingPosts = await db.query.scheduledPosts.findMany({
    where: eq(schema.scheduledPosts.status, 'processing'),
  });

  if (processingPosts.length === 0) return 0;

  let completed = 0;

  for (const post of processingPosts) {
    const meta = (post.metadata ?? {}) as { tiktokPublishId?: string };
    const publishId = meta.tiktokPublishId;

    if (!publishId) {
      // No publish_id — shouldn't happen, mark failed
      await db
        .update(schema.scheduledPosts)
        .set({ status: 'failed', error: 'Missing TikTok publish ID', updatedAt: now })
        .where(eq(schema.scheduledPosts.id, post.id));
      completed++;
      continue;
    }

    // Stale check: if processing for too long, mark as failed
    const postUpdated = post.updatedAt ?? post.createdAt;
    if (postUpdated && now.getTime() - postUpdated.getTime() > STALE_TIMEOUT_MS) {
      logger.warn(
        { postId: post.id, publishId },
        'TikTok publish timed out (>10min) — marking as failed',
      );
      await db
        .update(schema.scheduledPosts)
        .set({ status: 'failed', error: 'TikTok publishing timed out', updatedAt: now })
        .where(eq(schema.scheduledPosts.id, post.id));
      completed++;
      continue;
    }

    // Resolve the social account to get the access token
    const account = post.socialAccountId
      ? await getConnectedAccountById(post.socialAccountId)
      : null;

    if (!account?.accessToken) {
      await db
        .update(schema.scheduledPosts)
        .set({
          status: 'failed',
          error: 'TikTok account disconnected during processing',
          updatedAt: now,
        })
        .where(eq(schema.scheduledPosts.id, post.id));
      completed++;
      continue;
    }

    try {
      const statusRes: TikTokPublishStatusResponse = await checkTikTokPublishStatus(
        account.accessToken,
        publishId,
      );

      const status = statusRes.data?.status;

      if (status === 'PUBLISH_COMPLETE') {
        const tiktokPostId = statusRes.data?.publicaly_available_post_id?.[0];
        await db
          .update(schema.scheduledPosts)
          .set({
            status: 'published',
            publishedAt: now,
            metadata: { ...(post.metadata as object), tiktokPostId },
            updatedAt: now,
          })
          .where(eq(schema.scheduledPosts.id, post.id));

        await db
          .update(schema.contentItems)
          .set({ status: 'published', updatedAt: now })
          .where(eq(schema.contentItems.id, post.contentItemId));

        logger.info({ postId: post.id, publishId, tiktokPostId }, 'TikTok publish complete');
        completed++;
      } else if (status === 'FAILED') {
        const reason = statusRes.data?.fail_reason ?? 'Unknown failure';
        await db
          .update(schema.scheduledPosts)
          .set({
            status: 'failed',
            error: `TikTok rejected: ${reason}`,
            updatedAt: now,
          })
          .where(eq(schema.scheduledPosts.id, post.id));

        logger.warn({ postId: post.id, publishId, reason }, 'TikTok publish failed');
        completed++;
      } else {
        // Still processing (PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SEND_TO_USER_INBOX)
        logger.debug({ postId: post.id, publishId, status }, 'TikTok still processing');
      }
    } catch (err) {
      // Network error during poll — don't mark as failed, try again next cycle
      logger.error(
        { err, postId: post.id, publishId },
        'TikTok status poll failed — will retry next cycle',
      );
    }
  }

  if (completed > 0) {
    logger.info({ completed, total: processingPosts.length }, 'TikTok publish status poll cycle');
  }

  return completed;
}
