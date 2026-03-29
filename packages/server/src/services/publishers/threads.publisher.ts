import { logger } from '../../config/logger.js';

interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Publish a post to Threads via the Threads API.
 * Two-step process: create media container → publish.
 */
export async function publishToThreads(params: {
  accessToken: string;
  threadsUserId: string;
  text: string;
  imageUrl?: string;
}): Promise<PublishResult> {
  const { accessToken, threadsUserId, text, imageUrl } = params;

  try {
    // Step 1: Create media container
    const containerBody: Record<string, string> = {
      media_type: imageUrl ? 'IMAGE' : 'TEXT',
      text,
      access_token: accessToken,
    };
    if (imageUrl) {
      containerBody.image_url = imageUrl;
    }

    const containerRes = await fetch(`https://graph.threads.net/v1.0/${threadsUserId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerBody),
    });
    const containerData = (await containerRes.json()) as any;

    if (containerData.error) {
      logger.error({ error: containerData.error }, 'Threads container creation failed');
      return {
        success: false,
        error: containerData.error.message || 'Failed to create Threads media container',
      };
    }

    const containerId = containerData.id;

    // Step 2: Wait briefly for container processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 3: Publish the container
    const publishRes = await fetch(
      `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      },
    );
    const publishData = (await publishRes.json()) as any;

    if (publishData.error) {
      logger.error({ error: publishData.error }, 'Threads publish failed');
      return {
        success: false,
        error: publishData.error.message || 'Failed to publish to Threads',
      };
    }

    logger.info({ postId: publishData.id }, 'Threads post published');
    return { success: true, postId: publishData.id };
  } catch (err) {
    logger.error({ err }, 'Threads publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
