import { logger } from '../../config/logger.js';

/**
 * TikTok Content Posting API v2 — "Pull from URL" flow.
 *
 * Unlike other publishers, TikTok is ASYNC:
 *   1. We call /publish/inbox/video/init/ with the Cloudinary video URL
 *   2. TikTok returns a publish_id
 *   3. TikTok downloads the video in the background
 *   4. We poll /publish/status/fetch/ until PUBLISH_COMPLETE or FAILED
 *
 * This publisher handles steps 1-2 only. Step 3-4 is handled by the
 * status poller in scheduler.service.ts.
 */

// --- TikTok API response types ---

interface TikTokPublishInitResponse {
  data?: {
    publish_id?: string;
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

export interface TikTokPublishStatusResponse {
  data?: {
    status?:
      | 'PROCESSING_UPLOAD'
      | 'PROCESSING_DOWNLOAD'
      | 'SEND_TO_USER_INBOX'
      | 'PUBLISH_COMPLETE'
      | 'FAILED';
    fail_reason?: string;
    publicaly_available_post_id?: string[]; // TikTok's typo, not ours
    uploaded_bytes?: number;
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

// --- TikTok error code → user-friendly message mapping ---

const TIKTOK_ERROR_MESSAGES: Record<string, string> = {
  spam_risk_too_many_posts: 'Daily TikTok post limit reached. Try again tomorrow.',
  spam_risk_user_banned_from_posting: 'Your TikTok account is restricted from posting.',
  video_format_check_failed: 'Video format not supported by TikTok.',
  duration_check_failed: "Video exceeds TikTok's 10-minute limit.",
  photo_upload_limit_exceeded: 'TikTok photo upload limit exceeded.',
  privacy_level_option_mismatch: 'The selected privacy level is not available for your account.',
  reached_active_user_cap: 'TikTok is rate-limiting uploads. Try again later.',
  unaudited_client_can_only_post_to_private_accounts:
    'TikTok app is in sandbox mode — can only post to private accounts.',
  url_download_failed: 'TikTok could not download the video. Check the URL is publicly accessible.',
};

function friendlyError(code?: string, message?: string): string {
  if (code && TIKTOK_ERROR_MESSAGES[code]) return TIKTOK_ERROR_MESSAGES[code];
  if (message) return `TikTok error: ${message}`;
  return 'TikTok publish failed — unknown error';
}

// --- Publisher types ---

export interface TikTokPublishParams {
  accessToken: string;
  videoUrl: string; // Cloudinary URL — TikTok will download from this
  caption: string; // max 4000 chars, includes #hashtags
  privacyLevel?:
    | 'PUBLIC_TO_EVERYONE'
    | 'MUTUAL_FOLLOW_FRIENDS'
    | 'FOLLOWER_OF_CREATOR'
    | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  brandContentToggle?: boolean;
  brandOrganicToggle?: boolean;
  isAigc?: boolean;
  coverImageIndex?: number; // 0-based frame index for cover image
}

interface PublishResult {
  success: boolean;
  publishId?: string; // TikTok's async publish tracking ID
  error?: string;
}

/**
 * Initiate a TikTok video publish via the Content Posting API v2 (pull from URL).
 *
 * Returns a publish_id that must be polled for completion status.
 * This is NOT a synchronous publish — the video is still processing after this returns.
 */
export async function publishToTikTok(params: TikTokPublishParams): Promise<PublishResult> {
  const {
    accessToken,
    videoUrl,
    caption,
    privacyLevel = 'PUBLIC_TO_EVERYONE',
    disableComment = false,
    disableDuet = false,
    disableStitch = false,
    brandContentToggle = false,
    brandOrganicToggle = false,
    isAigc = false,
    coverImageIndex,
  } = params;

  try {
    if (!videoUrl) {
      return { success: false, error: 'TikTok requires a video — no video URL provided' };
    }

    if (caption.length > 4000) {
      return { success: false, error: 'TikTok caption exceeds 4000 character limit' };
    }

    // Build the publish request body per TikTok Content Posting API v2
    const postInfo: Record<string, unknown> = {
      title: caption.slice(0, 4000),
      privacy_level: privacyLevel,
      disable_comment: disableComment,
      disable_duet: disableDuet,
      disable_stitch: disableStitch,
      brand_content_toggle: brandContentToggle,
      brand_organic_toggle: brandOrganicToggle,
      is_aigc: isAigc,
    };

    // Cover image: specific frame from video (0-based index)
    if (coverImageIndex !== undefined && coverImageIndex >= 0) {
      postInfo.video_cover_timestamp_ms = coverImageIndex;
    }

    const body = {
      post_info: postInfo,
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    };

    logger.info(
      { videoUrl: videoUrl.slice(0, 80), captionLength: caption.length, privacyLevel },
      'Initiating TikTok publish (pull from URL)',
    );

    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await res.json()) as TikTokPublishInitResponse;

    if (data.error?.code || !data.data?.publish_id) {
      const errorMsg = friendlyError(data.error?.code, data.error?.message);
      logger.error({ error: data.error, logId: data.error?.log_id }, 'TikTok publish init failed');
      return { success: false, error: errorMsg };
    }

    const publishId = data.data.publish_id;
    logger.info({ publishId }, 'TikTok publish initiated — video is being processed');

    return { success: true, publishId };
  } catch (err) {
    logger.error({ err }, 'TikTok publish exception');
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Check the status of an async TikTok publish.
 * Called by the polling job in scheduler.service.ts.
 */
export async function checkTikTokPublishStatus(
  accessToken: string,
  publishId: string,
): Promise<TikTokPublishStatusResponse> {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
    signal: AbortSignal.timeout(15_000),
  });

  return (await res.json()) as TikTokPublishStatusResponse;
}
