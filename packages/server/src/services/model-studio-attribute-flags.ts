/**
 * Step 5 follow-up — attribute flag invariant normaliser.
 *
 * Encodes SQL-definitional rules for PK / FK / NOT NULL / UNIQUE in
 * one place so create/update paths (and their tests) don't scatter
 * the logic. The service calls this once per mutation before writing
 * to the DB; the result is the final row shape.
 *
 * Invariants:
 *   1. PK = true  ⇒  NN = true (NOT NULL), UQ = true (UNIQUE).
 *      SQL definitional — a PRIMARY KEY constraint implies both.
 *      Coerced silently: if a caller supplies NN=false or UQ=false
 *      alongside PK=true (or mutates an already-PK row), the flags
 *      snap to (NN=true, UQ=true) without throwing.
 *
 *   2. PK and FK can co-exist on the same column.
 *      Subtype / supertype (`employee.id` → `person.id`),
 *      1:1 extensions (`customer_prefs.customer_id` → `customer.id`),
 *      and identifying composite FKs all require this.
 *      Any earlier "PK clears FK" rule was wrong and has been removed.
 *
 *   3. No other dependencies.
 *      NN / UQ remain independent of FK. Nullable FKs are legal.
 *      Unique + nullable is legal (Postgres permits multiple nulls in
 *      a UNIQUE index).
 *
 * When PK is turned OFF, NN and UQ are STICKY — they stay at whatever
 * the user had them at while PK was on (or whatever the patch
 * supplies). This matches the behaviour users expect from Erwin and
 * avoids the "where did my NOT NULL go?" surprise.
 */

export interface AttributeFlags {
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
}

export interface AttributeFlagsInput {
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
}

const CREATE_DEFAULTS: AttributeFlags = {
  isPrimaryKey: false,
  isForeignKey: false,
  isNullable: true,
  isUnique: false,
};

/**
 * Merge an input patch with the current row (if any) and apply the
 * invariants. Pure function — no DB calls, no logging. Tested in
 * isolation at packages/server/src/services/__tests__/model-studio-attribute-flags.test.ts.
 */
export function normalizeAttributeFlags(
  input: AttributeFlagsInput,
  current?: AttributeFlags,
): AttributeFlags {
  const base = current ?? CREATE_DEFAULTS;

  const merged: AttributeFlags = {
    isPrimaryKey: input.isPrimaryKey ?? base.isPrimaryKey,
    isForeignKey: input.isForeignKey ?? base.isForeignKey,
    isNullable: input.isNullable ?? base.isNullable,
    isUnique: input.isUnique ?? base.isUnique,
  };

  // Invariant #1 — PK implies NN + UQ. Silent coerce.
  if (merged.isPrimaryKey) {
    merged.isNullable = false;
    merged.isUnique = true;
  }

  return merged;
}
