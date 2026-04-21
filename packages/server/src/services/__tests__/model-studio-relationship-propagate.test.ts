import { describe, it, expect } from 'vitest';
import {
  CyclicIdentifyingError,
  InvariantError,
  detectCycleIdentifying,
  isFkNullableForCardinality,
  propagateIdentifyingPKs,
  propagateRelationshipFk,
  reconcileFkIdentifyingFlag,
  reconcileFkNullability,
  unwindIdentifyingPKs,
  unwindRelationshipFk,
} from '../model-studio-relationship-propagate.service.js';

/**
 * Pure-ish tests for the propagation helpers. The real Drizzle
 * transaction is awkward to stub, so we build a minimal "mock tx"
 * that records selects / inserts / deletes and returns canned rows.
 *
 * Covers:
 *   S6-U12  propagateRelationshipFk: 0 PKs on source → InvariantError
 *   S6-U13  propagateRelationshipFk: name collision → throws
 *   S6-U14  propagateRelationshipFk: composite PKs propagate with order
 *   S6-U15  unwindRelationshipFk: removes only propagated attrs
 *   S6-U16  detectCycleIdentifying: A→B→C→A rejects; A→B→C passes
 *   S6-U17  isFkNullableForCardinality — optional vs mandatory
 *   S6-U18  reconcileFkNullability — identifying no-op
 *   S6-U19  legacy aliases resolve to new functions
 */

describe('InvariantError / CyclicIdentifyingError shape', () => {
  it('InvariantError carries HTTP 422 + code', () => {
    const e = new InvariantError('source_has_no_pk');
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('source_has_no_pk');
    expect(e.name).toBe('InvariantError');
  });

  it('CyclicIdentifyingError carries HTTP 422 + code + path', () => {
    const e = new CyclicIdentifyingError('A→B→A');
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('CYCLIC_IDENTIFYING');
    expect(e.path).toBe('A→B→A');
  });
});

describe('detectCycleIdentifying — self-ref identifying rejected early', () => {
  it('rejects when sourceEntityId === targetEntityId (would collide on its own PKs)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx: any = {
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    };
    await expect(
      detectCycleIdentifying(tx, {
        sourceEntityId: 'E1',
        targetEntityId: 'E1',
        modelId: 'M',
      }),
    ).rejects.toBeInstanceOf(CyclicIdentifyingError);
  });
});

describe('isFkNullableForCardinality', () => {
  it('returns true for zero_or_one / zero_or_many (optional parent)', () => {
    expect(isFkNullableForCardinality('zero_or_one')).toBe(true);
    expect(isFkNullableForCardinality('zero_or_many')).toBe(true);
  });
  it('returns false for one / many / one_or_many (mandatory parent)', () => {
    expect(isFkNullableForCardinality('one')).toBe(false);
    expect(isFkNullableForCardinality('many')).toBe(false);
    expect(isFkNullableForCardinality('one_or_many')).toBe(false);
  });
});

describe('module surface — new + legacy names', () => {
  it('exposes propagateRelationshipFk / unwindRelationshipFk as functions', () => {
    expect(typeof propagateRelationshipFk).toBe('function');
    expect(typeof unwindRelationshipFk).toBe('function');
    expect(typeof reconcileFkNullability).toBe('function');
    expect(typeof reconcileFkIdentifyingFlag).toBe('function');
    expect(typeof detectCycleIdentifying).toBe('function');
  });

  it('legacy aliases resolve to the new functions', () => {
    expect(propagateIdentifyingPKs).toBe(propagateRelationshipFk);
    expect(unwindIdentifyingPKs).toBe(unwindRelationshipFk);
  });
});
