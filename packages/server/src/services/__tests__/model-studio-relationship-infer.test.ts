import { describe, it, expect } from 'vitest';
import { inferCardinalityFromFlags } from '@cc/shared';

/**
 * Pure-function tests for the FK-graph inference heuristics that live
 * in shared (so the client can preview). The database-backed service
 * (`inferRelationshipsFromFkGraph`) is exercised in the integration
 * suite (S6-I9 / S6-I10); this file covers the decision table.
 *
 * Maps to S6-U9 + S6-U17 (partial — the "10 FK attrs → 10 proposals"
 * assertion requires the DB so it lives in integration tests).
 */

describe('inferCardinalityFromFlags — decision table', () => {
  it('FK + UQ + NN → source=one, confidence=high', () => {
    const r = inferCardinalityFromFlags({
      isFk: true,
      isUq: true,
      isNn: true,
      targetIsPk: true,
    });
    expect(r).toEqual({ source: 'one', target: 'one', confidence: 'high' });
  });

  it('FK + UQ + nullable → source=zero_or_one, confidence=high', () => {
    const r = inferCardinalityFromFlags({
      isFk: true,
      isUq: true,
      isNn: false,
      targetIsPk: true,
    });
    expect(r).toEqual({ source: 'zero_or_one', target: 'one', confidence: 'high' });
  });

  it('FK + non-unique + NN → source=one_or_many, confidence=medium', () => {
    const r = inferCardinalityFromFlags({
      isFk: true,
      isUq: false,
      isNn: true,
      targetIsPk: true,
    });
    expect(r).toEqual({ source: 'one_or_many', target: 'one', confidence: 'medium' });
  });

  it('FK + non-unique + nullable → source=zero_or_many, confidence=medium', () => {
    const r = inferCardinalityFromFlags({
      isFk: true,
      isUq: false,
      isNn: false,
      targetIsPk: true,
    });
    expect(r).toEqual({ source: 'zero_or_many', target: 'one', confidence: 'medium' });
  });

  it('not a FK → null (callers must skip, never guess)', () => {
    expect(
      inferCardinalityFromFlags({
        isFk: false,
        isUq: true,
        isNn: true,
        targetIsPk: true,
      }),
    ).toBeNull();
  });

  it('target is not PK → null (source-side flags do not rescue the inference)', () => {
    expect(
      inferCardinalityFromFlags({
        isFk: true,
        isUq: true,
        isNn: true,
        targetIsPk: false,
      }),
    ).toBeNull();
  });
});
