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
  /** Optional object-type tag ('relationship' | 'attribute' | 'entity' …).
   *  When present and set to `'relationship'`, audit phrases are routed
   *  through the relationship formatter rather than the generic one. */
  objectType?: string;
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
  // Relationship-scoped fields (Step 6)
  sourceCardinality: 'Source cardinality',
  targetCardinality: 'Target cardinality',
  isIdentifying: 'Identifying',
  layer: 'Layer',
  sourceEntityId: 'Source entity',
  targetEntityId: 'Target entity',
  // Step 6 Direction A fields
  altKeyGroup: 'Alt key group',
  altKeyLabels: 'Alt key purposes',
  inverseName: 'Inverse verb phrase',
  displayId: 'Display id',
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
    // Relationship-scoped events get their own phrase set so the audit
    // trail reads as rel-native prose ("Linked Customer to Order…")
    // rather than generic field diffs.
    const isRel = event.objectType === 'relationship';
    switch (event.action) {
      case 'create':
        return isRel ? formatRelCreate(event) : formatCreate(event);
      case 'update':
        return isRel ? formatRelUpdate(event) : formatUpdate(event);
      case 'delete':
        return isRel ? formatRelDelete(event) : formatDelete(event);
      case 'synthetic_generated':
        return formatSynthetic(event);
      case 'attribute_order':
      case 'reorder':
        return ['Reordered attributes.'];
      case 'propagate':
        return formatPropagate(event);
      case 'unwind':
        return formatUnwind(event);
      case 'infer':
        return formatInfer(event);
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
// Relationship-scoped formatters (Step 6)
//
// Relationship audit rows carry `{ source: { name }, target: { name },
// sourceCardinality, targetCardinality, isIdentifying, layer, name }`
// in afterState / beforeState. We phrase each action so the audit tab
// reads as English prose — not a boolean diff.
// ────────────────────────────────────────────────────────────────────

function formatRelCreate(event: AuditEvent): string[] {
  const after = asObject(event.afterState);
  if (!after) return ['Linked two entities.'];
  const src = relEntityName(after.source);
  const tgt = relEntityName(after.target);
  const srcCard = relCard(after.sourceCardinality);
  const tgtCard = relCard(after.targetCardinality);
  const identifying = after.isIdentifying === true;
  const identTail = identifying ? ', identifying' : '';
  return [`Linked ${src} to ${tgt} (${srcCard}:${tgtCard}${identTail}).`];
}

function formatRelUpdate(event: AuditEvent): string[] {
  const before = asObject(event.beforeState);
  const after = asObject(event.afterState);
  if (!before || !after) return ['Updated relationship.'];

  const lines: string[] = [];

  // Cardinalities — phrase as arrow so the audit row reads like a
  // diagram change, not a string swap.
  if (!deepEqual(before.sourceCardinality, after.sourceCardinality)) {
    lines.push(
      `Changed source cardinality from ${relCard(before.sourceCardinality)}→${relCard(after.sourceCardinality)}.`,
    );
  }
  if (!deepEqual(before.targetCardinality, after.targetCardinality)) {
    lines.push(
      `Changed target cardinality from ${relCard(before.targetCardinality)}→${relCard(after.targetCardinality)}.`,
    );
  }

  // Identifying — state-toggle phrasing.
  if (!deepEqual(before.isIdentifying, after.isIdentifying)) {
    if (after.isIdentifying === true) lines.push('Marked as identifying.');
    else if (after.isIdentifying === false) lines.push('Unmarked as identifying.');
  }

  // Name — rename / unnamed / named.
  if (!deepEqual(before.name ?? null, after.name ?? null)) {
    const prev = before.name ?? null;
    const next = after.name ?? null;
    if (next && !prev) lines.push(`Named the relationship ${code(String(next))}.`);
    else if (!next && prev)
      lines.push(`Cleared the relationship name (was ${code(String(prev))}).`);
    else if (next && prev) lines.push(`Renamed to ${code(String(next))}.`);
  }

  // Layer — schema invariant says this can't legally change without a
  // move, but if it ever lands in an audit row we at least read well.
  if (!deepEqual(before.layer, after.layer)) {
    lines.push(`Moved to ${code(String(after.layer))} layer.`);
  }

  // Endpoint swap (flip direction) — handled as paired change.
  const endpointsSwapped =
    !deepEqual(before.sourceEntityId, after.sourceEntityId) &&
    !deepEqual(before.targetEntityId, after.targetEntityId);
  if (endpointsSwapped) {
    lines.push('Flipped relationship direction.');
  }

  return lines.length > 0 ? lines : ['Updated relationship. (No visible field differences.)'];
}

function formatRelDelete(event: AuditEvent): string[] {
  const before = asObject(event.beforeState);
  if (!before) return ['Removed a relationship.'];
  const src = relEntityName(before.source);
  const tgt = relEntityName(before.target);
  return [`Removed relationship ${src}→${tgt}.`];
}

function formatPropagate(event: AuditEvent): string[] {
  const after = asObject(event.afterState);
  if (!after) return ['Propagated primary-key attributes.'];
  const names = Array.isArray(after.propagatedAttributeNames)
    ? (after.propagatedAttributeNames as unknown[]).filter(
        (n): n is string => typeof n === 'string',
      )
    : [];
  const count = num(after.propagatedCount) || names.length;
  if (count === 0) return ['Propagated primary-key attributes.'];
  const label = names.length > 0 ? `: ${names.join(', ')}` : '';
  return [`Propagated ${count} composite PK attribute${count === 1 ? '' : 's'}${label}.`];
}

function formatUnwind(event: AuditEvent): string[] {
  const before = asObject(event.beforeState);
  const after = asObject(event.afterState);
  const ref = after ?? before;
  if (!ref) return ['Removed propagated PK attributes.'];
  const count =
    num(ref.unwoundCount) ||
    (Array.isArray(ref.unwoundAttributeNames)
      ? (ref.unwoundAttributeNames as unknown[]).length
      : 0);
  if (count === 0) return ['Removed propagated PK attributes.'];
  return [`Removed ${count} propagated PK attribute${count === 1 ? '' : 's'}.`];
}

function formatInfer(event: AuditEvent): string[] {
  const after = asObject(event.afterState);
  const count = after ? num(after.proposalCount) : 0;
  return [`Generated ${count} relationship proposal${count === 1 ? '' : 's'} from FK graph.`];
}

/** Extract a displayable entity name from `{ name }` blob in audit
 *  state. Falls back to `?` so no formatter ever produces "undefined". */
function relEntityName(raw: unknown): string {
  if (isRecord(raw) && typeof raw.name === 'string' && raw.name.length > 0) return raw.name;
  return '?';
}

/** Turn a canonical cardinality enum into a compact glyph that reads
 *  as ER-diagram notation inline. Unknown values fall through as-is. */
function relCard(raw: unknown): string {
  if (typeof raw !== 'string') return '?';
  switch (raw) {
    case 'one':
      return 'one';
    case 'many':
      return 'many';
    case 'zero_or_one':
      return 'zero-or-one';
    case 'zero_or_many':
      return 'zero-or-many';
    case 'one_or_many':
      return 'one-or-many';
    default:
      return raw;
  }
}

// ────────────────────────────────────────────────────────────────────
// Per-field formatter
// ────────────────────────────────────────────────────────────────────

function describeFieldChange(field: string, prev: unknown, next: unknown): string {
  const label = FIELD_LABELS[field] ?? humaniseKey(field);

  // Step 6 Direction A — BK / inverse-verb / display-id phrases.
  // Rendered as first-class English rather than generic field diffs so
  // the audit trail reads as "Flagged x as AK1" (not "Alt key group
  // changed from null to AK1").
  if (field === 'altKeyGroup') {
    return describeAltKeyGroupChange(prev, next);
  }
  if (field === 'inverseName') {
    return describeInverseNameChange(prev, next);
  }
  if (field === 'displayId') {
    return describeDisplayIdChange(prev, next);
  }
  if (field === 'altKeyLabels') {
    return describeAltKeyLabelsChange(prev, next);
  }

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

/** Step 6 Direction A — BK alt-key-group transitions. Four legal shapes:
 *   null      → AKn    "Flagged <attr> as AKn" (but attr name lives on
 *                      the row header, not in this phrase — the audit
 *                      tab prefixes every phrase with the object name).
 *   AKn       → null   "Cleared alt key group"
 *   AK1       → AK2    "Moved from AK1 to AK2"
 *   anything else falls through to a generic phrase. */
function describeAltKeyGroupChange(prev: unknown, next: unknown): string {
  const p = typeof prev === 'string' && prev.length > 0 ? prev : null;
  const n = typeof next === 'string' && next.length > 0 ? next : null;
  if (p == null && n != null) return `Flagged as ${code(n)}.`;
  if (p != null && n == null) return 'Cleared alt key group.';
  if (p != null && n != null) return `Moved from ${code(p)} to ${code(n)}.`;
  return 'Alt key group unchanged.';
}

/** Step 6 Direction A — optional per-AK-group purpose labels stored
 *  on the ENTITY (`alt_key_labels` JSONB). Diff shapes:
 *   {}           → {AK1:"X"}      "Set AK1 purpose: X"
 *   {AK1:"X"}    → {}              "Cleared AK1 purpose"
 *   {AK1:"old"}  → {AK1:"new"}     "Changed AK1 purpose from `old` to `new`"
 *   multi-key changes → "N alt key purposes updated" (no enumeration
 *   to keep audit lines scannable). */
function describeAltKeyLabelsChange(prev: unknown, next: unknown): string {
  const p = isRecord(prev) ? (prev as Record<string, unknown>) : {};
  const n = isRecord(next) ? (next as Record<string, unknown>) : {};
  const keys = new Set([...Object.keys(p), ...Object.keys(n)]);
  const diffs: Array<{ key: string; from: string | null; to: string | null }> = [];
  for (const key of keys) {
    const from = typeof p[key] === 'string' ? (p[key] as string) : null;
    const to = typeof n[key] === 'string' ? (n[key] as string) : null;
    if (from !== to) diffs.push({ key, from, to });
  }
  if (diffs.length === 0) return 'Alt key purposes unchanged.';
  if (diffs.length > 1) return `${diffs.length} alt key purposes updated.`;
  const { key, from, to } = diffs[0];
  if (from == null && to != null) return `Set ${code(key)} purpose: ${code(to)}.`;
  if (from != null && to == null) return `Cleared ${code(key)} purpose.`;
  return `Changed ${code(key)} purpose from ${code(from ?? '')} to ${code(to ?? '')}.`;
}

/** Step 6 Direction A — inverse verb phrase (target → source label). */
function describeInverseNameChange(prev: unknown, next: unknown): string {
  const p = typeof prev === 'string' && prev.length > 0 ? prev : null;
  const n = typeof next === 'string' && next.length > 0 ? next : null;
  if (p == null && n != null) return `Set inverse verb phrase to ${code(n)}.`;
  if (p != null && n == null) return `Cleared inverse verb phrase (was ${code(p)}).`;
  if (p != null && n != null) return `Renamed inverse verb phrase to ${code(n)}.`;
  return 'Inverse verb phrase unchanged.';
}

/** Step 6 Direction A — server-assigned display id (`E001`, `E002`, …).
 *  Display ids are monotonic + immutable once assigned, so in practice
 *  only the `null → En` transition fires in production. */
function describeDisplayIdChange(prev: unknown, next: unknown): string {
  const p = typeof prev === 'string' && prev.length > 0 ? prev : null;
  const n = typeof next === 'string' && next.length > 0 ? next : null;
  if (p == null && n != null) return `Assigned display id ${code(n)}.`;
  if (p != null && n == null) return `Cleared display id (was ${code(p)}).`;
  if (p != null && n != null) return `Reassigned display id from ${code(p)} to ${code(n)}.`;
  return 'Display id unchanged.';
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
