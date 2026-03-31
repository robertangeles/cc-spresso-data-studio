import { describe, it, expect } from 'vitest';
import { isContentResponse, synthesizeTriggerMessage } from '../contentDetection';

describe('isContentResponse', () => {
  // U1: Long content text returns true
  it('returns true for substantial content text', () => {
    const text =
      "Here's your LinkedIn post about launching a new product. We're thrilled to announce the release of our latest innovation that will transform how teams collaborate. After months of development and testing, we're ready to share it with the world.";
    expect(isContentResponse(text)).toBe(true);
  });

  // U2: Short question returns false
  it('returns false for a short question', () => {
    expect(isContentResponse('What topic would you like me to write about?')).toBe(false);
  });

  // U3: Empty string returns false
  it('returns false for empty string', () => {
    expect(isContentResponse('')).toBe(false);
  });

  // U4: Whitespace-only returns false
  it('returns false for whitespace-only string', () => {
    expect(isContentResponse('   \n  ')).toBe(false);
  });

  // U5: AI refusal returns false
  it('returns false for AI refusal', () => {
    const refusal =
      "I'm sorry, I cannot generate that content because it violates the usage policy. Please try a different prompt that aligns with our guidelines.";
    expect(isContentResponse(refusal)).toBe(false);
  });

  // U6: Multiple questions returns false
  it('returns false for multiple questions', () => {
    const questions =
      "Great! A few questions before I can help:\n1. What's your brand name?\n2. Who's your target audience?\n3. What tone do you prefer?\n4. Any specific keywords to include?";
    expect(isContentResponse(questions)).toBe(false);
  });

  // U7: Content ending with a follow-up question returns true
  it('returns true for content that ends with a follow-up question', () => {
    const text =
      "Here's your post: 'Big news! We're launching our newest product today. After months of hard work, we're excited to share this with everyone. Join us for the live demo this Friday at 2pm EST.' Want me to adjust the tone or make it shorter?";
    expect(isContentResponse(text)).toBe(true);
  });

  // U8: Single-line content (long enough) returns true
  it('returns true for a single-line quote that meets length threshold', () => {
    const text =
      '"Your body is not a temple, it\'s an amusement park. Enjoy the ride." — Anthony Bourdain. This timeless quote reminds us to embrace life fully.';
    expect(isContentResponse(text)).toBe(true);
  });

  // U9: Error message returns false
  it('returns false for an error message', () => {
    expect(
      isContentResponse('An error occurred while processing your request. Please try again later.'),
    ).toBe(false);
  });

  // U10: Unicode/emoji content returns true
  it('returns true for content with unicode and emojis', () => {
    const text =
      'Exciting launch day! Here is what we built over the past six months. Our team worked tirelessly to bring this vision to life and we cannot wait for you to experience it. Stay tuned for more updates coming soon.';
    expect(isContentResponse(text)).toBe(true);
  });

  // Edge: Response that is exactly at the boundary
  it('returns false for text just under 100 chars', () => {
    const text = 'A'.repeat(99);
    expect(isContentResponse(text)).toBe(false);
  });

  it('returns true for text at exactly 100 chars with no questions', () => {
    const text = 'A'.repeat(100);
    expect(isContentResponse(text)).toBe(true);
  });

  // Edge: "I apologize" refusal variant
  it('returns false for "I apologize" refusal', () => {
    const text =
      'I apologize, but I am not able to generate content that promotes harmful activities. Please try a different approach to your content.';
    expect(isContentResponse(text)).toBe(false);
  });
});

describe('synthesizeTriggerMessage', () => {
  // U11: Normal prompt name
  it('returns formatted trigger message for normal name', () => {
    expect(synthesizeTriggerMessage('Random Quote Generator')).toBe(
      'I\'d like to use the "Random Quote Generator" prompt. Please follow its instructions.',
    );
  });

  // U12: Long prompt name gets truncated
  it('truncates very long prompt names', () => {
    const longName = 'A'.repeat(100);
    const result = synthesizeTriggerMessage(longName);
    expect(result.length).toBeLessThan(160);
    expect(result).toContain('...');
  });

  // U13: Special characters handled cleanly
  it('handles special characters in prompt name', () => {
    const result = synthesizeTriggerMessage('Tips & Tricks — Social');
    expect(result).toBe(
      'I\'d like to use the "Tips & Tricks — Social" prompt. Please follow its instructions.',
    );
  });
});
