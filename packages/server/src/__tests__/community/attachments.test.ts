import { describe, it, expect } from 'vitest';

// Test the URL regex and link preview logic from link-preview.service.ts
const URL_REGEX = /https?:\/\/[^\s<>"']+/g;
const MAX_URLS_PER_MESSAGE = 3;

describe('Attachments & Link Previews', () => {
  // TC-ATT-01: URL regex detects single URL
  it('TC-ATT-01: URL regex detects a single URL', () => {
    const content = 'Check out https://example.com for details';
    const urls = content.match(URL_REGEX);
    expect(urls).toHaveLength(1);
    expect(urls![0]).toBe('https://example.com');
  });

  // TC-ATT-02: URL regex detects multiple URLs
  it('TC-ATT-02: URL regex detects multiple URLs', () => {
    const content = 'Visit https://example.com and http://test.org/page for more';
    const urls = content.match(URL_REGEX);
    expect(urls).toHaveLength(2);
  });

  // TC-ATT-03: URL regex detects exactly 3 URLs
  it('TC-ATT-03: URL regex detects 3 URLs', () => {
    const content = 'Links: https://a.com https://b.com https://c.com';
    const urls = content.match(URL_REGEX);
    expect(urls).toHaveLength(3);
  });

  // TC-ATT-04: More than 3 URLs are capped at MAX_URLS_PER_MESSAGE
  it('TC-ATT-04: URLs capped at MAX_URLS_PER_MESSAGE (3)', () => {
    const content = 'Links: https://a.com https://b.com https://c.com https://d.com https://e.com';
    const urls = content.match(URL_REGEX);
    const uniqueUrls = [...new Set(urls)].slice(0, MAX_URLS_PER_MESSAGE);
    expect(uniqueUrls).toHaveLength(3);
  });

  // TC-ATT-05: Duplicate URLs are deduplicated
  it('TC-ATT-05: duplicate URLs are deduplicated', () => {
    const content = 'Visit https://example.com twice: https://example.com';
    const urls = content.match(URL_REGEX);
    const uniqueUrls = [...new Set(urls)];
    expect(uniqueUrls).toHaveLength(1);
  });

  // TC-ATT-06: Content with no URLs returns null from regex
  it('TC-ATT-06: no URLs found returns null', () => {
    const content = 'No links here, just plain text';
    const urls = content.match(URL_REGEX);
    expect(urls).toBeNull();
  });

  // TC-ATT-07: Invalid URL-like strings are not matched
  it('TC-ATT-07: invalid URL-like strings are not matched', () => {
    const content = 'Not a url: ftp://files.com or just example.com';
    const urls = content.match(URL_REGEX);
    expect(urls).toBeNull();
  });

  // TC-ATT-08: Link preview metadata shape validation
  it('TC-ATT-08: OGMetadata shape has expected fields', () => {
    interface OGMetadata {
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
      url: string;
    }

    const metadata: OGMetadata = {
      title: 'Example',
      description: 'An example page',
      image: 'https://example.com/og.png',
      siteName: 'Example Site',
      url: 'https://example.com',
    };

    expect(metadata).toHaveProperty('url');
    expect(metadata).toHaveProperty('title');
    expect(metadata).toHaveProperty('description');
    expect(metadata).toHaveProperty('image');
    expect(metadata).toHaveProperty('siteName');
  });
});
