import * as cheerio from 'cheerio';
import { logger } from '../config/logger.js';

// ── SSRF Protection ──────────────────────────────────────────────────

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
]);

/**
 * Check if an IP address is in a private/reserved range.
 * Blocks: 10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, 0.x
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

  // 127.0.0.0/8
  if (parts[0] === 127) return true;
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 0.0.0.0/8
  if (parts[0] === 0) return true;

  return false;
}

/**
 * Validate a URL is safe to fetch (no SSRF).
 * Throws on invalid/blocked URLs.
 */
function validateUrl(urlStr: string): URL {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error('Invalid URL format');
  }

  // Only allow http/https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }

  // Block known internal hostnames
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('This URL is not allowed');
  }

  // Block private IPs
  if (isPrivateIP(url.hostname)) {
    throw new Error('This URL is not allowed');
  }

  // Block AWS/GCP/Azure metadata endpoints
  if (url.hostname === '169.254.169.254' || url.hostname.endsWith('.internal')) {
    throw new Error('This URL is not allowed');
  }

  return url;
}

// ── Content Extraction ───────────────────────────────────────────────

interface ScrapedContent {
  title: string;
  body: string;
  source: string;
}

/**
 * Scrape a URL and extract the main text content.
 * Returns the title, body text, and source URL.
 */
export async function scrapeUrl(urlStr: string): Promise<ScrapedContent> {
  const url = validateUrl(urlStr);

  logger.info({ url: url.toString() }, 'Scraping URL for repurpose');

  // Fetch with safety limits
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Spresso/1.0 (Content Repurpose Bot)',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
      redirect: 'follow',
    });
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === 'AbortError') {
      throw new Error('URL request timed out (5s limit)');
    }
    throw new Error(`Failed to fetch URL: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`URL returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (
    !contentType.includes('text/html') &&
    !contentType.includes('text/plain') &&
    !contentType.includes('application/xhtml')
  ) {
    throw new Error(`Unsupported content type: ${contentType.split(';')[0]}`);
  }

  // Limit response body to 1MB
  const rawBody = await response.text();
  const body = rawBody.slice(0, 1_000_000);

  if (contentType.includes('text/plain')) {
    return {
      title: url.hostname,
      body: body.slice(0, 10_000),
      source: url.toString(),
    };
  }

  // Parse HTML with cheerio
  const $ = cheerio.load(body);

  // Remove noise elements
  $(
    'script, style, nav, footer, header, aside, iframe, noscript, svg, [role="navigation"], [role="banner"], .nav, .footer, .header, .sidebar, .ad, .ads, .advertisement, .cookie-banner',
  ).remove();

  // Extract title
  const title =
    $('meta[property="og:title"]').attr('content') ??
    $('title').text().trim() ??
    $('h1').first().text().trim() ??
    url.hostname;

  // Extract main content — try semantic elements first
  let mainText = '';

  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.article-body',
    '.entry-content',
    '.content',
  ];
  for (const sel of selectors) {
    const el = $(sel);
    if (el.length > 0) {
      mainText = el.text().trim();
      break;
    }
  }

  // Fallback: largest text block from the body
  if (!mainText || mainText.length < 100) {
    // Get all paragraphs and combine
    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) paragraphs.push(text);
    });

    if (paragraphs.length > 0) {
      mainText = paragraphs.join('\n\n');
    } else {
      // Last resort: body text
      mainText = $('body').text().trim();
    }
  }

  // Normalize whitespace
  mainText = mainText
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Truncate to 10k chars
  if (mainText.length > 10_000) {
    mainText = mainText.slice(0, 10_000) + '\n\n[Content truncated — original was longer]';
  }

  if (!mainText || mainText.length < 20) {
    throw new Error('Could not extract meaningful content from this URL');
  }

  logger.info(
    { url: url.toString(), titleLength: title.length, bodyLength: mainText.length },
    'URL scraped successfully',
  );

  return {
    title: title.slice(0, 500),
    body: mainText,
    source: url.toString(),
  };
}
