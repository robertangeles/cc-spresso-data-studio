import { logger } from '../../config/logger.js';

const BLUESKY_API = 'https://bsky.social/xrpc';

interface PublishResult {
  success: boolean;
  postUri?: string;
  error?: string;
  /** When tokens were refreshed during publish, return them so the caller can persist */
  newTokens?: { accessToken: string; refreshToken: string };
}

/**
 * Upload an image blob to Bluesky and return the blob reference for embedding.
 */
async function uploadImageBlob(
  token: string,
  imageUrl: string,
): Promise<{ blob: unknown; mimeType: string } | null> {
  try {
    // Fetch the image from the URL
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      logger.warn({ imageUrl, status: imgRes.status }, 'Failed to fetch image for Bluesky upload');
      return null;
    }

    const mimeType = imgRes.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Upload to Bluesky
    const uploadRes = await fetch(`${BLUESKY_API}/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
      },
      body: buffer,
    });

    const uploadData = (await uploadRes.json()) as any;

    if (!uploadRes.ok || !uploadData.blob) {
      logger.warn({ error: uploadData.error }, 'Bluesky image upload failed');
      return null;
    }

    return { blob: uploadData.blob, mimeType };
  } catch (err) {
    logger.warn({ err }, 'Bluesky image upload exception');
    return null;
  }
}

/**
 * Publish a text post (with optional image) to Bluesky via the AT Protocol.
 * Automatically refreshes the access token on 401 and retries once.
 */
export async function publishToBluesky(params: {
  accessToken: string;
  did: string;
  text: string;
  refreshToken?: string;
  imageUrl?: string;
}): Promise<PublishResult> {
  const { did, text, refreshToken, imageUrl } = params;
  let { accessToken } = params;

  const createPost = async (token: string): Promise<Response> => {
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
    };

    // Upload and embed image if provided
    if (imageUrl) {
      const uploaded = await uploadImageBlob(token, imageUrl);
      if (uploaded) {
        record.embed = {
          $type: 'app.bsky.embed.images',
          images: [
            {
              alt: text.slice(0, 100),
              image: uploaded.blob,
            },
          ],
        };
      }
    }

    return fetch(`${BLUESKY_API}/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: did,
        collection: 'app.bsky.feed.post',
        record,
      }),
    });
  };

  try {
    let res = await createPost(accessToken);

    // If 401 and we have a refresh token, try refreshing and retrying
    if (res.status === 401 && refreshToken) {
      logger.info('Bluesky access token expired, attempting refresh');

      const refreshRes = await fetch(`${BLUESKY_API}/com.atproto.server.refreshSession`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${refreshToken}` },
      });

      const refreshData = (await refreshRes.json()) as any;

      if (!refreshRes.ok || refreshData.error) {
        logger.error({ error: refreshData.error }, 'Bluesky token refresh failed during publish');
        return {
          success: false,
          error: 'Bluesky session expired and refresh failed. Please reconnect your account.',
        };
      }

      accessToken = refreshData.accessJwt;
      const newRefreshToken = refreshData.refreshJwt;
      res = await createPost(accessToken);

      const data = (await res.json()) as any;

      if (!res.ok || data.error) {
        logger.error({ error: data.error }, 'Bluesky createRecord failed after token refresh');
        return { success: false, error: data.message || data.error || 'Failed to post to Bluesky' };
      }

      logger.info({ uri: data.uri }, 'Bluesky post published (after token refresh)');
      return {
        success: true,
        postUri: data.uri,
        newTokens: { accessToken, refreshToken: newRefreshToken },
      };
    }

    const data = (await res.json()) as any;

    if (!res.ok || data.error) {
      logger.error({ error: data.error }, 'Bluesky createRecord failed');
      return { success: false, error: data.message || data.error || 'Failed to post to Bluesky' };
    }

    logger.info({ uri: data.uri }, 'Bluesky post published');
    return { success: true, postUri: data.uri };
  } catch (err) {
    logger.error({ err }, 'Bluesky publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
