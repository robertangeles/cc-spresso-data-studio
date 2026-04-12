import { logger } from '../../config/logger.js';

interface PublishResult {
  success: boolean;
  videoId?: string;
  error?: string;
}

/**
 * Upload a video to YouTube via the Data API v3 resumable upload.
 * The video file is fetched from a URL (Cloudinary) and streamed to YouTube.
 */
export async function publishToYouTube(params: {
  accessToken: string;
  title: string;
  description: string;
  tags?: string[];
  videoUrl: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  categoryId?: string;
}): Promise<PublishResult> {
  const {
    accessToken,
    title,
    description,
    tags = [],
    videoUrl,
    privacyStatus = 'public',
    categoryId = '22', // People & Blogs
  } = params;

  try {
    if (!videoUrl) {
      return { success: false, error: 'YouTube requires a video file' };
    }

    // Step 1: Download the video from Cloudinary (2 min timeout)
    logger.info({ videoUrl: videoUrl.slice(0, 100) }, 'Downloading video for YouTube upload');
    const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!videoRes.ok) {
      return { success: false, error: `Failed to download video: ${videoRes.status}` };
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const contentType = videoRes.headers.get('content-type') || 'video/mp4';

    // Step 2: Initiate resumable upload
    const metadata = {
      snippet: {
        title: title.slice(0, 100),
        description: description.slice(0, 5000),
        tags: tags.slice(0, 30),
        categoryId,
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(videoBuffer.length),
          'X-Upload-Content-Type': contentType,
        },
        body: JSON.stringify(metadata),
        signal: AbortSignal.timeout(30_000), // 30s for init
      },
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      logger.error({ status: initRes.status, body: err }, 'YouTube upload init failed');
      return { success: false, error: `YouTube upload init failed: ${initRes.status}` };
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      return { success: false, error: 'YouTube did not return an upload URL' };
    }

    // Step 3: Upload the video (5 min timeout)
    logger.info({ size: videoBuffer.length }, 'Uploading video to YouTube');
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(videoBuffer.length),
      },
      body: videoBuffer,
      signal: AbortSignal.timeout(300_000),
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      logger.error({ status: uploadRes.status, body: err }, 'YouTube video upload failed');
      return { success: false, error: `YouTube upload failed: ${uploadRes.status}` };
    }

    const result = (await uploadRes.json()) as { id?: string };
    logger.info({ videoId: result.id }, 'YouTube video uploaded');

    return { success: true, videoId: result.id };
  } catch (err) {
    logger.error({ err }, 'YouTube publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
