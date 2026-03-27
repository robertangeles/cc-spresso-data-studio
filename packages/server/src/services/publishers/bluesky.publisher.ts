import { logger } from '../../config/logger.js';

const BLUESKY_API = 'https://bsky.social/xrpc';

interface PublishResult {
  success: boolean;
  postUri?: string;
  error?: string;
}

/**
 * Publish a text post to Bluesky via the AT Protocol.
 * Automatically refreshes the access token on 401 and retries once.
 */
export async function publishToBluesky(params: {
  accessToken: string;
  did: string;
  text: string;
  refreshToken?: string;
}): Promise<PublishResult> {
  const { did, text, refreshToken } = params;
  let { accessToken } = params;

  const createPost = async (token: string): Promise<Response> => {
    return fetch(`${BLUESKY_API}/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: did,
        collection: 'app.bsky.feed.post',
        record: {
          $type: 'app.bsky.feed.post',
          text,
          createdAt: new Date().toISOString(),
        },
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
      res = await createPost(accessToken);
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
