import { eq, and, ilike, or, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { providerRegistry } from './ai/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

// --- Channel seed ---

const DEFAULT_CHANNELS = [
  {
    name: 'Twitter / X',
    slug: 'twitter',
    type: 'twitter',
    icon: '🐦',
    config: {
      charLimit: 25000,
      optimalCharLimit: 280,
      format: 'short-form',
      imageWidth: 1200,
      imageHeight: 675,
      aspectRatio: '1.91:1',
    },
  },
  {
    name: 'LinkedIn',
    slug: 'linkedin',
    type: 'linkedin',
    icon: '💼',
    config: {
      charLimit: 3000,
      optimalCharLimit: 1500,
      format: 'professional',
      imageWidth: 1200,
      imageHeight: 627,
      aspectRatio: '1.91:1',
    },
  },
  {
    name: 'Email',
    slug: 'email',
    type: 'email',
    icon: '📧',
    config: { charLimit: 0, format: 'html', imageWidth: 600 },
  },
  {
    name: 'Blog',
    slug: 'blog',
    type: 'blog',
    icon: '📝',
    config: { charLimit: 0, format: 'long-form' },
  },
  {
    name: 'Instagram',
    slug: 'instagram',
    type: 'instagram',
    icon: '📸',
    config: {
      charLimit: 2200,
      optimalCharLimit: 125,
      format: 'visual',
      imageWidth: 1080,
      imageHeight: 1080,
      aspectRatio: '1:1',
    },
  },
  {
    name: 'Facebook',
    slug: 'facebook',
    type: 'facebook',
    icon: '📘',
    config: {
      charLimit: 63000,
      optimalCharLimit: 80,
      format: 'social',
      imageWidth: 1200,
      imageHeight: 630,
      aspectRatio: '1.91:1',
    },
  },
  {
    name: 'Pinterest',
    slug: 'pinterest',
    type: 'pinterest',
    icon: '📌',
    config: {
      charLimit: 500,
      format: 'visual',
      imageWidth: 1000,
      imageHeight: 1500,
      aspectRatio: '2:3',
    },
  },
  {
    name: 'TikTok',
    slug: 'tiktok',
    type: 'tiktok',
    icon: '🎵',
    config: {
      charLimit: 4000,
      format: 'video-caption',
      imageWidth: 1080,
      imageHeight: 1920,
      aspectRatio: '9:16',
    },
  },
  {
    name: 'Threads',
    slug: 'threads',
    type: 'threads',
    icon: '🧵',
    config: {
      charLimit: 500,
      format: 'short-form',
      imageWidth: 1200,
      imageHeight: 600,
      aspectRatio: '2:1',
    },
  },
  {
    name: 'Bluesky',
    slug: 'bluesky',
    type: 'bluesky',
    icon: '🦋',
    config: { charLimit: 300, format: 'short-form', maxImages: 4, maxImageSizeMb: 1 },
  },
  {
    name: 'YouTube',
    slug: 'youtube',
    type: 'youtube',
    icon: '▶️',
    config: {
      charLimit: 5000,
      titleCharLimit: 100,
      format: 'video-description',
      imageWidth: 1280,
      imageHeight: 720,
      aspectRatio: '16:9',
    },
  },
];

export async function seedChannels(): Promise<void> {
  for (const ch of DEFAULT_CHANNELS) {
    const existing = await db.query.channels.findFirst({
      where: eq(schema.channels.slug, ch.slug),
    });
    if (!existing) {
      await db.insert(schema.channels).values(ch);
      logger.info({ channel: ch.name }, 'Channel seeded');
    }
  }
}

// --- Channel queries ---

export async function listChannels() {
  return db.query.channels.findMany({
    where: eq(schema.channels.isActive, true),
    orderBy: schema.channels.name,
  });
}

// --- Content CRUD ---

interface CreateContentData {
  userId: string;
  flowId?: string;
  channelId?: string;
  title: string;
  body: string;
  contentType?: string;
  status?: string;
  imageUrl?: string;
  sourceContentId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export async function createContentItem(data: CreateContentData) {
  const [item] = await db
    .insert(schema.contentItems)
    .values({
      userId: data.userId,
      flowId: data.flowId ?? null,
      channelId: data.channelId ?? null,
      title: data.title,
      body: data.body,
      contentType: data.contentType ?? 'markdown',
      status: data.status ?? 'draft',
      imageUrl: data.imageUrl ?? null,
      sourceContentId: data.sourceContentId ?? null,
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
    })
    .returning();

  return item;
}

/**
 * Create content items for multiple platforms at once.
 * Returns all created items with the first as the canonical "source".
 */
export async function createMultiPlatformContent(data: {
  userId: string;
  title: string;
  mainBody: string;
  platformBodies: Record<string, string>; // channelId -> adapted body
  imageUrl?: string;
  status?: string;
}) {
  const channelIds = Object.keys(data.platformBodies);
  if (channelIds.length === 0) return [];

  // Create the canonical (first) item
  const [canonical] = await db
    .insert(schema.contentItems)
    .values({
      userId: data.userId,
      channelId: channelIds[0],
      title: data.title,
      body: data.platformBodies[channelIds[0]],
      imageUrl: data.imageUrl ?? null,
      status: data.status ?? 'draft',
    })
    .returning();

  const results = [canonical];

  // Create derived items linked to canonical
  for (let i = 1; i < channelIds.length; i++) {
    const [item] = await db
      .insert(schema.contentItems)
      .values({
        userId: data.userId,
        channelId: channelIds[i],
        title: data.title,
        body: data.platformBodies[channelIds[i]],
        imageUrl: data.imageUrl ?? null,
        sourceContentId: canonical.id,
        status: data.status ?? 'draft',
      })
      .returning();
    results.push(item);
  }

  return results;
}

interface ListContentOptions {
  userId: string;
  channelId?: string;
  status?: string;
  search?: string;
}

export async function listContentItems(options: ListContentOptions) {
  const conditions = [eq(schema.contentItems.userId, options.userId)];

  if (options.channelId) {
    conditions.push(eq(schema.contentItems.channelId, options.channelId));
  }
  if (options.status) {
    conditions.push(eq(schema.contentItems.status, options.status));
  }
  if (options.search) {
    conditions.push(
      or(
        ilike(schema.contentItems.title, `%${options.search}%`),
        ilike(schema.contentItems.body, `%${options.search}%`),
      )!,
    );
  }

  return db.query.contentItems.findMany({
    where: and(...conditions),
    orderBy: [desc(schema.contentItems.createdAt)],
  });
}

export async function getContentItem(id: string, userId: string) {
  const item = await db.query.contentItems.findFirst({
    where: eq(schema.contentItems.id, id),
  });

  if (!item) throw new NotFoundError('Content item not found');
  if (item.userId !== userId) throw new ForbiddenError('Access denied');

  return item;
}

interface UpdateContentData {
  title?: string;
  body?: string;
  channelId?: string | null;
  status?: string;
  tags?: string[];
}

export async function updateContentItem(id: string, data: UpdateContentData, userId: string) {
  const item = await getContentItem(id, userId);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.body !== undefined) updates.body = data.body;
  if (data.channelId !== undefined) updates.channelId = data.channelId;
  if (data.status !== undefined) updates.status = data.status;
  if (data.tags !== undefined) updates.tags = data.tags;

  const [updated] = await db
    .update(schema.contentItems)
    .set(updates)
    .where(eq(schema.contentItems.id, item.id))
    .returning();

  return updated;
}

export async function deleteContentItem(id: string, userId: string) {
  await getContentItem(id, userId);
  await db.delete(schema.contentItems).where(eq(schema.contentItems.id, id));
}

// --- Quick-start template generation ---

const TEMPLATE_CATEGORIES = [
  'product-launch',
  'behind-the-scenes',
  'tips-and-tricks',
  'announcement',
] as const;
type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Hardcoded fallback skeletons — used when AI fails */
const FALLBACK_SKELETONS: Record<TemplateCategory, { title: string; body: string }> = {
  'product-launch': {
    title: 'New Feature Announcement',
    body: "We're excited to announce [FEATURE NAME] — designed to help you [KEY BENEFIT].\n\nHere's what's new:\n- [Feature 1]\n- [Feature 2]\n- [Feature 3]\n\nTry it today and let us know what you think!",
  },
  'behind-the-scenes': {
    title: 'Behind the Scenes',
    body: "Here's something most people don't see — the real work behind [PROJECT/PRODUCT].\n\nThis week I've been working on [TASK]. What surprised me most was [INSIGHT].\n\nThe lesson? [TAKEAWAY]\n\nWhat does your behind-the-scenes look like?",
  },
  'tips-and-tricks': {
    title: 'Quick Tips',
    body: '3 things I wish I knew earlier about [TOPIC]:\n\n1. [TIP 1] — This alone saved me [TIME/MONEY/EFFORT].\n\n2. [TIP 2] — Most people overlook this, but it makes a huge difference.\n\n3. [TIP 3] — Simple to implement, high impact.\n\nWhich one resonates most? Drop a comment below.',
  },
  announcement: {
    title: 'Big News',
    body: "Big news — [ANNOUNCEMENT]!\n\nAfter [TIMEFRAME] of [EFFORT], we're thrilled to share that [DETAILS].\n\nWhat this means for you: [BENEFIT]\n\nStay tuned for more updates. We're just getting started.",
  },
};

function isValidTemplateCategory(category: string): category is TemplateCategory {
  return TEMPLATE_CATEGORIES.includes(category as TemplateCategory);
}

/**
 * Generate a quick-start content template using AI.
 * Falls back to a hardcoded skeleton if AI fails.
 */
export async function generateTemplate(data: {
  category: string;
  model?: string;
  context?: string;
}): Promise<{ title: string; body: string; source: 'ai' | 'fallback' }> {
  if (!isValidTemplateCategory(data.category)) {
    throw new Error(
      `Invalid template category: ${data.category}. Valid: ${TEMPLATE_CATEGORIES.join(', ')}`,
    );
  }

  const fallback = FALLBACK_SKELETONS[data.category];

  const systemPrompt =
    'You are a content strategist and copywriter. Generate a ready-to-edit content draft based on the requested template type. ' +
    'Return ONLY a JSON object with "title" (string, max 80 chars) and "body" (string, the full post content, 150-400 words). ' +
    'The content should be engaging, specific, and feel like a real post — not generic filler. ' +
    'Do not include markdown code fences, explanation, or anything outside the JSON object.';

  const categoryDescriptions: Record<TemplateCategory, string> = {
    'product-launch':
      'A product launch or feature announcement post. Exciting, benefit-driven, with a clear CTA.',
    'behind-the-scenes':
      'A behind-the-scenes look at the work, process, or journey. Authentic, personal, builds trust.',
    'tips-and-tricks':
      'A practical tips post sharing lessons learned or actionable advice. Numbered, scannable, valuable.',
    announcement:
      'A company or personal announcement — milestone, news, or update. Celebratory yet professional.',
  };

  const userMessage = [
    `Generate a "${data.category}" template.`,
    `Style: ${categoryDescriptions[data.category]}`,
    data.context ? `Additional context from the user: ${data.context}` : '',
    'Make it feel real and specific — avoid generic placeholder text where possible.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const startTime = Date.now();
    const response = await providerRegistry.complete({
      model: data.model || 'claude-haiku-4-5-20251001',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      maxTokens: 1000,
    });

    const content = response.content.trim();
    const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr) as { title: string; body: string };

    if (!parsed.title || !parsed.body) {
      throw new Error('AI response missing title or body');
    }

    const latencyMs = Date.now() - startTime;
    logger.info(
      { category: data.category, model: data.model || 'claude-haiku-4-5-20251001', latencyMs },
      'Template generated via AI',
    );

    return { title: parsed.title, body: parsed.body, source: 'ai' };
  } catch (err) {
    logger.error(
      { err, category: data.category },
      'AI template generation failed, returning fallback skeleton',
    );
    return { ...fallback, source: 'fallback' };
  }
}

/**
 * Generate platform-adapted content using AI.
 * Takes a main body and adapts it for multiple channels via the AI provider registry.
 */
export async function generateMultiPlatformContent(data: {
  mainBody: string;
  channelIds: string[];
  model?: string;
  userId: string;
}): Promise<Record<string, string>> {
  // 1. Load all channel configs for the given channelIds
  const channels: Array<{ id: string; name: string; config: Record<string, unknown> }> = [];

  for (const channelId of data.channelIds) {
    const channel = await db.query.channels.findFirst({
      where: eq(schema.channels.id, channelId),
    });

    if (!channel) {
      logger.warn({ channelId }, 'Channel not found during multi-platform generation');
      continue;
    }

    channels.push({
      id: channel.id,
      name: channel.name,
      config: channel.config as Record<string, unknown>,
    });
  }

  // If no valid channels found, return mainBody for all requested IDs
  if (channels.length === 0) {
    const fallback: Record<string, string> = {};
    for (const channelId of data.channelIds) {
      fallback[channelId] = data.mainBody;
    }
    return fallback;
  }

  // 2. Build system prompt
  const systemPrompt =
    'You are a content adaptation expert. Adapt the following content for multiple social media platforms. ' +
    'Return ONLY a valid JSON object where each key is the channel ID and the value is the adapted content. ' +
    'Do not include any other text, markdown formatting, or code fences.';

  // 3. Build user message with channel details
  const channelDescriptions = channels
    .map((ch) => {
      const cfg = ch.config;
      const charLimit = typeof cfg.charLimit === 'number' ? cfg.charLimit : 'unlimited';
      const optimalCharLimit =
        typeof cfg.optimalCharLimit === 'number' ? cfg.optimalCharLimit : null;
      const format = typeof cfg.format === 'string' ? cfg.format : 'general';

      let desc = `Channel ${ch.id} (${ch.name}): Max ${charLimit} chars`;
      if (optimalCharLimit) desc += `, optimal ${optimalCharLimit}`;
      desc += `, format: ${format}`;

      // Platform-specific hints
      if (ch.name.toLowerCase().includes('twitter') || ch.name.toLowerCase().includes('x')) {
        desc += '. Use hashtags, be punchy.';
      } else if (ch.name.toLowerCase().includes('linkedin')) {
        desc += '. Professional tone, use line breaks for readability.';
      } else if (ch.name.toLowerCase().includes('instagram')) {
        desc += '. Use emojis, hashtags at the end, engaging caption style.';
      } else if (ch.name.toLowerCase().includes('email')) {
        desc += '. Clear subject-worthy opening, conversational but professional.';
      } else if (ch.name.toLowerCase().includes('blog')) {
        desc += '. Long-form, well-structured with headers if appropriate.';
      } else if (ch.name.toLowerCase().includes('tiktok')) {
        desc += '. Casual, hook-driven, Gen-Z friendly tone.';
      } else if (ch.name.toLowerCase().includes('facebook')) {
        desc += '. Conversational, encourage engagement.';
      } else if (ch.name.toLowerCase().includes('threads')) {
        desc += '. Concise, conversational, thread-friendly.';
      } else if (ch.name.toLowerCase().includes('bluesky')) {
        desc += '. Short and conversational, no hashtags.';
      } else if (ch.name.toLowerCase().includes('pinterest')) {
        desc += '. Descriptive, keyword-rich for search.';
      } else if (ch.name.toLowerCase().includes('youtube')) {
        desc += '. SEO-friendly description with keywords.';
      }

      return desc;
    })
    .join('\n');

  const userMessage =
    `Original content:\n\n${data.mainBody}\n\n` +
    `Adapt this content for the following platforms:\n\n${channelDescriptions}`;

  // 4. Call AI provider registry
  try {
    const response = await providerRegistry.complete({
      model: data.model || 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      maxTokens: 4000,
    });

    // 5. Parse the JSON response
    const content = response.content.trim();
    // Strip potential markdown code fences
    const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr) as Record<string, string>;

    // Build result ensuring all requested channelIds have a value
    const result: Record<string, string> = {};
    for (const channelId of data.channelIds) {
      result[channelId] = typeof parsed[channelId] === 'string' ? parsed[channelId] : data.mainBody;
    }

    logger.info(
      { channelCount: data.channelIds.length, model: data.model || 'claude-sonnet-4-6' },
      'Multi-platform content generated via AI',
    );

    return result;
  } catch (err) {
    // 6. Fallback: if AI call or JSON parse fails, return original mainBody for each channel
    logger.error({ err }, 'AI multi-platform generation failed, falling back to original content');
    const fallback: Record<string, string> = {};
    for (const channelId of data.channelIds) {
      fallback[channelId] = data.mainBody;
    }
    return fallback;
  }
}
