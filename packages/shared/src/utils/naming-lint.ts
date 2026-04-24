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

/** Attribute-specific lint context. Only meaningful on the physical
 *  layer (logical/conceptual types are informational, not enforced). */
export interface AttributeLintContext {
  dataType?: string | null;
  length?: number | null;
  precision?: number | null;
  scale?: number | null;
}

/**
 * Lint an attribute name + type combo. Delegates to lintIdentifier for
 * the base rules (snake_case, reserved words), then appends rules that
 * only make sense with attribute context:
 *
 *   - `*_id` suffix with non-uuid data_type → warn, suggest `uuid`.
 *   - VARCHAR with no length → warn (Postgres allows it, most DBAs don't).
 *   - NUMERIC with scale > precision → violation (Postgres rejects the DDL).
 *
 * Only applies on the physical layer. Conceptual / logical return the
 * base lintIdentifier result unchanged. Kept as a separate function
 * instead of extending lintIdentifier so existing entity callers don't
 * silently lose attribute-rule coverage if they forget to pass context.
 */
export function lintAttribute(
  name: string,
  layer: Layer,
  ctx: AttributeLintContext = {},
): NamingLintRule[] {
  const issues = lintIdentifier(name, layer);
  if (layer !== 'physical') return issues;

  const trimmed = name.trim();
  const dataType = ctx.dataType?.trim().toLowerCase();

  // `*_id` suffix with a non-uuid type. Skip `id` alone — that's a
  // perfectly valid PK column name and not an FK-style id column.
  if (trimmed.length > 3 && trimmed.endsWith('_id') && dataType && dataType !== 'uuid') {
    issues.push({
      rule: 'id_suffix_should_be_uuid',
      severity: 'warning',
      message: `Columns ending in "_id" are conventionally uuid; "${ctx.dataType}" is unusual.`,
      suggestion: 'uuid',
    });
  }

  if (dataType === 'varchar' && (ctx.length == null || ctx.length <= 0)) {
    issues.push({
      rule: 'varchar_requires_length',
      severity: 'warning',
      message: 'VARCHAR columns should declare a length. Default Postgres behaviour is unbounded.',
    });
  }

  if (
    dataType === 'numeric' &&
    ctx.precision != null &&
    ctx.scale != null &&
    ctx.scale > ctx.precision
  ) {
    issues.push({
      rule: 'numeric_scale_gt_precision',
      severity: 'violation',
      message: `NUMERIC(${ctx.precision}, ${ctx.scale}) is invalid — scale must be ≤ precision.`,
    });
  }

  return issues;
}

// Matches PascalCase / camelCase tokens like `CustomerOrders` or
// `customerOrders`. Used to warn that a relationship name is drifting
// from the snake_case / sentence-style conventions the rest of the
// lint ecosystem enforces.
const CAMEL_OR_PASCAL_CASE = /[a-z][A-Z]|^[A-Z][a-z]+[A-Z]/;

// Patterns that match Spresso's house style for relationship naming.
// A name containing any of these reads naturally (e.g. `has_many_orders`,
// `belongs_to_customer`, `customer_to_invoice`, `line_items_of_order`).
const RELATIONSHIP_PATTERN_HINTS: readonly string[] = ['_to_', 'has_', 'belongs_to_', '_of_'];

// ============================================================
// Step 6 Direction A — entity-level business-key lint.
// ============================================================

/**
 * Minimal attribute shape the BK lint needs. Declared locally so this
 * file doesn't have to take a direct dependency on the heavier
 * server-side `DataModelAttribute` type. Callers that already have
 * Drizzle rows can pass them through — structural typing does the rest.
 */
export interface BusinessKeyLintAttribute {
  isPrimaryKey: boolean;
  dataType?: string | null;
  altKeyGroup?: string | null;
}

/** Minimal entity shape the BK lint needs — name + layer. Mirrors the
 *  identifier-lint signature so callers can reuse existing row types. */
export interface BusinessKeyLintEntity {
  name: string;
  layer: Layer;
}

/** Data types that Spresso considers "surrogate" — machine-generated
 *  identifiers with no business meaning on their own. The lint only
 *  fires on entities whose single PK column is one of these types; an
 *  entity with a natural PK (e.g. varchar ISBN) is exempt because the
 *  PK itself is already the business key. Case-insensitive match. */
const SURROGATE_PK_TYPES: ReadonlySet<string> = new Set([
  'uuid',
  'integer',
  'int',
  'int4',
  'int8',
  'bigint',
  'serial',
  'bigserial',
  'smallint',
  'smallserial',
]);

/**
 * Warn when an entity has a surrogate PK but no attribute carries an
 * alt-key (business-key) group. The concern is conceptual, not
 * physical: surrogate keys are invisible to the business, so without
 * at least one AK group there is no human-recognisable identifier for
 * the row — a problem in the conceptual layer and in any BI export.
 *
 * Returns `[]` when:
 *   - the entity has no PK at all (nothing to complain about — the
 *     modeller may still be sketching);
 *   - the PK is composite (composite PKs are already business-shaped
 *     in practice);
 *   - the single PK column's type is NOT a surrogate (natural PK);
 *   - any attribute already has a non-null `altKeyGroup` set.
 *
 * Severity is `info` so the UI can render a subtle advisory rather
 * than a blocker — the modeller always has the final call on whether
 * a surrogate-only model is acceptable.
 */
export function lintEntityForBusinessKey(
  _entity: BusinessKeyLintEntity,
  attributes: readonly BusinessKeyLintAttribute[],
): NamingLintRule[] {
  const pkColumns = attributes.filter((a) => a.isPrimaryKey);
  if (pkColumns.length === 0) return [];

  // Composite PK → the business key is the composite itself; skip.
  if (pkColumns.length > 1) return [];

  const pk = pkColumns[0];
  const dataType = pk.dataType?.trim().toLowerCase() ?? '';
  if (!SURROGATE_PK_TYPES.has(dataType)) return [];

  const hasAkGroup = attributes.some(
    (a) => typeof a.altKeyGroup === 'string' && a.altKeyGroup.length > 0,
  );
  if (hasAkGroup) return [];

  return [
    {
      rule: 'entity_missing_business_key',
      severity: 'info',
      message:
        'Entity has a PK but no business key — add an alt-key group (AK1) so the conceptual layer has a human-recognisable identifier.',
    },
  ];
}

/**
 * Lint a relationship name on a given layer.
 *
 * Advisory only — relationship names are optional (cardinality carries
 * the semantics), so empty / null / whitespace input returns `[]` with
 * no issues. Rules fired:
 *
 *   - Physical layer + not snake_case ⇒ `snake_case` violation
 *     (matches the identifier rule — relationships land in DDL
 *     comments and index names, so the surface still matters).
 *   - camelCase / PascalCase ⇒ `relationship_name_case` warning
 *     suggesting snake_case or sentence-style. Fires on all layers
 *     because it captures style drift that the physical rule misses
 *     on conceptual/logical layers.
 *   - No `_to_` / `has_` / `belongs_to_` / `_of_` pattern ⇒
 *     `relationship_name_pattern` info — a soft nudge, never a block.
 */
export function lintRelationshipName(
  name: string | null | undefined,
  layer: Layer,
): NamingLintRule[] {
  const issues: NamingLintRule[] = [];
  if (name == null) return issues;
  const trimmed = name.trim();
  if (trimmed.length === 0) return issues;

  if (layer === 'physical' && !SNAKE_CASE.test(trimmed)) {
    issues.push({
      rule: 'snake_case',
      severity: 'violation',
      message: 'Physical-layer relationship names must be snake_case.',
      suggestion: toSnakeCase(trimmed),
    });
  }

  if (CAMEL_OR_PASCAL_CASE.test(trimmed)) {
    issues.push({
      rule: 'relationship_name_case',
      severity: 'warning',
      message: 'Use snake_case or sentence-style',
      suggestion: toSnakeCase(trimmed),
    });
  }

  const lower = trimmed.toLowerCase();
  const hasPatternHint = RELATIONSHIP_PATTERN_HINTS.some((p) => lower.includes(p));
  if (!hasPatternHint) {
    issues.push({
      rule: 'relationship_name_pattern',
      severity: 'info',
      message: 'Consider a `has_*`, `belongs_to_*`, `_to_` or `_of_` pattern for readability.',
    });
  }

  return issues;
}
