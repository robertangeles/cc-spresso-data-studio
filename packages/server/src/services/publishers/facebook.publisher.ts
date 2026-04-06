import { logger } from '../../config/logger.js';

interface FacebookApiResponse {
  id: string;
  error?: { message?: string };
}

interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Publish a post to a Facebook Page via the Graph API.
 * Supports text-only and text + image posts.
 */
export async function publishToFacebook(params: {
  accessToken: string;
  pageId: string;
  message: string;
  imageUrl?: string;
}): Promise<PublishResult> {
  const { accessToken, pageId, message, imageUrl } = params;

  try {
    let postId: string;

    if (imageUrl) {
      // Photo post: Facebook Graph API requires form-encoded data, not JSON
      const formBody = new URLSearchParams({
        url: imageUrl,
        caption: message,
        access_token: accessToken,
      });

      const res = await fetch(`https://graph.facebook.com/v22.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
      });

      const data = (await res.json()) as FacebookApiResponse;
      if (data.error) {
        logger.error({ error: data.error }, 'Facebook photo post failed');
        return { success: false, error: data.error.message || 'Failed to post photo to Facebook' };
      }
      postId = data.id;
    } else {
      // Text-only post
      const res = await fetch(`https://graph.facebook.com/v22.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          access_token: accessToken,
        }),
      });

      const data = (await res.json()) as FacebookApiResponse;
      if (data.error) {
        logger.error({ error: data.error }, 'Facebook text post failed');
        return { success: false, error: data.error.message || 'Failed to post to Facebook' };
      }
      postId = data.id;
    }

    logger.info({ postId }, 'Facebook post published');
    return { success: true, postId };
  } catch (err) {
    logger.error({ err }, 'Facebook publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
