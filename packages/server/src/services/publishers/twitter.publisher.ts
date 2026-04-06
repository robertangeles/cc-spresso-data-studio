import { logger } from '../../config/logger.js';

interface TwitterMediaUploadResponse {
  data?: { id?: string; media_key?: string };
  media_id_string?: string;
  id?: string;
}

interface TwitterTweetResponse {
  data?: { id?: string };
  detail?: string;
  title?: string;
  errors?: { message?: string }[];
}

interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * In-memory rate limit tracker per account.
 * X Basic tier: 17 tweets per 15-minute window.
 */
const rateLimitWindows = new Map<string, { timestamps: number[] }>();

const RATE_LIMIT_MAX = 17;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(accountId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  let window = rateLimitWindows.get(accountId);

  if (!window) {
    window = { timestamps: [] };
    rateLimitWindows.set(accountId, window);
  }

  // Prune timestamps outside the window
  window.timestamps = window.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (window.timestamps.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = window.timestamps[0];
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}

function recordTweet(accountId: string): void {
  const window = rateLimitWindows.get(accountId) ?? { timestamps: [] };
  window.timestamps.push(Date.now());
  rateLimitWindows.set(accountId, window);
}

/**
 * Upload an image to Twitter via the v1.1 media upload endpoint.
 * Returns the media_id_string for attaching to a tweet.
 */
async function uploadMedia(accessToken: string, imageUrl: string): Promise<string | null> {
  try {
    // Fetch image bytes
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      logger.error(
        { status: imageRes.status, imageUrl },
        'Failed to fetch image for Twitter upload',
      );
      return null;
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';

    // v2 simple upload — multipart form with media, media_category, media_type
    const form = new FormData();
    form.append('media', new Blob([imageBuffer], { type: contentType }), 'image.jpg');
    form.append('media_category', 'tweet_image');
    form.append('media_type', contentType);

    const uploadRes = await fetch('https://api.x.com/2/media/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });

    const uploadData = (await uploadRes.json()) as TwitterMediaUploadResponse;

    if (!uploadRes.ok) {
      logger.error({ status: uploadRes.status, data: uploadData }, 'Twitter media upload failed');
      return null;
    }

    // v2 response wraps in { data: { id, media_key, ... } } or flat { media_id_string, ... }
    const mediaId =
      uploadData.data?.id ??
      uploadData.media_id_string ??
      uploadData.id ??
      uploadData.data?.media_key;

    if (!mediaId) {
      logger.error(
        { uploadData: JSON.stringify(uploadData) },
        'Twitter media upload: no media ID in response',
      );
      return null;
    }

    logger.info({ mediaId }, 'Twitter media uploaded successfully');
    return String(mediaId);
  } catch (err) {
    logger.error({ err }, 'Twitter media upload exception');
    return null;
  }
}

/**
 * Publish a tweet to Twitter/X via API v2.
 *
 * Supports text-only and text + single image.
 * Includes in-memory rate limiting (17 tweets / 15 min per account).
 */
export async function publishToTwitter(params: {
  accessToken: string;
  accountId: string;
  text: string;
  imageUrl?: string;
}): Promise<PublishResult> {
  const { accessToken, accountId, text, imageUrl } = params;

  try {
    // Check rate limit
    const rateCheck = checkRateLimit(accountId);
    if (!rateCheck.allowed) {
      const retryMin = Math.ceil((rateCheck.retryAfterMs ?? 0) / 60000);
      return {
        success: false,
        error: `Twitter rate limit reached (17 tweets per 15 minutes). Retry in ~${retryMin} minute(s).`,
      };
    }

    // Build tweet payload
    const tweetPayload: Record<string, unknown> = { text };

    // Upload image if provided
    if (imageUrl) {
      const mediaId = await uploadMedia(accessToken, imageUrl);
      if (mediaId) {
        tweetPayload.media = { media_ids: [mediaId] };
      } else {
        logger.warn({ imageUrl }, 'Image upload failed — publishing tweet without image');
      }
    }

    // Post tweet via v2 API
    const tweetRes = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetPayload),
    });

    const tweetData = (await tweetRes.json()) as TwitterTweetResponse;

    if (!tweetRes.ok) {
      // Check for auth errors (token may be expired)
      if (tweetRes.status === 401 || tweetRes.status === 403) {
        return {
          success: false,
          error: `Twitter auth error (${tweetRes.status}): ${tweetData.detail || tweetData.title || 'Token may be expired'}`,
        };
      }

      // Rate limit from Twitter's side (429)
      if (tweetRes.status === 429) {
        return {
          success: false,
          error: 'Twitter API rate limit exceeded. Please try again later.',
        };
      }

      const errMsg =
        tweetData.detail ||
        tweetData.errors?.[0]?.message ||
        tweetData.title ||
        'Tweet creation failed';
      logger.error({ status: tweetRes.status, error: tweetData }, 'Twitter publish failed');
      return { success: false, error: errMsg };
    }

    const tweetId = tweetData.data?.id;
    recordTweet(accountId);

    logger.info({ postId: tweetId, accountId }, 'Tweet published');
    return { success: true, postId: tweetId };
  } catch (err) {
    logger.error({ err }, 'Twitter publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
