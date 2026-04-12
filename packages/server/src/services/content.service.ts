import { eq, and, ilike, or, desc, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { providerRegistry } from './ai/index.js';
import { withSessionGate } from './session-gate.service.js';
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
  videoUrl?: string;
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
      videoUrl: data.videoUrl ?? null,
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
  videoUrl?: string;
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
      videoUrl: data.videoUrl ?? null,
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
        videoUrl: data.videoUrl ?? null,
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
  const item = await getContentItem(id, userId);

  // Clean up Cloudinary image if one exists
  if (item.imageUrl) {
    try {
      const { deleteImage, extractPublicId } = await import('./cloudinary.service.js');
      const publicId = extractPublicId(item.imageUrl);
      if (publicId) await deleteImage(publicId);
    } catch (err) {
      logger.warn(
        { err, contentId: id },
        'Failed to delete Cloudinary image during content cleanup',
      );
    }
  }

  await db.delete(schema.contentItems).where(eq(schema.contentItems.id, id));
}

export async function deleteBatchContentItems(ids: string[], userId: string) {
  // Verify ownership: only delete items belonging to this user
  const owned = await db
    .select({ id: schema.contentItems.id, imageUrl: schema.contentItems.imageUrl })
    .from(schema.contentItems)
    .where(and(inArray(schema.contentItems.id, ids), eq(schema.contentItems.userId, userId)));

  if (owned.length === 0) return 0;

  // Clean up Cloudinary images
  for (const item of owned) {
    if (item.imageUrl) {
      try {
        const { deleteImage, extractPublicId } = await import('./cloudinary.service.js');
        const publicId = extractPublicId(item.imageUrl);
        if (publicId) await deleteImage(publicId);
      } catch (err) {
        logger.warn(
          { err, contentId: item.id },
          'Failed to delete Cloudinary image during batch cleanup',
        );
      }
    }
  }

  const ownedIds = owned.map((o) => o.id);
  await db.delete(schema.contentItems).where(inArray(schema.contentItems.id, ownedIds));
  return ownedIds.length;
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
  userId?: string;
  role?: string;
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
    const completeFn = () =>
      providerRegistry.complete({
        model: data.model || 'anthropic/claude-haiku-4-5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.8,
        maxTokens: 1000,
      });

    const response = data.userId
      ? await withSessionGate(data.userId, data.role ?? 'Subscriber', completeFn)
      : await completeFn();

    const content = response.content.trim();
    const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr) as { title: string; body: string };

    if (!parsed.title || !parsed.body) {
      throw new Error('AI response missing title or body');
    }

    const latencyMs = Date.now() - startTime;
    logger.info(
      { category: data.category, model: data.model || 'anthropic/claude-haiku-4-5', latencyMs },
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
// --- Shared helpers for AI-powered content generation ---

interface ChannelInfo {
  id: string;
  name: string;
  config: Record<string, unknown>;
}

/**
 * Load channel records from DB for the given IDs.
 * Skips channels that don't exist (logs a warning).
 */
async function loadChannels(channelIds: string[]): Promise<ChannelInfo[]> {
  const channels: ChannelInfo[] = [];
  for (const channelId of channelIds) {
    const channel = await db.query.channels.findFirst({
      where: eq(schema.channels.id, channelId),
    });
    if (!channel) {
      logger.warn({ channelId }, 'Channel not found during content generation');
      continue;
    }
    channels.push({
      id: channel.id,
      name: channel.name,
      config: channel.config as Record<string, unknown>,
    });
  }
  return channels;
}

/**
 * Build platform-specific description strings for AI prompts.
 */
function buildChannelDescriptions(channels: ChannelInfo[]): string {
  return channels
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
      const name = ch.name.toLowerCase();
      if (name.includes('twitter') || name.includes('x')) {
        desc += '. Use hashtags, be punchy.';
      } else if (name.includes('linkedin')) {
        desc += '. Professional tone, use line breaks for readability.';
      } else if (name.includes('instagram')) {
        desc += '. Use emojis, hashtags at the end, engaging caption style.';
      } else if (name.includes('email')) {
        desc += '. Clear subject-worthy opening, conversational but professional.';
      } else if (name.includes('blog')) {
        desc += '. Long-form, well-structured with headers if appropriate.';
      } else if (name.includes('tiktok')) {
        desc += '. Casual, hook-driven, Gen-Z friendly tone.';
      } else if (name.includes('facebook')) {
        desc += '. Conversational, encourage engagement.';
      } else if (name.includes('threads')) {
        desc += '. Concise, conversational, thread-friendly.';
      } else if (name.includes('bluesky')) {
        desc += '. Short and conversational, no hashtags.';
      } else if (name.includes('pinterest')) {
        desc += '. Descriptive, keyword-rich for search.';
      } else if (name.includes('youtube')) {
        desc += '. SEO-friendly description with keywords.';
      }

      return desc;
    })
    .join('\n');
}

/**
 * Call AI to generate content for a single channel, returning the adapted text.
 * Used by remixContent() for streaming per-channel results.
 */
async function generateForSingleChannel(data: {
  sourceText: string;
  channel: ChannelInfo;
  systemPrompt: string;
  model: string;
  userId: string;
  role: string;
}): Promise<string> {
  const channelDesc = buildChannelDescriptions([data.channel]);
  const userMessage =
    `Source content:\n\n${data.sourceText}\n\n` +
    `Generate adapted content for this platform:\n\n${channelDesc}\n\n` +
    'Return ONLY the adapted content text. No JSON, no markdown fences, no extra commentary.';

  const response = await withSessionGate(data.userId, data.role, () =>
    providerRegistry.complete({
      model: data.model,
      messages: [
        { role: 'system', content: data.systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      maxTokens: 2000,
    }),
  );

  return response.content.trim();
}

/**
 * Parse AI JSON response, stripping markdown fences. Returns null on failure.
 */
function parseAIJsonResponse(content: string): Record<string, string> | null {
  try {
    const jsonStr = content
      .trim()
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, string>;
    return null;
  } catch {
    return null;
  }
}

// --- Multi-platform generation (batch, original API) ---

export async function generateMultiPlatformContent(data: {
  mainBody: string;
  channelIds: string[];
  model?: string;
  userId: string;
  role?: string;
}): Promise<Record<string, string>> {
  const channels = await loadChannels(data.channelIds);

  if (channels.length === 0) {
    const fallback: Record<string, string> = {};
    for (const channelId of data.channelIds) fallback[channelId] = data.mainBody;
    return fallback;
  }

  const systemPrompt =
    'You are a content adaptation expert. Adapt the following content for multiple social media platforms. ' +
    'Return ONLY a valid JSON object where each key is the channel ID and the value is the adapted content. ' +
    'Do not include any other text, markdown formatting, or code fences.';

  const channelDescriptions = buildChannelDescriptions(channels);
  const userMessage =
    `Original content:\n\n${data.mainBody}\n\n` +
    `Adapt this content for the following platforms:\n\n${channelDescriptions}`;

  try {
    const response = await withSessionGate(data.userId, data.role ?? 'Subscriber', () =>
      providerRegistry.complete({
        model: data.model || 'anthropic/claude-sonnet-4-6',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        maxTokens: 4000,
      }),
    );

    const parsed = parseAIJsonResponse(response.content);
    if (!parsed) {
      logger.warn('AI returned unparseable JSON, falling back to original content');
      const fallback: Record<string, string> = {};
      for (const channelId of data.channelIds) fallback[channelId] = data.mainBody;
      return fallback;
    }

    const result: Record<string, string> = {};
    for (const channelId of data.channelIds) {
      result[channelId] = typeof parsed[channelId] === 'string' ? parsed[channelId] : data.mainBody;
    }

    logger.info(
      { channelCount: data.channelIds.length, model: data.model || 'anthropic/claude-sonnet-4-6' },
      'Multi-platform content generated via AI',
    );

    return result;
  } catch (err) {
    logger.error({ err }, 'AI multi-platform generation failed, falling back to original content');
    const fallback: Record<string, string> = {};
    for (const channelId of data.channelIds) fallback[channelId] = data.mainBody;
    return fallback;
  }
}

// --- Remix: transform existing content with style + platform adaptation ---

export interface RemixConfig {
  sourceContentIds: string[];
  targetChannelIds: string[];
  style: string; // system prompt slug, e.g. 'remix-punchy'
  customPrompt?: string; // used when style === 'custom'
  userId: string;
  role?: string;
  model?: string;
}

export interface RemixProgressEvent {
  type: 'progress' | 'complete' | 'error';
  channelId?: string;
  channelName?: string;
  item?: Record<string, unknown>;
  totalCreated?: number;
  error?: string;
}

/**
 * Remix content: stream results per-channel via a callback.
 * Each channel is generated individually so the client can show real-time progress.
 */
export async function remixContent(
  config: RemixConfig,
  onProgress: (event: RemixProgressEvent) => void,
): Promise<void> {
  // 1. Load and verify source content ownership
  const sourceItems = await db
    .select()
    .from(schema.contentItems)
    .where(
      and(
        inArray(schema.contentItems.id, config.sourceContentIds),
        eq(schema.contentItems.userId, config.userId),
      ),
    );

  if (sourceItems.length === 0) {
    throw new NotFoundError('No source content found or not authorized');
  }

  // 2. Combine source bodies (cap at 10k chars)
  const combinedSource = sourceItems
    .map((item) => `--- ${item.title} ---\n${item.body}`)
    .join('\n\n')
    .slice(0, 10000);

  // 3. Load remix style system prompt from DB (or use custom prompt)
  let styleInstruction: string;
  if (config.style === 'custom' && config.customPrompt) {
    styleInstruction = config.customPrompt;
  } else {
    try {
      const { getSystemPromptBySlug } = await import('./system-prompt.service.js');
      const prompt = await getSystemPromptBySlug(config.style);
      styleInstruction = prompt.body;
    } catch {
      throw new NotFoundError(`Remix style '${config.style}' not found`);
    }
  }

  // 4. Load target channels
  const channels = await loadChannels(config.targetChannelIds);
  if (channels.length === 0) {
    throw new NotFoundError('No valid target channels found');
  }

  // 5. Build the remix system prompt
  const systemPrompt =
    `You are a content remix expert. Your task is to transform existing content into fresh, platform-optimized variations.\n\n` +
    `REMIX STYLE INSTRUCTION:\n${styleInstruction}\n\n` +
    `Apply this style transformation while adapting for each target platform's conventions and constraints. ` +
    `Produce content that feels native to the platform, not just reformatted.`;

  const model = config.model || 'anthropic/claude-sonnet-4-6';
  const role = config.role ?? 'Subscriber';
  const primarySourceId = sourceItems[0].id;
  let totalCreated = 0;

  // 6. Generate per-channel (streaming progress)
  for (const channel of channels) {
    try {
      const adaptedBody = await generateForSingleChannel({
        sourceText: combinedSource,
        channel,
        systemPrompt,
        model,
        userId: config.userId,
        role,
      });

      // Create content item
      const title =
        sourceItems.length === 1
          ? `${sourceItems[0].title} (${channel.name} remix)`
          : `Remix for ${channel.name}`;

      const item = await createContentItem({
        userId: config.userId,
        channelId: channel.id,
        title,
        body: adaptedBody,
        status: 'draft',
        sourceContentId: primarySourceId,
        metadata: {
          remixStyle: config.style,
          remixSourceIds: config.sourceContentIds,
          remixedAt: new Date().toISOString(),
          model,
        },
      });

      totalCreated++;
      onProgress({
        type: 'progress',
        channelId: channel.id,
        channelName: channel.name,
        item: item as unknown as Record<string, unknown>,
      });

      logger.info(
        { channelId: channel.id, channelName: channel.name, contentId: item.id },
        'Remix content generated for channel',
      );
    } catch (err) {
      logger.error({ err, channelId: channel.id }, 'Remix generation failed for channel');
      onProgress({
        type: 'error',
        channelId: channel.id,
        channelName: channel.name,
        error: err instanceof Error ? err.message : 'Generation failed',
      });
    }
  }

  onProgress({ type: 'complete', totalCreated });
}

// --- Seed remix style system prompts ---

export async function seedRemixStylePrompts(): Promise<void> {
  const styles = [
    {
      slug: 'remix-punchy',
      name: 'Punchy & Concise',
      description: 'Strip to the essence. Short sentences. Strong verbs. Maximum impact per word.',
      category: 'remix',
      body: 'Transform this content to be punchy and concise. Use short, impactful sentences. Strong verbs. No fluff. Every word earns its place. Think billboard copywriting meets social media. Lead with the hook.',
    },
    {
      slug: 'remix-storytelling',
      name: 'Storytelling',
      description: 'Reframe the content as a narrative with tension, character, and resolution.',
      category: 'remix',
      body: 'Transform this content into a compelling story. Open with a hook that creates tension or curiosity. Build a narrative arc — setup, conflict/challenge, resolution/insight. Make it personal and relatable. End with a takeaway that sticks.',
    },
    {
      slug: 'remix-takeaways',
      name: 'Key Takeaways',
      description: 'Extract the most valuable insights and present them as a scannable list.',
      category: 'remix',
      body: 'Extract the most valuable insights from this content and present them as clear, actionable takeaways. Use numbered points or bullet format. Each takeaway should stand alone as valuable. Open with a headline that promises value. Close with a call to action.',
    },
    {
      slug: 'remix-hot-take',
      name: 'Hot Take',
      description: 'Reframe with a bold, contrarian angle that sparks conversation.',
      category: 'remix',
      body: 'Reframe this content as a bold, contrarian hot take. Challenge conventional wisdom. Be provocative but substantive — not clickbait. Take a strong stance and back it up. The goal is to spark conversation and debate. Use confident, direct language.',
    },
    {
      slug: 'remix-thread',
      name: 'Thread / Carousel',
      description: 'Break into a multi-part series with hooks between each segment.',
      category: 'remix',
      body: 'Break this content into a thread or carousel format. Start with a powerful hook that stops the scroll. Each segment (3-8 parts) should deliver one clear idea. End each part with a reason to keep reading. Close with a summary and call to action. Number each part.',
    },
    {
      slug: 'remix-recap',
      name: 'Professional Recap',
      description: 'Distill into a polished, business-friendly summary with clear structure.',
      category: 'remix',
      body: 'Transform this content into a polished, professional recap. Use clear structure with headers or sections. Maintain an authoritative but approachable tone. Include context for why this matters. Suitable for LinkedIn, newsletters, or business audiences. Focus on insights and implications.',
    },
  ];

  for (const style of styles) {
    const existing = await db.query.systemPrompts.findFirst({
      where: eq(schema.systemPrompts.slug, style.slug),
    });
    if (!existing) {
      await db.insert(schema.systemPrompts).values(style);
      logger.info({ slug: style.slug }, 'Seeded remix style system prompt');
    }
  }
}

// --- Repurpose: transform external content into platform-native posts ---

export interface RepurposeConfig {
  sourceText: string;
  sourceUrl?: string;
  targetChannelIds: string[];
  style: string;
  customPrompt?: string;
  userId: string;
  role?: string;
  model?: string;
}

/**
 * Repurpose external content: stream results per-channel via a callback.
 */
export async function repurposeContent(
  config: RepurposeConfig,
  onProgress: (event: RemixProgressEvent) => void,
): Promise<void> {
  // Truncate source to 10k chars
  const sourceText = config.sourceText.slice(0, 10_000);

  // Load style system prompt or use custom
  let styleInstruction: string;
  if (config.style === 'custom' && config.customPrompt) {
    styleInstruction = config.customPrompt;
  } else {
    try {
      const { getSystemPromptBySlug } = await import('./system-prompt.service.js');
      const prompt = await getSystemPromptBySlug(config.style);
      styleInstruction = prompt.body;
    } catch {
      throw new NotFoundError(`Repurpose style '${config.style}' not found`);
    }
  }

  const channels = await loadChannels(config.targetChannelIds);
  if (channels.length === 0) {
    throw new NotFoundError('No valid target channels found');
  }

  const systemPrompt =
    `You are a content repurposing expert. Your task is to transform source material into fresh, platform-optimized content.\n\n` +
    `STYLE INSTRUCTION:\n${styleInstruction}\n\n` +
    `The source material is from an external source (article, blog post, transcript, or notes). ` +
    `Extract the core ideas and transform them into content that feels native to each target platform — not just reformatted. ` +
    `Add your own angle, don't just summarize.`;

  const model = config.model || 'anthropic/claude-sonnet-4-6';
  const role = config.role ?? 'Subscriber';
  let totalCreated = 0;

  for (const channel of channels) {
    try {
      const adaptedBody = await generateForSingleChannel({
        sourceText,
        channel,
        systemPrompt,
        model,
        userId: config.userId,
        role,
      });

      const title = config.sourceUrl
        ? `Repurposed for ${channel.name}`
        : `Repurposed content (${channel.name})`;

      const item = await createContentItem({
        userId: config.userId,
        channelId: channel.id,
        title,
        body: adaptedBody,
        status: 'draft',
        metadata: {
          repurposeSource: {
            url: config.sourceUrl ?? null,
            originalTextSnippet: sourceText.slice(0, 200),
          },
          repurposeStyle: config.style,
          repurposedAt: new Date().toISOString(),
          model,
        },
      });

      totalCreated++;
      onProgress({
        type: 'progress',
        channelId: channel.id,
        channelName: channel.name,
        item: item as unknown as Record<string, unknown>,
      });

      logger.info(
        { channelId: channel.id, channelName: channel.name, contentId: item.id },
        'Repurposed content generated for channel',
      );
    } catch (err) {
      logger.error({ err, channelId: channel.id }, 'Repurpose generation failed for channel');
      onProgress({
        type: 'error',
        channelId: channel.id,
        channelName: channel.name,
        error: err instanceof Error ? err.message : 'Generation failed',
      });
    }
  }

  onProgress({ type: 'complete', totalCreated });
}
