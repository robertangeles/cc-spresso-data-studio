/**
 * Smart field mapping for orchestration outputs → Content Studio editor.
 *
 * Heuristic rules map output key names to editor targets (title, mainBody,
 * imageUrl, or platform-specific bodies).  Unknown keys fall through to
 * mainBody with a markdown heading.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface MappedFields {
  title?: string;
  mainBody?: string;
  imageUrl?: string;
  platformBodies: Record<string, string>;
}

export type MappingTarget = 'title' | 'mainBody' | 'imageUrl' | 'skip' | `platform:${string}`;

export interface OutputField {
  stepIndex: number;
  skillName: string;
  key: string;
  value: string;
  suggestedTarget: MappingTarget;
}

// ── Pattern tables ─────────────────────────────────────────────────────

const TITLE_PATTERNS = /^(headline|title|subject|heading|name)$/i;
const BODY_PATTERNS =
  /^(body|content|post|text|article|copy|caption|output|summary|draft|result|description|main)$/i;
const IMAGE_PATTERNS = /^(image|image_url|media_url|media|thumbnail|cover|photo|picture)$/i;

const PLATFORM_PATTERNS: Array<{ pattern: RegExp; channelSlug: string }> = [
  { pattern: /^(twitter|x_post|x_thread|tweet)/i, channelSlug: 'twitter' },
  { pattern: /^linkedin/i, channelSlug: 'linkedin' },
  { pattern: /^instagram/i, channelSlug: 'instagram' },
  { pattern: /^facebook/i, channelSlug: 'facebook' },
  { pattern: /^(youtube|yt)/i, channelSlug: 'youtube' },
  { pattern: /^tiktok/i, channelSlug: 'tiktok' },
  { pattern: /^bluesky/i, channelSlug: 'bluesky' },
  { pattern: /^threads/i, channelSlug: 'threads' },
  { pattern: /^(newsletter|email)/i, channelSlug: 'newsletter' },
  { pattern: /^blog/i, channelSlug: 'blog' },
  { pattern: /^pinterest/i, channelSlug: 'pinterest' },
];

// ── Core logic ─────────────────────────────────────────────────────────

/**
 * Suggest a mapping target for a single output key name.
 */
export function suggestTarget(key: string): MappingTarget {
  if (TITLE_PATTERNS.test(key)) return 'title';
  if (IMAGE_PATTERNS.test(key)) return 'imageUrl';

  for (const { pattern, channelSlug } of PLATFORM_PATTERNS) {
    if (pattern.test(key)) return `platform:${channelSlug}`;
  }

  if (BODY_PATTERNS.test(key)) return 'mainBody';

  // Default: treat as mainBody content
  return 'mainBody';
}

/**
 * Detect if an output key maps to a specific platform. Returns the
 * channel slug or null.
 */
export function detectPlatform(key: string): string | null {
  for (const { pattern, channelSlug } of PLATFORM_PATTERNS) {
    if (pattern.test(key)) return channelSlug;
  }
  return null;
}

/**
 * Build a flat list of output fields with suggested targets from
 * multi-step orchestration results.
 */
export function buildOutputFields(
  steps: Array<{ stepIndex: number; skillName: string; outputs: Record<string, string> }>,
): OutputField[] {
  const fields: OutputField[] = [];

  for (const step of steps) {
    for (const [key, value] of Object.entries(step.outputs)) {
      // Skip type-hint metadata keys (e.g. __type_body)
      if (key.startsWith('__')) continue;
      fields.push({
        stepIndex: step.stepIndex,
        skillName: step.skillName,
        key,
        value,
        suggestedTarget: suggestTarget(key),
      });
    }
  }

  return fields;
}

/**
 * Resolve a list of output fields (with user-overridden targets) into
 * the final mapped fields for the Content Studio editor.
 */
export function resolveFields(
  fields: Array<{ key: string; value: string; target: MappingTarget }>,
): MappedFields {
  const result: MappedFields = { platformBodies: {} };
  const bodyParts: string[] = [];

  for (const { value, target } of fields) {
    if (target === 'skip') continue;

    if (target === 'title') {
      // Last-wins for title
      result.title = value;
    } else if (target === 'imageUrl') {
      result.imageUrl = value;
    } else if (target === 'mainBody') {
      bodyParts.push(value);
    } else if (target.startsWith('platform:')) {
      const channelSlug = target.replace('platform:', '');
      result.platformBodies[channelSlug] = value;
    }
  }

  if (bodyParts.length > 0) {
    result.mainBody = bodyParts.join('\n\n');
  }

  return result;
}

/**
 * Convenience: auto-map outputs using suggested targets (no user overrides).
 * Useful for quick-send scenarios.
 */
export function autoMapOutputs(
  steps: Array<{ stepIndex: number; skillName: string; outputs: Record<string, string> }>,
): MappedFields {
  const fields = buildOutputFields(steps);
  return resolveFields(
    fields.map((f) => ({ key: f.key, value: f.value, target: f.suggestedTarget })),
  );
}
