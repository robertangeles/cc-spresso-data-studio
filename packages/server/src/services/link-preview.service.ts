import { db } from '../db/index.js';
import { communityMessageAttachments, directMessageAttachments } from '../db/schema.js';
import { logger } from '../config/logger.js';
import * as cheerio from 'cheerio';

// URL regex — matches http/https URLs
const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

const FETCH_TIMEOUT_MS = 5000;
const MAX_URLS_PER_MESSAGE = 3;

interface OGMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

/**
 * Detect URLs in message content and fetch OG metadata for link previews.
 * This runs asynchronously AFTER the message is persisted and broadcast.
 */
export async function processLinkPreviews(
  messageId: string,
  content: string,
  target: 'channel' | 'dm' = 'channel',
): Promise<Array<Record<string, unknown>>> {
  const urls = content.match(URL_REGEX);
  if (!urls || urls.length === 0) return [];

  // Deduplicate and limit
  const uniqueUrls = [...new Set(urls)].slice(0, MAX_URLS_PER_MESSAGE);

  const previews: Array<Record<string, unknown>> = [];

  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    try {
      const metadata = await fetchOGMetadata(url);
      if (!metadata) continue;

      const table = target === 'channel' ? communityMessageAttachments : directMessageAttachments;

      const [attachment] = await db
        .insert(table)
        .values({
          messageId,
          type: 'link_preview',
          url,
          metadata: {
            title: metadata.title || null,
            description: metadata.description || null,
            image: metadata.image || null,
            siteName: metadata.siteName || null,
          },
          sortOrder: i,
        })
        .returning();

      previews.push(attachment);
    } catch (err) {
      // Link preview failures are non-critical — log and continue
      logger.warn({ url, err }, 'Failed to fetch link preview');
    }
  }

  return previews;
}

/**
 * Fetch OpenGraph metadata from a URL.
 */
async function fetchOGMetadata(url: string): Promise<OGMetadata | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SpressoBot/1.0 (link preview)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    // Read only first 50KB to avoid downloading large pages
    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = '';
    const decoder = new TextDecoder();
    let bytesRead = 0;
    const maxBytes = 50 * 1024;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytesRead += value.length;
    }
    reader.cancel();

    const $ = cheerio.load(html);

    return {
      title: $('meta[property="og:title"]').attr('content') || $('title').text() || undefined,
      description:
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        undefined,
      image: $('meta[property="og:image"]').attr('content') || undefined,
      siteName: $('meta[property="og:site_name"]').attr('content') || undefined,
      url,
    };
  } catch (err) {
    logger.debug({ url, err }, 'OG metadata fetch failed');
    return null;
  }
}
