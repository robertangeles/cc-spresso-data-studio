import jwt from 'jsonwebtoken';
import type { SkillConfig } from '@cc/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

export interface TestUser {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  const id = crypto.randomUUID();
  return {
    userId: overrides.userId ?? id,
    email: overrides.email ?? `test-${id.slice(0, 8)}@spresso.xyz`,
    name: overrides.name ?? 'Test User',
    role: overrides.role ?? 'Subscriber',
  };
}

export function makeAuthToken(user: TestUser): string {
  return jwt.sign({ userId: user.userId, email: user.email }, JWT_SECRET, { expiresIn: 3600 });
}

export function makeAuthHeader(user: TestUser): { Authorization: string } {
  return { Authorization: `Bearer ${makeAuthToken(user)}` };
}

export function makeSkillConfig(overrides: Partial<SkillConfig> = {}): SkillConfig {
  return {
    inputs: overrides.inputs ?? [
      {
        id: 'content',
        key: 'content',
        type: 'multiline',
        label: 'Input Content',
        description: 'Provide content',
        required: true,
      },
    ],
    outputs: overrides.outputs ?? [
      {
        key: 'result',
        type: 'markdown',
        label: 'Result',
        description: 'The output',
      },
    ],
    promptTemplate: overrides.promptTemplate ?? 'Process this: {{content}}',
    systemPrompt: overrides.systemPrompt ?? 'You are a helpful assistant.',
    capabilities: overrides.capabilities ?? [],
    temperature: overrides.temperature ?? 0.7,
    maxTokens: overrides.maxTokens ?? 2000,
  };
}

export function makeSkillData(overrides: Record<string, unknown> = {}) {
  const slug = (overrides.slug as string) ?? `test-skill-${crypto.randomUUID().slice(0, 8)}`;
  return {
    name: (overrides.name as string) ?? 'Test Skill',
    slug,
    description: (overrides.description as string) ?? 'A test skill for automated testing',
    category: (overrides.category as string) ?? 'generate',
    icon: (overrides.icon as string) ?? '🧪',
    tags: (overrides.tags as string[]) ?? ['test'],
    config: (overrides.config as SkillConfig) ?? makeSkillConfig(),
  };
}
