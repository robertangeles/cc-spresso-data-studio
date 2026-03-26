import { describe, it, expect } from 'vitest';

describe('APEX prompt response parsing', () => {
  function parseApexResponse(content: string) {
    try {
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  it('parses clean JSON response', () => {
    const json =
      '{"suggestedName":"Test","framework":"CRISPE","complexity":"Moderate","generatedPrompt":"You are..."}';
    const result = parseApexResponse(json);
    expect(result).not.toBeNull();
    expect(result.suggestedName).toBe('Test');
    expect(result.framework).toBe('CRISPE');
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const json =
      '```json\n{"suggestedName":"Test","framework":"RTF","complexity":"Simple","generatedPrompt":"Hello"}\n```';
    const result = parseApexResponse(json);
    expect(result).not.toBeNull();
    expect(result.framework).toBe('RTF');
  });

  it('returns null for invalid JSON', () => {
    expect(parseApexResponse('not json at all')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseApexResponse('')).toBeNull();
  });

  it('handles JSON with extra whitespace', () => {
    const json =
      '  \n  {"suggestedName":"Padded","framework":"GOALS","complexity":"Complex","generatedPrompt":"..."}\n  ';
    const result = parseApexResponse(json);
    expect(result).not.toBeNull();
    expect(result.suggestedName).toBe('Padded');
  });
});
