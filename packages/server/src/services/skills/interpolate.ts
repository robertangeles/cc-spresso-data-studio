/**
 * Interpolates {{variable}} placeholders in a template string.
 * Supports dot notation for nested access: {{step_1.output_key}}
 */
export function interpolate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();
    const value = context[trimmed];
    if (value === undefined) {
      return `{{${trimmed}}}`; // leave unresolved placeholders as-is
    }
    return value;
  });
}

/**
 * Extracts all placeholder keys from a template string.
 */
export function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/\{\{(\s*[\w.]+\s*)\}\}/g);
  return [...matches].map((m) => m[1].trim());
}
