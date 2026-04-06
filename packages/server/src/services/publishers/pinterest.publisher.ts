import { logger } from '../../config/logger.js';

interface PinterestPinResponse {
  id?: string;
  code?: number;
  message?: string;
}

interface PublishResult {
  success: boolean;
  pinId?: string;
  error?: string;
}

/**
 * Create a Pin on Pinterest via the v5 API.
 * Requires an image — Pinterest pins must have media.
 */
export async function publishToPinterest(params: {
  accessToken: string;
  title: string;
  description: string;
  imageUrl?: string;
  boardId?: string;
  link?: string;
}): Promise<PublishResult> {
  const { accessToken, title, description, imageUrl, boardId, link } = params;

  try {
    if (!imageUrl) {
      return { success: false, error: 'Pinterest pins require an image' };
    }

    const pinBody: Record<string, unknown> = {
      title: title.slice(0, 100),
      description: description.slice(0, 500),
      media_source: {
        source_type: 'image_url',
        url: imageUrl,
      },
    };

    if (boardId) {
      pinBody.board_id = boardId;
    }

    if (link) {
      pinBody.link = link;
    }

    const res = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pinBody),
    });

    const data = (await res.json()) as PinterestPinResponse;

    if (!res.ok || data.code) {
      logger.error({ error: data }, 'Pinterest pin creation failed');
      return { success: false, error: data.message || 'Failed to create pin' };
    }

    logger.info({ pinId: data.id }, 'Pinterest pin created');
    return { success: true, pinId: data.id };
  } catch (err) {
    logger.error({ err }, 'Pinterest publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
