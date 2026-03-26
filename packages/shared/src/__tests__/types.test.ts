import { describe, it, expect } from 'vitest';
import type { PlatformId, ChannelConfig } from '../types/content.types';

describe('Shared types', () => {
  it('PlatformId accepts valid platform slugs', () => {
    const platforms: PlatformId[] = [
      'twitter',
      'linkedin',
      'instagram',
      'facebook',
      'pinterest',
      'tiktok',
      'threads',
      'bluesky',
      'youtube',
      'blog',
      'email',
    ];
    expect(platforms).toHaveLength(11);
  });

  it('ChannelConfig shape is valid', () => {
    const config: ChannelConfig = {
      charLimit: 280,
      optimalCharLimit: 100,
      format: 'short-form',
      imageWidth: 1200,
      imageHeight: 675,
      aspectRatio: '1.91:1',
    };
    expect(config.charLimit).toBe(280);
    expect(config.format).toBe('short-form');
  });

  it('ChannelConfig works with minimal fields', () => {
    const config: ChannelConfig = {
      charLimit: 0,
      format: 'long-form',
    };
    expect(config.charLimit).toBe(0);
    expect(config.imageWidth).toBeUndefined();
  });
});
