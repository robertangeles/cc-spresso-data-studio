import type { Layer, NamingLintRule } from './model-studio.schemas.js';

/**
 * Naming-lint (delight D6) — flags identifier smells with optional
 * one-click fixes. Lives in @cc/shared so the server is authoritative
 * AND the client can render inline amber underlines without a round
 * trip per keystroke.
 *
 * Rules ship intentionally small; expand only when a real violation
 * pattern earns its place. False positives are worse than no lint.
 *
 * Layer semantics:
 *   - conceptual: business-facing names. No lint at MVP.
 *   - logical   : intent-facing names. Reserved-SQL warning only.
 *   - physical  : DDL identifiers. Snake-case violation + reserved-SQL
 *                 warning. The Zod schema already hard-rejects unsafe
 *                 chars; this lint catches the *style* gaps the Zod
 *                 schema can't (camelCase, PascalCase, leading caps).
 */

// Subset of SQL-92 + Postgres + ANSI reserved words most likely to be
// typed unintentionally. Not exhaustive — the goal is "catch the
// surprise", not enforce a global blacklist.
const RESERVED_SQL_WORDS: ReadonlySet<string> = new Set([
  'all',
  'and',
  'as',
  'between',
  'by',
  'case',
  'check',
  'column',
  'constraint',
  'create',
  'date',
  'default',
  'delete',
  'desc',
  'distinct',
  'drop',
  'else',
  'end',
  'foreign',
  'from',
  'group',
  'having',
  'in',
  'index',
  'inner',
  'insert',
  'into',
  'is',
  'join',
  'key',
  'left',
  'like',
  'limit',
  'not',
  'null',
  'on',
  'or',
  'order',
  'outer',
  'primary',
  'references',
  'right',
  'select',
  'table',
  'then',
  'to',
  'union',
  'unique',
  'update',
  'user',
  'values',
  'when',
  'where',
  'with',
]);

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

/** Convert a name to snake_case, preserving acronyms as best as
 *  reasonable: "customerID" → "customer_id", "OrderItem" → "order_item",
 *  "HTTPRequest" → "http_request". */
export function toSnakeCase(input: string): string {
  return (
    input
      .trim()
      // Acronym followed by capitalised word: "HTTPRequest" → "HTTP_Request"
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      // camelCase boundary: "customerID" → "customer_ID"
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      // Spaces / hyphens → underscore
      .replace(/[\s-]+/g, '_')
      .toLowerCase()
      // Collapse runs of underscores
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  );
}

/**
 * Run naming-lint for an entity (or attribute) name on a given layer.
 * Returns an empty array when the name is clean.
 *
 * Order matters: snake_case violation comes first so the UI can show
 * the highest-severity issue without computing all of them.
 */
export function lintIdentifier(name: string, layer: Layer): NamingLintRule[] {
  const issues: NamingLintRule[] = [];
  const trimmed = name.trim();
  if (trimmed.length === 0) return issues;

  if (layer === 'physical' && !SNAKE_CASE.test(trimmed)) {
    issues.push({
      rule: 'snake_case',
      severity: 'violation',
      message: 'Physical-layer names must be snake_case.',
      suggestion: toSnakeCase(trimmed),
    });
  }

  if (layer !== 'conceptual' && RESERVED_SQL_WORDS.has(trimmed.toLowerCase())) {
    issues.push({
      rule: 'reserved_sql_word',
      severity: 'warning',
      message: `"${trimmed}" is a reserved SQL word and may need quoting in DDL.`,
      suggestion: layer === 'physical' ? `${toSnakeCase(trimmed)}_` : undefined,
    });
  }

  return issues;
}
