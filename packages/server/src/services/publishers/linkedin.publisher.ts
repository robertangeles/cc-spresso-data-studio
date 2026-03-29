import { logger } from '../../config/logger.js';

const LINKEDIN_API = 'https://api.linkedin.com/rest';
const LINKEDIN_VERSION = '202602';

interface PublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Upload an image to LinkedIn and return the image URN.
 */
async function uploadImage(
  accessToken: string,
  memberId: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    // Step 1: Initialize upload
    const initRes = await fetch(`${LINKEDIN_API}/images?action=initializeUpload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: `urn:li:person:${memberId}`,
        },
      }),
    });
    const initData = (await initRes.json()) as any;

    if (!initData.value?.uploadUrl || !initData.value?.image) {
      logger.warn({ initData }, 'LinkedIn image upload init failed');
      return null;
    }

    const uploadUrl = initData.value.uploadUrl;
    const imageUrn = initData.value.image;

    // Step 2: Fetch and upload the image binary
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      logger.warn({ imageUrl, status: imgRes.status }, 'Failed to fetch image for LinkedIn upload');
      return null;
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': imgRes.headers.get('content-type') ?? 'image/jpeg',
      },
      body: imgBuffer,
    });

    if (!uploadRes.ok) {
      logger.warn({ status: uploadRes.status }, 'LinkedIn image binary upload failed');
      return null;
    }

    return imageUrn;
  } catch (err) {
    logger.warn({ err }, 'LinkedIn image upload exception');
    return null;
  }
}

/**
 * Publish a post to LinkedIn via the Posts API.
 * Supports text-only and text + image posts.
 */
export async function publishToLinkedIn(params: {
  accessToken: string;
  memberId: string;
  text: string;
  imageUrl?: string;
  accountType?: string;
}): Promise<PublishResult> {
  const { accessToken, memberId, text, imageUrl, accountType } = params;

  try {
    const author =
      accountType === 'page' ? `urn:li:organization:${memberId}` : `urn:li:person:${memberId}`;

    const postBody: Record<string, unknown> = {
      author,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
    };

    // Upload and attach image if provided
    if (imageUrl) {
      const imageUrn = await uploadImage(accessToken, memberId, imageUrl);
      if (imageUrn) {
        postBody.content = {
          media: {
            title: text.slice(0, 100),
            id: imageUrn,
          },
        };
      }
    }

    const res = await fetch(`${LINKEDIN_API}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    });

    if (res.status === 201) {
      const postId = res.headers.get('x-restli-id') ?? 'unknown';
      logger.info({ postId }, 'LinkedIn post published');
      return { success: true, postId };
    }

    const data = (await res.json()) as any;
    logger.error({ error: data }, 'LinkedIn post failed');
    return { success: false, error: data.message || data.error || 'Failed to post to LinkedIn' };
  } catch (err) {
    logger.error({ err }, 'LinkedIn publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
