export type SkillCategory = 'repurpose' | 'generate' | 'research' | 'transform' | 'extract' | 'plan';

export type SkillSource = 'builtin' | 'user';

export type SkillCapability = 'research' | 'image_gen' | 'image_proc' | 'documents';

export interface SkillInput {
  id: string;
  key: string;
  type: 'text' | 'multiline' | 'document' | 'image' | 'select';
  label: string;
  description?: string;
  required: boolean;
  defaultValue?: string;
  options?: string[];
}

export interface SkillOutput {
  key: string;
  type: 'text' | 'markdown' | 'json' | 'image_url';
  label: string;
  description?: string;
  visible?: boolean;
}

export interface SkillConfig {
  inputs: SkillInput[];
  outputs: SkillOutput[];
  promptTemplate: string;
  systemPrompt?: string;
  capabilities: SkillCapability[];
  defaultProvider?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: SkillCategory;
  source: SkillSource;
  version: number;
  userId: string | null;
  icon?: string;
  tags: string[];
  config: SkillConfig;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSkillDTO {
  name: string;
  slug: string;
  description: string;
  category: SkillCategory;
  icon?: string;
  tags?: string[];
  config: SkillConfig;
}

export interface UpdateSkillDTO {
  name?: string;
  description?: string;
  category?: SkillCategory;
  icon?: string;
  tags?: string[];
  config?: SkillConfig;
  isPublished?: boolean;
  changelog?: string;
}
