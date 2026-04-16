import { providerRegistry } from './ai/index.js';
import { getSystemPromptBySlug } from './system-prompt.service.js';
import { withSessionGate } from './session-gate.service.js';
import { logger } from '../config/logger.js';

/**
 * Generate trending hashtags for a given content description and platform.
 * Uses a DB-backed system prompt for platform-specific hashtag style.
 */
export async function generateHashtags(
  userId: string,
  role: string,
  description: string,
  platform: string = 'tiktok',
): Promise<string[]> {
  let systemContent: string;
  try {
    const prompt = await getSystemPromptBySlug(`${platform}-hashtag-generator`);
    systemContent = prompt.body;
  } catch {
    // Fallback if system prompt not yet created
    systemContent = `You are a social media hashtag expert for ${platform}. Given a video description, suggest 5-10 relevant, trending hashtags. Return ONLY hashtags, one per line, each starting with #. No explanations.`;
  }

  const response = await withSessionGate(userId, role, () =>
    providerRegistry.complete({
      model: 'anthropic/claude-haiku-4-5',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: description },
      ],
    }),
  );

  // Parse response: extract hashtags (lines starting with #)
  const hashtags = response.content
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.startsWith('#'))
    .map((tag: string) => tag.replace(/[^#\w\u00C0-\u024F]/g, '')) // Keep # + alphanumeric
    .filter((tag: string) => tag.length > 1);

  logger.info({ platform, count: hashtags.length }, 'Generated hashtags');
  return hashtags;
}

/**
 * Adapt a caption for a specific platform's culture and style.
 * Uses a DB-backed system prompt per platform.
 */
export async function adaptCaption(
  userId: string,
  role: string,
  caption: string,
  platform: string,
): Promise<string> {
  let systemContent: string;
  try {
    const prompt = await getSystemPromptBySlug(`${platform}-caption-adapter`);
    systemContent = prompt.body;
  } catch {
    // Fallback prompts per platform
    const fallbacks: Record<string, string> = {
      tiktok:
        'You are a TikTok caption writer. Rewrite the given caption for TikTok: use hooks that grab attention in the first line, trending language, casual Gen-Z voice, relevant emojis. Keep under 4000 chars. Return ONLY the adapted caption.',
      youtube:
        'You are a YouTube description writer. Rewrite the given caption for YouTube: SEO-optimized, keyword-rich, with chapters/timestamps if appropriate. Professional but engaging tone. Return ONLY the adapted description.',
      linkedin:
        'You are a LinkedIn content strategist. Rewrite the given caption for LinkedIn: professional thought-leadership framing, insight-driven, no hashtag spam. Return ONLY the adapted post.',
    };
    systemContent =
      fallbacks[platform] ??
      `Rewrite this caption for ${platform}. Match the platform's culture and style. Return ONLY the adapted caption.`;
  }

  const response = await withSessionGate(userId, role, () =>
    providerRegistry.complete({
      model: 'anthropic/claude-haiku-4-5',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: caption },
      ],
    }),
  );

  logger.info(
    { platform, originalLength: caption.length, adaptedLength: response.content.length },
    'Adapted caption',
  );
  return response.content.trim();
}
