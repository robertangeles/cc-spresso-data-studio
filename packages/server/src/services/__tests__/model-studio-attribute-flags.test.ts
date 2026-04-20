import { describe, it, expect } from 'vitest';
import { normalizeAttributeFlags, type AttributeFlags } from '../model-studio-attribute-flags.js';

/**
 * Pure-function tests for the attribute-flag invariant normaliser.
 *
 * These tests encode SQL-definitional rules for PK / FK / NN / UQ;
 * they're the single source of truth for "what combinations are
 * legal" and let the service methods stay boring call-sites.
 */

describe('normalizeAttributeFlags — create-path (no current row)', () => {
  it('defaults (empty input) → not-pk, not-fk, nullable, not-unique', () => {
    expect(normalizeAttributeFlags({})).toEqual({
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true,
      isUnique: false,
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
    });
  });

  it('UQ alone is legal with nullable (Postgres allows multiple nulls in a UNIQUE index)', () => {
    const result = normalizeAttributeFlags({ isUnique: true });
    expect(result).toEqual({
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: true,
      isUnique: true,
    });
  });
});

describe('normalizeAttributeFlags — update-path (merge with current row)', () => {
  const pkCurrent: AttributeFlags = {
    isPrimaryKey: true,
    isForeignKey: false,
    isNullable: false,
    isUnique: true,
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
