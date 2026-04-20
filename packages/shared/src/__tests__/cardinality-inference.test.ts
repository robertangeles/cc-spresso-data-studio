import { describe, it, expect } from 'vitest';
import { inferCardinalityFromFlags } from '../utils/cardinality-inference.js';

/**
 * Step 6 — cardinality inference from FK / PK / UNIQUE / NOT NULL flags.
 *
 * Maps to tasks/test-plan-model-studio.md case S6-U9.
 *
 * Truth table under test:
 *   | isFk  | targetIsPk | isUq  | isNn  | source        | target | confidence |
 *   | ----- | ---------- | ----- | ----- | ------------- | ------ | ---------- |
 *   | true  | true       | true  | true  | one           | one    | high       |
 *   | true  | true       | true  | false | zero_or_one   | one    | high       |
 *   | true  | true       | false | true  | one_or_many   | one    | medium     |
 *   | true  | true       | false | false | zero_or_many  | one    | medium     |
 *   | false | *          | *     | *     | null                                |
 *   | *     | false      | *     | *     | null                                |
 */

describe('inferCardinalityFromFlags', () => {
  it('S6-U9: FK + UQ + NN → source=one, target=one, confidence=high', () => {
    const result = inferCardinalityFromFlags({
      isFk: true,
      isUq: true,
      isNn: true,
      targetIsPk: true,
    });
    expect(result).toEqual({ source: 'one', target: 'one', confidence: 'high' });
  });

  it('S6-U9: FK nullable (UQ + !NN) → source=zero_or_one, confidence=high', () => {
    const result = inferCardinalityFromFlags({
      isFk: true,
      isUq: true,
      isNn: false,
      targetIsPk: true,
    });
    expect(result).toEqual({ source: 'zero_or_one', target: 'one', confidence: 'high' });
  });

  it('FK + NN + !UQ → source=one_or_many, confidence=medium', () => {
    const result = inferCardinalityFromFlags({
      isFk: true,
      isUq: false,
      isNn: true,
      targetIsPk: true,
    });
    expect(result).toEqual({ source: 'one_or_many', target: 'one', confidence: 'medium' });
  });

  it('FK + !NN + !UQ → source=zero_or_many, confidence=medium', () => {
    const result = inferCardinalityFromFlags({
      isFk: true,
      isUq: false,
      isNn: false,
      targetIsPk: true,
    });
    expect(result).toEqual({ source: 'zero_or_many', target: 'one', confidence: 'medium' });
  });

  it('returns null when source is not an FK (regardless of other flags)', () => {
    expect(
      inferCardinalityFromFlags({
        isFk: false,
        isUq: true,
        isNn: true,
        targetIsPk: true,
      }),
    ).toBeNull();
    expect(
      inferCardinalityFromFlags({
        isFk: false,
        isUq: false,
        isNn: false,
        targetIsPk: true,
      }),
    ).toBeNull();
  });

  it('returns null when target is not a PK (dangling FK)', () => {
    expect(
      inferCardinalityFromFlags({
        isFk: true,
        isUq: true,
        isNn: true,
        targetIsPk: false,
      }),
    ).toBeNull();
  });

  it('target side is always `one` when inference succeeds', () => {
    const combos = [
      { isUq: true, isNn: true },
      { isUq: true, isNn: false },
      { isUq: false, isNn: true },
      { isUq: false, isNn: false },
    ];
    for (const c of combos) {
      const result = inferCardinalityFromFlags({ ...c, isFk: true, targetIsPk: true });
      expect(result?.target).toBe('one');
    }
  });
});
