// Channel configuration stored in channels.config JSONB
export interface ChannelConfig {
  charLimit: number;
  optimalCharLimit?: number;
  format: string;
  imageWidth?: number;
  imageHeight?: number;
  aspectRatio?: string;
  maxImages?: number;
  maxImageSizeMb?: number;
  titleCharLimit?: number;
}

// Platform identifiers matching channel slugs
export type PlatformId =
  | 'twitter'
  | 'linkedin'
  | 'email'
  | 'blog'
  | 'instagram'
  | 'facebook'
  | 'pinterest'
  | 'tiktok'
  | 'threads'
  | 'bluesky'
  | 'youtube';

// Prompt Library types
export interface PromptSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  defaultModel: string | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  body: string;
  defaultModel: string | null;
  changelog: string | null;
  createdAt: string;
}

export interface PromptDetail extends PromptSummary {
  body: string;
  isActive: boolean;
  versions?: PromptVersion[];
}

// Scheduled post types
export interface ScheduledPost {
  id: string;
  userId: string;
  contentItemId: string;
  channelId: string | null;
  scheduledAt: string;
  status: 'pending' | 'published' | 'failed' | 'cancelled';
  publishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// Content Builder state types
export interface ContentBuilderPost {
  title: string;
  mainBody: string;
  platformBodies: Record<string, string>;
  imageUrl: string | null;
  selectedChannels: string[];
}
