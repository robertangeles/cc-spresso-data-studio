/**
 * Step 5 follow-up — attribute flag invariant normaliser.
 *
 * Encodes SQL-definitional rules for PK / FK / NOT NULL / UNIQUE and
 * — as of Step 6 Direction A — the BK (business-key / alt-key) group
 * rule. One place so create/update paths (and their tests) don't
 * scatter the logic. The service calls this once per mutation before
 * writing to the DB; the result is the final row shape.
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
 *   3. PK and BK (alt-key group) can co-exist on the same column.
 *      Natural keys are simultaneously the PK and the business key
 *      (ISBN on a `book`, VIN on a `vehicle`). The normaliser never
 *      rejects this combination.
 *
 *   4. BK group set  ⇒  NN = true + UQ = true.
 *      A member of an AK group must never be nullable (otherwise the
 *      composite UNIQUE constraint is meaningless in Postgres, which
 *      treats nulls as distinct). `isUnique` is also forced — for a
 *      single-column BK it matches the emitted DDL, and for a composite
 *      BK it flags each member as "participating in a UNIQUE"; the
 *      DDL exporter collapses same-group members into ONE composite
 *      UNIQUE constraint at export time.
 *      Coerced silently, mirroring the PK⇒NN+UQ rule.
 *
 *   5. No other dependencies.
 *      NN / UQ remain independent of FK. Nullable FKs are legal.
 *      Unique + nullable is legal (Postgres permits multiple nulls in
 *      a UNIQUE index).
 *
 * When PK is turned OFF, NN and UQ are STICKY — they stay at whatever
 * the user had them at while PK was on (or whatever the patch
 * supplies). This matches the behaviour users expect from Erwin and
 * avoids the "where did my NOT NULL go?" surprise. The same sticky
 * behaviour applies when the BK group is cleared (to null).
 *
 * Group-name format: the schema layer (zod) enforces `^AK\d+$` before
 * the value reaches the normaliser. This module still guards the
 * format in case a caller bypasses zod; empty strings are treated as
 * null (no group).
 */

export interface AttributeFlags {
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
  /** True when the user explicitly set `isUnique=true` (not coerced by
   *  PK or AK designation). Used to distinguish intentional UNIQUE
   *  constraints from sticky-UQ leftovers after a PK or AK is cleared.
   *  Only explicit-UQ columns are surfaced as FK-targetable candidate
   *  keys alongside PK and AK members. */
  isExplicitUnique: boolean;
  /** `AK1`, `AK2`, …, or `null` (no business-key group). */
  altKeyGroup: string | null;
}

export interface AttributeFlagsInput {
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  /** Explicit override. Usually callers should omit this and let the
   *  normaliser auto-derive it from `isUnique` patches (see behaviour
   *  below) — but admin/migration paths can set it directly. */
  isExplicitUnique?: boolean;
  /** Supply `null` (or an empty string — treated as null) to clear. */
  altKeyGroup?: string | null;
}

const CREATE_DEFAULTS: AttributeFlags = {
  isPrimaryKey: false,
  isForeignKey: false,
  isNullable: true,
  isUnique: false,
  isExplicitUnique: false,
  altKeyGroup: null,
};

/** Valid AK group label format — `AK` followed by one or more digits.
 *  `AK1`, `AK22`, `AK999` all pass; `ak1`, `BK1`, `AK`, `AK-1`, `AK 1`
 *  all fail. Matches the zod regex in shared so invalid values
 *  consistently throw the same ValidationError regardless of entry
 *  point. */
const AK_GROUP_FORMAT = /^AK\d+$/;

/** Thrown when the `altKeyGroup` patch value is malformed. Service
 *  callers convert this into a `ValidationError` with the field path
 *  so the API returns a clean 422. Subclass of `RangeError` to stay
 *  consistent with the pattern already used by
 *  `normalizeRelationship` for invalid enum values. */
export class AltKeyGroupFormatError extends RangeError {
  constructor(value: string) {
    super(`altKeyGroup must match /^AK\\d+$/ (got "${value}"). Valid examples: AK1, AK2, AK10.`);
    this.name = 'AltKeyGroupFormatError';
  }
}

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

  // Empty-string and null both mean "no group". Undefined means "patch
  // did not touch the field — keep the current value."
  let effectiveAkGroup: string | null;
  if (input.altKeyGroup === undefined) {
    effectiveAkGroup = base.altKeyGroup;
  } else if (input.altKeyGroup === null || input.altKeyGroup === '') {
    effectiveAkGroup = null;
  } else {
    if (!AK_GROUP_FORMAT.test(input.altKeyGroup)) {
      throw new AltKeyGroupFormatError(input.altKeyGroup);
    }
    effectiveAkGroup = input.altKeyGroup;
  }

  const merged: AttributeFlags = {
    isPrimaryKey: input.isPrimaryKey ?? base.isPrimaryKey,
    isForeignKey: input.isForeignKey ?? base.isForeignKey,
    isNullable: input.isNullable ?? base.isNullable,
    isUnique: input.isUnique ?? base.isUnique,
    isExplicitUnique: input.isExplicitUnique ?? base.isExplicitUnique,
    altKeyGroup: effectiveAkGroup,
  };

  // Derive isExplicitUnique from isUnique patches when the caller didn't
  // override it directly. A UQ toggle outside of a PK/AK coercion context
  // = explicit user intent. A UQ toggle to false = user explicitly
  // removing the constraint (also clears explicit marker).
  if (input.isExplicitUnique === undefined && input.isUnique !== undefined) {
    if (input.isUnique === false) {
      merged.isExplicitUnique = false;
    } else if (!merged.isPrimaryKey && merged.altKeyGroup === null) {
      // isUnique=true patched on a non-PK, non-AK row → explicit intent.
      merged.isExplicitUnique = true;
    }
    // else: PK or AK is also being set in this patch and would have
    // coerced UQ anyway — don't auto-mark as explicit.
  }

  // Invariant #1 — PK implies NN + UQ. Silent coerce.
  if (merged.isPrimaryKey) {
    merged.isNullable = false;
    merged.isUnique = true;
  }

  // Invariant #4 — BK group set ⇒ NN + UQ. Silent coerce. Runs AFTER
  // the PK rule so PK+BK on the same column (natural key) stays
  // internally consistent.
  if (merged.altKeyGroup !== null) {
    merged.isNullable = false;
    merged.isUnique = true;
  }

  return merged;
}
