/**
 * Audit-event humaniser — turn change_log rows into plain-English
 * descriptions. Pure function; testable in isolation; reusable from
 * the Audit tab today and from the Step-10 RAG chat tomorrow
 * ("what changed on this model last week?").
 *
 * Contract: format(event) ALWAYS returns a non-empty array of strings,
 * even when the event is malformed or references unknown fields.
 * Never throws. UI renders one line per entry.
 */

// ────────────────────────────────────────────────────────────────────
// Event shape
// ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  action: string;
  changedBy: string;
  beforeState: unknown;
  afterState: unknown;
  createdAt: string;
}

// ────────────────────────────────────────────────────────────────────
// Field-label map
// ────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  businessName: 'Business name',
  description: 'Definition',
  dataType: 'Data type',
  length: 'Length',
  precision: 'Precision',
  scale: 'Scale',
  isNullable: 'Nullable',
  isPrimaryKey: 'Primary key',
  isForeignKey: 'Foreign key',
  isUnique: 'Unique',
  defaultValue: 'Default value',
  classification: 'Classification',
  transformationLogic: 'Transformation logic',
  ordinalPosition: 'Position',
  metadata: 'Metadata',
  tags: 'Tags',
};

/** Fields that carry large free-form text. We summarise size rather
 *  than dump the content so a 20K-char paste doesn't hijack the row. */
const LONG_TEXT_FIELDS: ReadonlySet<string> = new Set(['description', 'transformationLogic']);

/** Fields to skip entirely in diffs — internal bookkeeping the user
 *  doesn't need to see narrated on every update. */
const SKIP_FIELDS: ReadonlySet<string> = new Set(['id', 'entityId', 'createdAt', 'updatedAt']);

const MAX_VALUE_CHARS = 60;

// ────────────────────────────────────────────────────────────────────
// Public entry
// ────────────────────────────────────────────────────────────────────

export function formatAuditEvent(event: AuditEvent): string[] {
  try {
    switch (event.action) {
      case 'create':
        return formatCreate(event);
      case 'update':
        return formatUpdate(event);
      case 'delete':
        return formatDelete(event);
      case 'synthetic_generated':
        return formatSynthetic(event);
      case 'attribute_order':
      case 'reorder':
        return ['Reordered attributes.'];
      default:
        return [`Action "${event.action}" occurred.`];
    }
  } catch {
    return ['(Unparseable audit event — raw state preserved in the database.)'];
  }
}

// ────────────────────────────────────────────────────────────────────
// Per-action formatters
// ────────────────────────────────────────────────────────────────────

function formatCreate(event: AuditEvent): string[] {
  const after = asObject(event.afterState);
  if (!after) return ['Created.'];

  // Only surface non-default initial values so the create line stays
  // short. Defaults match the column defaults in the schema.
  const notable: string[] = [];
  const name = typeof after.name === 'string' ? after.name : null;
  const dataType = typeof after.dataType === 'string' ? after.dataType : null;
  const classification = typeof after.classification === 'string' ? after.classification : null;

  const pieces: string[] = [];
  if (dataType) pieces.push(`type ${code(dataType)}`);
  if (after.isPrimaryKey === true) pieces.push('primary key');
  if (after.isForeignKey === true) pieces.push('foreign key');
  if (classification) pieces.push(`classification ${code(classification)}`);

  const headline = name ? `Created ${code(name)}` : 'Created';
  notable.push(pieces.length > 0 ? `${headline} with ${pieces.join(', ')}.` : `${headline}.`);
  return notable;
}

function formatUpdate(event: AuditEvent): string[] {
  const before = asObject(event.beforeState);
  const after = asObject(event.afterState);
  if (!before || !after) return ['Updated. (Before-state or after-state unavailable.)'];

  const lines: string[] = [];
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    if (SKIP_FIELDS.has(key)) continue;
    const prev = before[key];
    const next = after[key];
    if (deepEqual(prev, next)) continue;
    lines.push(describeFieldChange(key, prev, next));
  }

  return lines.length > 0 ? lines : ['Updated. (No visible field differences.)'];
}

function formatDelete(event: AuditEvent): string[] {
  const before = asObject(event.beforeState);
  const name = before && typeof before.name === 'string' ? ` ${code(before.name)}` : '';
  const dependents = before && isRecord(before.dependents) ? before.dependents : null;
  const cascaded = before?.cascaded === true;

  let line = `Deleted${name}`;
  if (dependents) {
    const links = num(dependents.attributeLinks);
    const mappings = num(dependents.semanticMappings);
    const rels = num(dependents.relationships);
    const attrs = num(dependents.attributes);
    const parts: string[] = [];
    if (attrs > 0) parts.push(`${attrs} attribute${attrs === 1 ? '' : 's'}`);
    if (links > 0) parts.push(`${links} link${links === 1 ? '' : 's'}`);
    if (mappings > 0) parts.push(`${mappings} mapping${mappings === 1 ? '' : 's'}`);
    if (rels > 0) parts.push(`${rels} relationship${rels === 1 ? '' : 's'}`);
    if (parts.length > 0) {
      line += cascaded ? ` (cascaded ${parts.join(', ')})` : ` (${parts.join(', ')} remained)`;
    }
  }
  return [`${line}.`];
}

function formatSynthetic(event: AuditEvent): string[] {
  const after = asObject(event.afterState);
  if (!after) return ['Generated synthetic data.'];
  const rowCount = num(after.rowCount);
  const modelUsed = typeof after.modelUsed === 'string' ? after.modelUsed : 'an AI model';
  return [`Generated ${rowCount} synthetic row${rowCount === 1 ? '' : 's'} via ${modelUsed}.`];
}

// ────────────────────────────────────────────────────────────────────
// Per-field formatter
// ────────────────────────────────────────────────────────────────────

function describeFieldChange(field: string, prev: unknown, next: unknown): string {
  const label = FIELD_LABELS[field] ?? humaniseKey(field);

  // Booleans — phrase as state toggles when it reads naturally.
  if (typeof prev === 'boolean' || typeof next === 'boolean') {
    return describeBooleanChange(field, label, prev, next);
  }

  // Large text — don't dump the content; describe the change shape.
  if (LONG_TEXT_FIELDS.has(field)) {
    return describeLongTextChange(label, prev, next);
  }

  // Arrays — set-style diff when applicable.
  if (Array.isArray(prev) || Array.isArray(next)) {
    return describeArrayChange(label, prev, next);
  }

  // Objects (metadata jsonb) — key-count summary, no content enumeration.
  if (isRecord(prev) || isRecord(next)) {
    return describeObjectChange(label, prev, next);
  }

  // Nulls and primitives — scalar rendering.
  const prevRendered = renderScalar(prev);
  const nextRendered = renderScalar(next);
  if (prev == null && next != null) return `${label} set to ${nextRendered}.`;
  if (prev != null && next == null) return `${label} cleared (was ${prevRendered}).`;
  return `${label} changed from ${prevRendered} to ${nextRendered}.`;
}

function describeBooleanChange(field: string, label: string, prev: unknown, next: unknown): string {
  // Phrasing is field-specific so it reads English rather than
  // "isPrimaryKey changed from false to true".
  const turnedOn = next === true && prev !== true;
  const turnedOff = next === false && prev === true;

  if (field === 'isPrimaryKey') {
    if (turnedOn) return 'Marked as primary key.';
    if (turnedOff) return 'Removed primary key flag.';
  }
  if (field === 'isForeignKey') {
    if (turnedOn) return 'Marked as foreign key.';
    if (turnedOff) return 'Removed foreign key flag.';
  }
  if (field === 'isUnique') {
    if (turnedOn) return 'Marked as UNIQUE.';
    if (turnedOff) return 'Removed UNIQUE flag.';
  }
  if (field === 'isNullable') {
    // Inverted semantics — true=nullable, false=NOT NULL. Narrate the
    // constraint, not the internal boolean name.
    if (next === false) return 'Set NOT NULL.';
    if (next === true) return 'Allowed nulls.';
  }
  // Fallback generic.
  return `${label} changed from ${renderScalar(prev)} to ${renderScalar(next)}.`;
}

function describeLongTextChange(label: string, prev: unknown, next: unknown): string {
  const prevLen = typeof prev === 'string' ? prev.length : 0;
  const nextLen = typeof next === 'string' ? next.length : 0;
  if (prev == null && next != null) return `${label} set (${nextLen} chars).`;
  if (prev != null && next == null) return `${label} cleared (was ${prevLen} chars).`;
  return `${label} updated (${prevLen} → ${nextLen} chars).`;
}

function describeArrayChange(label: string, prev: unknown, next: unknown): string {
  const prevArr = Array.isArray(prev) ? prev : [];
  const nextArr = Array.isArray(next) ? next : [];
  const prevSet = new Set(prevArr.map(String));
  const nextSet = new Set(nextArr.map(String));
  const added = [...nextSet].filter((v) => !prevSet.has(v));
  const removed = [...prevSet].filter((v) => !nextSet.has(v));
  const parts: string[] = [];
  if (added.length > 0) parts.push(`added ${added.map((s) => code(s)).join(', ')}`);
  if (removed.length > 0) parts.push(`removed ${removed.map((s) => code(s)).join(', ')}`);
  if (parts.length === 0) return `${label} reordered.`;
  return `${label}: ${parts.join('; ')}.`;
}

function describeObjectChange(label: string, prev: unknown, next: unknown): string {
  const prevKeys = isRecord(prev) ? Object.keys(prev) : [];
  const nextKeys = isRecord(next) ? Object.keys(next) : [];
  const prevSet = new Set(prevKeys);
  const nextSet = new Set(nextKeys);
  const added = nextKeys.filter((k) => !prevSet.has(k));
  const removed = prevKeys.filter((k) => !nextSet.has(k));
  const changed = nextKeys.filter(
    (k) =>
      prevSet.has(k) &&
      !deepEqual((prev as Record<string, unknown>)[k], (next as Record<string, unknown>)[k]),
  );
  const total = added.length + removed.length + changed.length;
  if (total === 0) return `${label} updated.`;
  return `${label} updated (${total} key${total === 1 ? '' : 's'} changed).`;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function asObject(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const k of keysA) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
}

function code(s: string): string {
  return `\`${truncate(s, MAX_VALUE_CHARS)}\``;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function renderScalar(value: unknown): string {
  if (value == null) return '`null`';
  if (typeof value === 'string') return code(value);
  if (typeof value === 'number' || typeof value === 'boolean') return `\`${String(value)}\``;
  return `\`${truncate(JSON.stringify(value), MAX_VALUE_CHARS)}\``;
}

function humaniseKey(key: string): string {
  // Fallback for unknown fields — turn `someFieldName` into
  // "Some field name" so audit events for future columns don't look
  // like debugger output.
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
