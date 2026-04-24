import { describe, it, expect } from 'vitest';
import { formatCardinalityText } from '../utils/cardinality-text.js';
import type { Cardinality, Notation } from '../utils/model-studio.schemas.js';

/**
 * Step 6 Direction A — cardinality text labels.
 *
 * 5 cardinalities × 2 notations = 10 cases.
 */

describe('formatCardinalityText', () => {
  describe('IE notation', () => {
    const notation: Notation = 'ie';

    it('one → 1..1', () => {
      expect(formatCardinalityText('one', notation)).toBe('1..1');
    });

    it('zero_or_one → 0..1', () => {
      expect(formatCardinalityText('zero_or_one', notation)).toBe('0..1');
    });

    it('many → 1..*', () => {
      expect(formatCardinalityText('many', notation)).toBe('1..*');
    });

    it('zero_or_many → 0..*', () => {
      expect(formatCardinalityText('zero_or_many', notation)).toBe('0..*');
    });

    it('one_or_many → 1..*', () => {
      expect(formatCardinalityText('one_or_many', notation)).toBe('1..*');
    });
  });

  describe('IDEF1X notation', () => {
    const notation: Notation = 'idef1x';

    it('one → 1', () => {
      expect(formatCardinalityText('one', notation)).toBe('1');
    });

    it('zero_or_one → Z', () => {
      expect(formatCardinalityText('zero_or_one', notation)).toBe('Z');
    });

    it('many → M', () => {
      expect(formatCardinalityText('many', notation)).toBe('M');
    });

    it('zero_or_many → Z (zero-or-more per IDEF1X spec)', () => {
      expect(formatCardinalityText('zero_or_many', notation)).toBe('Z');
    });

    it('one_or_many → P', () => {
      expect(formatCardinalityText('one_or_many', notation)).toBe('P');
    });
  });

  it('covers every cardinality × notation pair (no gaps)', () => {
    const cards: Cardinality[] = ['one', 'zero_or_one', 'many', 'zero_or_many', 'one_or_many'];
    const notations: Notation[] = ['ie', 'idef1x'];
    for (const c of cards) {
      for (const n of notations) {
        const text = formatCardinalityText(c, n);
        expect(text).toBeTruthy();
        expect(typeof text).toBe('string');
      }
    }
  });
});
