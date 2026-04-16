import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock logger to suppress output
vi.mock('../../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { publishToTikTok, checkTikTokPublishStatus } from '../publishers/tiktok.publisher.js';

describe('TikTok Publisher', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T7: init upload → publish_id returned
  it('should initiate publish and return publish_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { publish_id: 'pub_12345' },
      }),
    });

    const result = await publishToTikTok({
      accessToken: 'test-token',
      videoUrl: 'https://res.cloudinary.com/test/video/upload/test.mp4',
      caption: 'Hello TikTok! #test',
    });

    expect(result.success).toBe(true);
    expect(result.publishId).toBe('pub_12345');
    expect(result.error).toBeUndefined();

    // Verify the API was called with correct params
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-token');

    const body = JSON.parse(options.body);
    expect(body.source_info.source).toBe('PULL_FROM_URL');
    expect(body.source_info.video_url).toBe(
      'https://res.cloudinary.com/test/video/upload/test.mp4',
    );
    expect(body.post_info.title).toBe('Hello TikTok! #test');
    expect(body.post_info.privacy_level).toBe('PUBLIC_TO_EVERYONE');
  });

  // T8: video URL missing → error
  it('should return error when no video URL provided', async () => {
    const result = await publishToTikTok({
      accessToken: 'test-token',
      videoUrl: '',
      caption: 'No video',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('TikTok requires a video');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return error when caption exceeds 4000 chars', async () => {
    const result = await publishToTikTok({
      accessToken: 'test-token',
      videoUrl: 'https://example.com/video.mp4',
      caption: 'x'.repeat(4001),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('4000 character limit');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // T10: daily quota exceeded → RateLimitError
  it('should return friendly error for known TikTok error codes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: {
          code: 'spam_risk_too_many_posts',
          message: 'Too many posts',
          log_id: 'log123',
        },
      }),
    });

    const result = await publishToTikTok({
      accessToken: 'test-token',
      videoUrl: 'https://example.com/video.mp4',
      caption: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Daily TikTok post limit reached');
  });

  it('should pass all TikTok Web Studio fields to the API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { publish_id: 'pub_999' } }),
    });

    await publishToTikTok({
      accessToken: 'test-token',
      videoUrl: 'https://example.com/video.mp4',
      caption: 'Branded content',
      privacyLevel: 'FOLLOWER_OF_CREATOR',
      disableComment: true,
      disableDuet: true,
      disableStitch: false,
      brandContentToggle: true,
      brandOrganicToggle: false,
      isAigc: true,
      coverImageIndex: 5000,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.post_info.privacy_level).toBe('FOLLOWER_OF_CREATOR');
    expect(body.post_info.disable_comment).toBe(true);
    expect(body.post_info.disable_duet).toBe(true);
    expect(body.post_info.disable_stitch).toBe(false);
    expect(body.post_info.brand_content_toggle).toBe(true);
    expect(body.post_info.brand_organic_toggle).toBe(false);
    expect(body.post_info.is_aigc).toBe(true);
    expect(body.post_info.video_cover_timestamp_ms).toBe(5000);
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await publishToTikTok({
      accessToken: 'test-token',
      videoUrl: 'https://example.com/video.mp4',
      caption: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
  });

  describe('checkTikTokPublishStatus', () => {
    // T11: PUBLISH_COMPLETE
    it('should return PUBLISH_COMPLETE status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            status: 'PUBLISH_COMPLETE',
            publicaly_available_post_id: ['7123456789'],
          },
        }),
      });

      const result = await checkTikTokPublishStatus('token', 'pub_123');

      expect(result.data?.status).toBe('PUBLISH_COMPLETE');
      expect(result.data?.publicaly_available_post_id).toEqual(['7123456789']);

      // Verify correct API call
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/status/fetch/');
      const body = JSON.parse(options.body);
      expect(body.publish_id).toBe('pub_123');
    });

    // T12: FAILED with reason
    it('should return FAILED status with reason', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            status: 'FAILED',
            fail_reason: 'video_format_check_failed',
          },
        }),
      });

      const result = await checkTikTokPublishStatus('token', 'pub_456');

      expect(result.data?.status).toBe('FAILED');
      expect(result.data?.fail_reason).toBe('video_format_check_failed');
    });

    it('should return processing status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { status: 'PROCESSING_DOWNLOAD' },
        }),
      });

      const result = await checkTikTokPublishStatus('token', 'pub_789');
      expect(result.data?.status).toBe('PROCESSING_DOWNLOAD');
    });
  });
});
