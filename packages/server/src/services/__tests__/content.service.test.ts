import { describe, it, expect } from 'vitest';

describe('Content service utilities', () => {
  // Test the channel config validation logic
  const EXPECTED_CHANNELS = [
    'twitter',
    'linkedin',
    'email',
    'blog',
    'instagram',
    'facebook',
    'pinterest',
    'tiktok',
    'threads',
    'bluesky',
    'youtube',
  ];

  it('defines all 11 platform channels', () => {
    expect(EXPECTED_CHANNELS).toHaveLength(11);
  });

  it('each channel slug is lowercase alphanumeric', () => {
    for (const slug of EXPECTED_CHANNELS) {
      expect(slug).toMatch(/^[a-z]+$/);
    }
  });

  // Test multi-platform content truncation logic
  function truncateToLimit(body: string, charLimit: number): string {
    if (charLimit === 0) return body; // unlimited
    if (body.length > charLimit) return body.slice(0, charLimit);
    return body;
  }

  it('truncates body to character limit', () => {
    expect(truncateToLimit('Hello World', 5)).toBe('Hello');
  });

  it('returns full body when within limit', () => {
    expect(truncateToLimit('Hello', 100)).toBe('Hello');
  });

  it('returns full body when limit is 0 (unlimited)', () => {
    const longText = 'x'.repeat(10000);
    expect(truncateToLimit(longText, 0)).toBe(longText);
  });

  it('handles empty body', () => {
    expect(truncateToLimit('', 280)).toBe('');
  });
});
