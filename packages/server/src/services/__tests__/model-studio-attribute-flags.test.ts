import { describe, it, expect } from 'vitest';
import {
  AltKeyGroupFormatError,
  normalizeAttributeFlags,
  type AttributeFlags,
} from '../model-studio-attribute-flags.js';

/**
 * Pure-function tests for the attribute-flag invariant normaliser.
 *
 * These tests encode SQL-definitional rules for PK / FK / NN / UQ and
 * (Step 6 Direction A) the BK/alt-key-group rules; they're the single
 * source of truth for "what combinations are legal" and let the
 * service methods stay boring call-sites.
 */

describe('normalizeAttributeFlags — create-path (no current row)', () => {
  it('defaults (empty input) → not-pk, not-fk, nullable, not-unique, no ak group', () => {
    expect(normalizeAttributeFlags({})).toEqual({
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true,
      isUnique: false,
      altKeyGroup: null,
    });
  });

  it('PK=true silently forces NN=true + UQ=true even with conflicting input', () => {
    const result = normalizeAttributeFlags({
      isPrimaryKey: true,
      isNullable: true,
      isUnique: false,
    });
    expect(result.isPrimaryKey).toBe(true);
    expect(result.isNullable).toBe(false);
    expect(result.isUnique).toBe(true);
  });

  it('PK=true + FK=true both persist (subtype / 1:1 / composite FK patterns)', () => {
    const result = normalizeAttributeFlags({
      isPrimaryKey: true,
      isForeignKey: true,
    });
    expect(result.isPrimaryKey).toBe(true);
    expect(result.isForeignKey).toBe(true);
    expect(result.isNullable).toBe(false); // PK invariant still applies
    expect(result.isUnique).toBe(true);
  });

  it('FK alone leaves NN/UQ untouched from defaults', () => {
    const result = normalizeAttributeFlags({ isForeignKey: true });
    expect(result).toEqual({
      isPrimaryKey: false,
      isForeignKey: true,
      isNullable: true,
      isUnique: false,
      altKeyGroup: null,
    });
  });

  it('UQ alone is legal with nullable (Postgres allows multiple nulls in a UNIQUE index)', () => {
    const result = normalizeAttributeFlags({ isUnique: true });
    expect(result).toEqual({
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true,
      isUnique: true,
      altKeyGroup: null,
    });
  });
});

describe('normalizeAttributeFlags — update-path (merge with current row)', () => {
  const pkCurrent: AttributeFlags = {
    isPrimaryKey: true,
    isForeignKey: false,
    isNullable: false,
    isUnique: true,
    altKeyGroup: null,
  };

  it('patch sets isNullable=true on a PK row → silently coerces back to false', () => {
    const result = normalizeAttributeFlags({ isNullable: true }, pkCurrent);
    expect(result.isNullable).toBe(false);
    expect(result.isPrimaryKey).toBe(true);
  });

  it('patch sets isUnique=false on a PK row → silently coerces back to true', () => {
    const result = normalizeAttributeFlags({ isUnique: false }, pkCurrent);
    expect(result.isUnique).toBe(true);
    expect(result.isPrimaryKey).toBe(true);
  });

  it('patch clears PK — NN and UQ stay STICKY at their current values', () => {
    const result = normalizeAttributeFlags({ isPrimaryKey: false }, pkCurrent);
    expect(result.isPrimaryKey).toBe(false);
    expect(result.isNullable).toBe(false); // sticky — still NOT NULL
    expect(result.isUnique).toBe(true); // sticky — still UNIQUE
  });

  it('patch clears PK AND sets isNullable=true → PK off, NN becomes true', () => {
    const result = normalizeAttributeFlags({ isPrimaryKey: false, isNullable: true }, pkCurrent);
    expect(result.isPrimaryKey).toBe(false);
    expect(result.isNullable).toBe(true);
    expect(result.isUnique).toBe(true); // sticky unchanged
  });

  it('patch sets PK=true on an FK row — both stay true (no more PK-clears-FK)', () => {
    const fkCurrent: AttributeFlags = {
      isPrimaryKey: false,
      isForeignKey: true,
      isNullable: true,
      isUnique: false,
      altKeyGroup: null,
    };
    const result = normalizeAttributeFlags({ isPrimaryKey: true }, fkCurrent);
    expect(result.isPrimaryKey).toBe(true);
    expect(result.isForeignKey).toBe(true);
    expect(result.isNullable).toBe(false); // PK invariant
    expect(result.isUnique).toBe(true); // PK invariant
  });

  it('patch with only isForeignKey=true on a PK row — PK stays on, FK is added', () => {
    const result = normalizeAttributeFlags({ isForeignKey: true }, pkCurrent);
    expect(result.isPrimaryKey).toBe(true);
    expect(result.isForeignKey).toBe(true);
    expect(result.isNullable).toBe(false);
    expect(result.isUnique).toBe(true);
  });

  it('empty patch is a no-op — returns the current row shape', () => {
    const result = normalizeAttributeFlags({}, pkCurrent);
    expect(result).toEqual(pkCurrent);
  });
});

// ================================================================
// Step 6 Direction A — BK / alt-key-group invariant (#4)
// ================================================================

describe('normalizeAttributeFlags — BK / alt-key-group (Direction A)', () => {
  const cleanCurrent: AttributeFlags = {
    isPrimaryKey: false,
    isForeignKey: false,
    isNullable: true,
    isUnique: false,
    altKeyGroup: null,
  };

  it('single-col BK: altKeyGroup=AK1 alone → auto-sets NN=true, UQ=true', () => {
    const result = normalizeAttributeFlags({ altKeyGroup: 'AK1' });
    expect(result.altKeyGroup).toBe('AK1');
    expect(result.isNullable).toBe(false);
    expect(result.isUnique).toBe(true);
    expect(result.isPrimaryKey).toBe(false);
    expect(result.isForeignKey).toBe(false);
  });

  it('composite BK: two cols both altKeyGroup=AK1 → each row is NN+UQ (composite UNIQUE emitted at DDL export)', () => {
    // Modeller sets altKeyGroup=AK1 on two separate attributes; the
    // normaliser treats each in isolation and returns the per-row
    // flag shape. The DDL exporter reads all attributes in the entity
    // sharing the same group and emits ONE composite UNIQUE constraint.
    const col1 = normalizeAttributeFlags({ altKeyGroup: 'AK1' });
    const col2 = normalizeAttributeFlags({
      altKeyGroup: 'AK1',
      // A caller asserting nullable=true on a composite BK member is
      // still silently coerced: nulls break composite UNIQUE semantics
      // in Postgres.
      isNullable: true,
    });
    expect(col1.altKeyGroup).toBe('AK1');
    expect(col1.isNullable).toBe(false);
    expect(col1.isUnique).toBe(true);
    expect(col2.altKeyGroup).toBe('AK1');
    expect(col2.isNullable).toBe(false);
    expect(col2.isUnique).toBe(true);
  });

  it('PK + BK coexist: isPk=true + altKeyGroup=AK1 → all invariants hold, no error', () => {
    // Natural PK pattern: ISBN on `book`, VIN on `vehicle`. The column
    // is simultaneously the primary key and the business key.
    const result = normalizeAttributeFlags({
      isPrimaryKey: true,
      altKeyGroup: 'AK1',
    });
    expect(result.isPrimaryKey).toBe(true);
    expect(result.altKeyGroup).toBe('AK1');
    expect(result.isNullable).toBe(false);
    expect(result.isUnique).toBe(true);
  });

  it('flip BK off: altKeyGroup cleared (null) → NN + UQ stay STICKY (mirrors PK unwind)', () => {
    const bkCurrent: AttributeFlags = {
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: false,
      isUnique: true,
      altKeyGroup: 'AK1',
    };
    const result = normalizeAttributeFlags({ altKeyGroup: null }, bkCurrent);
    expect(result.altKeyGroup).toBeNull();
    // Sticky: neither flag snaps back to default after the BK marker
    // is removed. This matches Erwin's "I explicitly marked it NOT
    // NULL" expectation.
    expect(result.isNullable).toBe(false);
    expect(result.isUnique).toBe(true);
  });

  it('invalid group name (lowercase): altKeyGroup="ak1" → AltKeyGroupFormatError', () => {
    expect(() => normalizeAttributeFlags({ altKeyGroup: 'ak1' }, cleanCurrent)).toThrow(
      AltKeyGroupFormatError,
    );
  });

  it('invalid group name (punctuation): altKeyGroup="bad!name" → AltKeyGroupFormatError', () => {
    expect(() => normalizeAttributeFlags({ altKeyGroup: 'bad!name' })).toThrow(
      AltKeyGroupFormatError,
    );
  });

  it('empty string altKeyGroup is treated as null (no group)', () => {
    const result = normalizeAttributeFlags({ altKeyGroup: '' });
    expect(result.altKeyGroup).toBeNull();
    // And — critically — the BK invariant does NOT fire on an empty
    // string, so NN/UQ stay at their defaults.
    expect(result.isNullable).toBe(true);
    expect(result.isUnique).toBe(false);
  });

  it('undefined altKeyGroup in patch preserves current row value (no accidental clear)', () => {
    const bkCurrent: AttributeFlags = {
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: false,
      isUnique: true,
      altKeyGroup: 'AK2',
    };
    // Patch only touches the name — altKeyGroup must survive unchanged.
    const result = normalizeAttributeFlags({}, bkCurrent);
    expect(result.altKeyGroup).toBe('AK2');
    expect(result.isNullable).toBe(false);
    expect(result.isUnique).toBe(true);
  });

  it('migrate group: patch altKeyGroup=AK1 → AK2 on an existing BK row preserves NN+UQ', () => {
    const bkCurrent: AttributeFlags = {
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: false,
      isUnique: true,
      altKeyGroup: 'AK1',
    };
    const result = normalizeAttributeFlags({ altKeyGroup: 'AK2' }, bkCurrent);
    expect(result.altKeyGroup).toBe('AK2');
    expect(result.isNullable).toBe(false);
    expect(result.isUnique).toBe(true);
  });
});
