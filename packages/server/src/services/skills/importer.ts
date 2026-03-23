import type { SkillConfig, SkillCategory } from '@cc/shared';
import { logger } from '../../config/logger.js';

interface ParsedSkill {
  slug: string;
  name: string;
  description: string;
  category: SkillCategory;
  icon: string;
  tags: string[];
  config: SkillConfig;
}

/**
 * Parse a SKILL.md file content into our SkillConfig format.
 * SKILL.md format: YAML frontmatter (name, description) + markdown body.
 */
export function parseSkillMd(content: string): ParsedSkill {
  const { frontmatter, body } = extractFrontmatter(content);

  if (!frontmatter.name || !frontmatter.description) {
    throw new Error('SKILL.md must have name and description in frontmatter');
  }

  const slug = frontmatter.name;
  const name = slugToTitle(frontmatter.name);
  const description = frontmatter.description;
  const category = inferCategory(name, description, body);
  const icon = inferIcon(category);
  const tags = inferTags(name, description, body);

  const config: SkillConfig = {
    inputs: [
      {
        id: 'content',
        key: 'content',
        type: 'multiline',
        label: 'Input Content',
        description: 'Provide the content or context for this skill',
        required: true,
      },
    ],
    outputs: [
      {
        key: 'result',
        type: 'markdown',
        label: 'Result',
        description: 'The skill output',
      },
    ],
    promptTemplate: buildPromptTemplate(body),
    systemPrompt: buildSystemPrompt(name, description),
    capabilities: [],
    temperature: 0.7,
    maxTokens: 4000,
  };

  return { slug, name, description, category, icon, tags, config };
}

function extractFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string> = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body: match[2].trim() };
}

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function inferCategory(name: string, description: string, body: string): SkillCategory {
  const text = `${name} ${description} ${body}`.toLowerCase();

  if (/repurpos|transform|convert|adapt|reformat/.test(text)) return 'repurpose';
  if (/research|analyz|investigat|gather|find/.test(text)) return 'research';
  if (/extract|pull|identify|highlight|quote/.test(text)) return 'extract';
  if (/plan|strateg|roadmap|schedule|campaign/.test(text)) return 'plan';
  if (/generat|creat|writ|draft|compos|build|design/.test(text)) return 'generate';
  return 'transform';
}

function inferIcon(category: SkillCategory): string {
  const icons: Record<SkillCategory, string> = {
    repurpose: '🔄',
    generate: '✨',
    research: '🔍',
    transform: '⚡',
    extract: '💎',
    plan: '📋',
  };
  return icons[category];
}

function inferTags(name: string, description: string, _body: string): string[] {
  const tags: string[] = ['imported', 'anthropic'];
  const text = `${name} ${description}`.toLowerCase();

  if (/brand/.test(text)) tags.push('branding');
  if (/doc|document|writing/.test(text)) tags.push('documentation');
  if (/api/.test(text)) tags.push('api');
  if (/design|visual|canvas/.test(text)) tags.push('design');
  if (/pdf/.test(text)) tags.push('pdf');
  if (/pptx|presentation|slide/.test(text)) tags.push('presentations');
  if (/code|develop|technical/.test(text)) tags.push('development');

  return tags.slice(0, 10);
}

function buildPromptTemplate(body: string): string {
  return `Follow the instructions below to process the user's input.

## Skill Instructions

${body}

## User Input

{{content}}`;
}

function buildSystemPrompt(name: string, description: string): string {
  return `You are an AI assistant executing the "${name}" skill. ${description}. Follow the skill instructions precisely and produce high-quality output.`;
}

/**
 * Parse a GitHub repo URL into owner/repo.
 * Accepts: https://github.com/owner/repo, github.com/owner/repo, owner/repo
 */
export function parseRepoUrl(input: string): { owner: string; repo: string } {
  const cleaned = input.trim().replace(/\/+$/, '');

  // Try full URL
  const urlMatch = cleaned.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // Try owner/repo shorthand
  const shortMatch = cleaned.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  throw new Error('Invalid GitHub URL. Use format: https://github.com/owner/repo or owner/repo');
}

const DEFAULT_REPO = { owner: 'anthropics', repo: 'skills' };

/**
 * Fetch available skills from a GitHub repo.
 * Looks for directories under /skills/ that contain SKILL.md files.
 */
export async function listGitHubSkills(repoUrl?: string): Promise<Array<{ name: string; path: string; repo: string }>> {
  const { owner, repo } = repoUrl ? parseRepoUrl(repoUrl) : DEFAULT_REPO;
  const repoLabel = `${owner}/${repo}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/skills`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No "skills/" directory found in ${repoLabel}. The repo must have a skills/ folder with SKILL.md files.`);
    }
    throw new Error(`GitHub API error for ${repoLabel}: ${res.status}`);
  }

  const items = (await res.json()) as Array<{ name: string; path: string; type: string }>;
  return items
    .filter((item) => item.type === 'dir')
    .map((item) => ({ name: item.name, path: item.path, repo: repoLabel }));
}

/**
 * Fetch and parse a single SKILL.md from a GitHub repo.
 */
export async function fetchAndParseSkill(skillName: string, repoUrl?: string): Promise<ParsedSkill> {
  const { owner, repo } = repoUrl ? parseRepoUrl(repoUrl) : DEFAULT_REPO;

  const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}/SKILL.md`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch SKILL.md for "${skillName}" from ${owner}/${repo}: ${res.status}`);
  }

  const content = await res.text();
  logger.info({ skillName, repo: `${owner}/${repo}` }, 'Fetched SKILL.md from GitHub');

  return parseSkillMd(content);
}
