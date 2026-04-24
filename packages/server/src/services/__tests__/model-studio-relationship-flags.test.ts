import { describe, it, expect } from 'vitest';
import { normalizeRelationship } from '../model-studio-relationship-flags.js';

/**
 * Pure-function tests for `normalizeRelationship`.
 * Covers S6-U8 (trim + enum rejection) and its close neighbours.
 */

describe('normalizeRelationship — name normalisation', () => {
  it('trims whitespace and preserves legitimate names', () => {
    const r = normalizeRelationship({
      name: '  places  ',
      sourceCardinality: 'one',
      targetCardinality: 'many',
      layer: 'logical',
      isIdentifying: false,
    });
    expect(r.normalized.name).toBe('places');
  });

  it('collapses blank / whitespace-only names to null (name is optional)', () => {
    const r = normalizeRelationship({
      name: '   ',
      sourceCardinality: 'one',
      targetCardinality: 'many',
      layer: 'logical',
      isIdentifying: false,
    });
    expect(r.normalized.name).toBeNull();
  });

  it('passes null name through as null', () => {
    const r = normalizeRelationship({
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      layer: 'logical',
      isIdentifying: false,
    });
    expect(r.normalized.name).toBeNull();
  });
});

describe('normalizeRelationship — enum canonicalisation', () => {
  it('lowercases CARDINALITY values that the client sent uppercase', () => {
    const r = normalizeRelationship({
      name: null,
      sourceCardinality: 'ONE',
      targetCardinality: 'Many',
      layer: 'logical',
      isIdentifying: false,
    });
    expect(r.normalized.sourceCardinality).toBe('one');
    expect(r.normalized.targetCardinality).toBe('many');
  });

  it('rejects invalid cardinality with RangeError — callers wrap as 422', () => {
    expect(() =>
      normalizeRelationship({
        name: null,
        sourceCardinality: 'sometimes',
        targetCardinality: 'many',
        layer: 'logical',
        isIdentifying: false,
      }),
    ).toThrow(RangeError);
  });

  it('rejects invalid layer with RangeError', () => {
    expect(() =>
      normalizeRelationship({
        name: null,
        sourceCardinality: 'one',
        targetCardinality: 'many',
        layer: 'temporal', // not a valid Layer
        isIdentifying: false,
      }),
    ).toThrow(RangeError);
  });
});

describe('normalizeRelationship — naming lint pass-through', () => {
  it('emits camelCase warning when name is CustomerOrders', () => {
    const r = normalizeRelationship({
      name: 'CustomerOrders',
      sourceCardinality: 'one',
      targetCardinality: 'many',
      layer: 'logical',
      isIdentifying: false,
    });
    const caseRule = r.warnings.find((w) => w.rule === 'relationship_name_case');
    expect(caseRule).toBeDefined();
    expect(caseRule?.severity).toBe('warning');
  });

  it('empty name → silent (no warnings)', () => {
    const r = normalizeRelationship({
      name: null,
      sourceCardinality: 'one',
      targetCardinality: 'many',
      layer: 'logical',
      isIdentifying: false,
    });
    const caseRule = r.warnings.find((w) => w.rule === 'relationship_name_case');
    expect(caseRule).toBeUndefined();
  });

  it('physical layer + non-snake_case name → violation', () => {
    const r = normalizeRelationship({
      name: 'CustomerOrders',
      sourceCardinality: 'one',
      targetCardinality: 'many',
      layer: 'physical',
      isIdentifying: false,
    });
    const snake = r.warnings.find((w) => w.rule === 'snake_case');
    expect(snake).toBeDefined();
    expect(snake?.severity).toBe('violation');
  });
});

describe('normalizeRelationship — partial input', () => {
  it('omitted fields pass through as undefined (update-path)', () => {
    const r = normalizeRelationship({ name: 'places' });
    expect(r.normalized.sourceCardinality).toBeUndefined();
    expect(r.normalized.targetCardinality).toBeUndefined();
    expect(r.normalized.layer).toBeUndefined();
  });

  it('layer omitted → no naming-lint warnings because layer-dependent rules cannot fire', () => {
    const r = normalizeRelationship({ name: 'places' });
    expect(r.warnings).toEqual([]);
  });
});
