import { logger } from '../../config/logger.js';

interface InstagramContainerResponse {
  id: string;
  error?: { message?: string };
}

interface InstagramStatusResponse {
  status_code?: string;
}

interface InstagramPublishResponse {
  id?: string;
  error?: { message?: string };
}

interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Publish content to Instagram via Graph API.
 * 2-step process: create container -> publish container.
 */
export async function publishToInstagram(params: {
  accessToken: string;
  igUserId: string;
  caption: string;
  imageUrl?: string;
}): Promise<PublishResult> {
  const { accessToken, igUserId, caption, imageUrl } = params;

  try {
    // Step 1: Create media container
    const containerParams = new URLSearchParams({
      access_token: accessToken,
      caption,
    });

    if (imageUrl) {
      containerParams.set('image_url', imageUrl);
    } else {
      // Text-only posts not supported on Instagram — need an image
      return { success: false, error: 'Instagram requires an image for publishing.' };
    }

    const containerRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media`, {
      method: 'POST',
      body: containerParams,
    });
    const containerData = (await containerRes.json()) as InstagramContainerResponse;

    if (containerData.error) {
      logger.error({ error: containerData.error }, 'Instagram container creation failed');
      return { success: false, error: containerData.error.message };
    }

    const containerId = containerData.id;
    logger.info({ containerId }, 'Instagram media container created');

    // Step 2: Wait for container to be ready (poll status)
    let ready = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!ready && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000)); // Wait 2 seconds between polls

      const statusRes = await fetch(
        `https://graph.facebook.com/v22.0/${containerId}?fields=status_code&access_token=${accessToken}`,
      );
      const statusData = (await statusRes.json()) as InstagramStatusResponse;

      if (statusData.status_code === 'FINISHED') {
        ready = true;
      } else if (statusData.status_code === 'ERROR') {
        return { success: false, error: 'Instagram media processing failed.' };
      }
      attempts++;
    }

    if (!ready) {
      return { success: false, error: 'Instagram media processing timed out.' };
    }

    // Step 3: Publish
    const publishRes = await fetch(`https://graph.facebook.com/v22.0/${igUserId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });
    const publishData = (await publishRes.json()) as InstagramPublishResponse;

    if (publishData.error) {
      logger.error({ error: publishData.error }, 'Instagram publish failed');
      return { success: false, error: publishData.error.message };
    }

    logger.info({ postId: publishData.id }, 'Instagram post published');
    return { success: true, postId: publishData.id };
  } catch (err) {
    logger.error({ err }, 'Instagram publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
