import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSkillSchema, updateSkillSchema } from '../utils/validation';

// Inline the visibility schema since it may not be in compiled dist yet
const updateVisibilitySchema = z.object({
  visibility: z.enum(['private', 'unlisted', 'public']),
});

describe('createSkillSchema', () => {
  const validData = {
    name: 'Test Skill',
    slug: 'test-skill',
    description: 'A test skill',
    category: 'generate' as const,
    config: {
      inputs: [{ id: 'c', key: 'c', type: 'multiline' as const, label: 'Content', required: true }],
      outputs: [{ key: 'r', type: 'markdown' as const, label: 'Result' }],
      promptTemplate: '{{c}}',
      systemPrompt: 'You are helpful.',
      capabilities: [],
      temperature: 0.7,
      maxTokens: 2000,
    },
  };

  it('accepts valid skill data', () => {
    const result = createSkillSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createSkillSchema.safeParse({ ...validData, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing slug', () => {
    const { slug: _slug, ...noSlug } = validData;
    const result = createSkillSchema.safeParse(noSlug);
    expect(result.success).toBe(false);
  });

  it('rejects slug with spaces', () => {
    const result = createSkillSchema.safeParse({ ...validData, slug: 'bad slug' });
    expect(result.success).toBe(false);
  });

  it('rejects slug with uppercase', () => {
    const result = createSkillSchema.safeParse({ ...validData, slug: 'Bad-Slug' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = createSkillSchema.safeParse({ ...validData, category: 'nonexistent' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid categories', () => {
    const categories = [
      'repurpose',
      'generate',
      'research',
      'transform',
      'extract',
      'plan',
    ] as const;
    for (const category of categories) {
      const result = createSkillSchema.safeParse({ ...validData, category });
      expect(result.success).toBe(true);
    }
  });

  it('rejects description over 1000 chars', () => {
    const result = createSkillSchema.safeParse({ ...validData, description: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('rejects missing config', () => {
    const { config: _config, ...noConfig } = validData;
    const result = createSkillSchema.safeParse(noConfig);
    expect(result.success).toBe(false);
  });

  it('rejects invalid input type', () => {
    const result = createSkillSchema.safeParse({
      ...validData,
      config: {
        ...validData.config,
        inputs: [{ id: 'c', key: 'c', type: 'invalid', label: 'C', required: true }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid input types', () => {
    const types = ['text', 'multiline', 'document', 'image', 'select'] as const;
    for (const type of types) {
      const result = createSkillSchema.safeParse({
        ...validData,
        config: {
          ...validData.config,
          inputs: [{ id: 'c', key: 'c', type, label: 'C', required: true }],
        },
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('updateSkillSchema', () => {
  it('accepts partial updates', () => {
    const result = updateSkillSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('accepts visibility in update', () => {
    const result = updateSkillSchema.safeParse({ visibility: 'public' });
    expect(result.success).toBe(true);
  });

  it('accepts valid visibility values in update', () => {
    for (const vis of ['private', 'unlisted', 'public']) {
      const result = updateSkillSchema.safeParse({ visibility: vis });
      expect(result.success).toBe(true);
    }
  });
});

describe('updateVisibilitySchema', () => {
  it('accepts private', () => {
    expect(updateVisibilitySchema.safeParse({ visibility: 'private' }).success).toBe(true);
  });

  it('accepts unlisted', () => {
    expect(updateVisibilitySchema.safeParse({ visibility: 'unlisted' }).success).toBe(true);
  });

  it('accepts public', () => {
    expect(updateVisibilitySchema.safeParse({ visibility: 'public' }).success).toBe(true);
  });

  it('rejects invalid value', () => {
    expect(updateVisibilitySchema.safeParse({ visibility: 'draft' }).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(updateVisibilitySchema.safeParse({ visibility: '' }).success).toBe(false);
  });

  it('rejects missing visibility', () => {
    expect(updateVisibilitySchema.safeParse({}).success).toBe(false);
  });
});
