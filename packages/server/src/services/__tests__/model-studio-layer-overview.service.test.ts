import { describe, it, expect } from 'vitest';
import {
  buildCoverageMatrix,
  buildNameMatchSuggestions,
} from '../model-studio-layer-overview.service.js';

/**
 * Unit tests for the two pure helpers powering the layer-overview
 * surface. DB-integrated behaviour of the service methods is covered
 * by the integration suite (Task 15).
 */

describe('buildCoverageMatrix', () => {
  it('returns own-layer only for an unlinked entity', () => {
    const entities = [{ id: 'a', layer: 'conceptual' }];
    const matrix = buildCoverageMatrix(entities, []);
    expect(matrix.a).toEqual({
      conceptual: true,
      logical: false,
      physical: false,
    });
  });

  it('marks child layer on parent AND parent layer on child for a one-hop link', () => {
    // conceptual A → logical B. Both entities should report both
    // layers covered (direct one-hop in either direction).
    const entities = [
      { id: 'a', layer: 'conceptual' },
      { id: 'b', layer: 'logical' },
    ];
    const links = [{ parentId: 'a', childId: 'b' }];
    const matrix = buildCoverageMatrix(entities, links);
    expect(matrix.a).toEqual({
      conceptual: true,
      logical: true,
      physical: false,
    });
    expect(matrix.b).toEqual({
      conceptual: true,
      logical: true,
      physical: false,
    });
  });

  it('marks all three layers on a full 3-layer chain', () => {
    const entities = [
      { id: 'a', layer: 'conceptual' },
      { id: 'b', layer: 'logical' },
      { id: 'c', layer: 'physical' },
    ];
    const links = [
      { parentId: 'a', childId: 'b' },
      { parentId: 'b', childId: 'c' },
    ];
    const matrix = buildCoverageMatrix(entities, links);
    // Direct semantics: A sees only logical (its direct link), not
    // physical. B sees both conceptual and physical (direct neighbours).
    // C sees only logical (its direct parent).
    expect(matrix.a).toEqual({
      conceptual: true,
      logical: true,
      physical: false,
    });
    expect(matrix.b).toEqual({
      conceptual: true,
      logical: true,
      physical: true,
    });
    expect(matrix.c).toEqual({
      conceptual: false,
      logical: true,
      physical: true,
    });
  });

  it('handles multi-parent DAG (two conceptual → one logical)', () => {
    const entities = [
      { id: 'a1', layer: 'conceptual' },
      { id: 'a2', layer: 'conceptual' },
      { id: 'b', layer: 'logical' },
    ];
    const links = [
      { parentId: 'a1', childId: 'b' },
      { parentId: 'a2', childId: 'b' },
    ];
    const matrix = buildCoverageMatrix(entities, links);
    // Both conceptuals see logical; logical sees conceptual (once,
    // booleans don't double).
    expect(matrix.a1.logical).toBe(true);
    expect(matrix.a2.logical).toBe(true);
    expect(matrix.b.conceptual).toBe(true);
  });

  it('handles multi-child DAG (one logical → two physicals)', () => {
    const entities = [
      { id: 'a', layer: 'logical' },
      { id: 'b1', layer: 'physical' },
      { id: 'b2', layer: 'physical' },
    ];
    const links = [
      { parentId: 'a', childId: 'b1' },
      { parentId: 'a', childId: 'b2' },
    ];
    const matrix = buildCoverageMatrix(entities, links);
    expect(matrix.a.physical).toBe(true);
    expect(matrix.b1.logical).toBe(true);
    expect(matrix.b2.logical).toBe(true);
  });

  it('returns empty object when there are no entities', () => {
    expect(buildCoverageMatrix([], [])).toEqual({});
  });

  it('silently skips links whose endpoints are missing from the entity list', () => {
    // Defensive — FK cascade prevents this in practice, but a stale
    // read could surface orphan links. Shouldn't crash or mark wrong.
    const entities = [{ id: 'a', layer: 'conceptual' }];
    const links = [{ parentId: 'a', childId: 'ghost' }];
    const matrix = buildCoverageMatrix(entities, links);
    expect(matrix.a).toEqual({
      conceptual: true,
      logical: false,
      physical: false,
    });
    expect(matrix.ghost).toBeUndefined();
  });
});

describe('buildNameMatchSuggestions', () => {
  it('returns empty when no names match', () => {
    const from = [{ id: 'a', name: 'Customer' }];
    const to = [{ id: 'b', name: 'Supplier' }];
    expect(buildNameMatchSuggestions(from, to, [], 'forward')).toEqual([]);
  });

  it('proposes an exact-match pair not yet linked', () => {
    const from = [{ id: 'a', name: 'Customer' }];
    const to = [{ id: 'b', name: 'Customer' }];
    const suggestions = buildNameMatchSuggestions(from, to, [], 'forward');
    expect(suggestions).toEqual([
      {
        fromEntityId: 'a',
        fromEntityName: 'Customer',
        toEntityId: 'b',
        toEntityName: 'Customer',
        confidence: 'high',
      },
    ]);
  });

  it('matches case-insensitively (CUSTOMER vs customer)', () => {
    const from = [{ id: 'a', name: 'CUSTOMER' }];
    const to = [{ id: 'b', name: 'customer' }];
    const suggestions = buildNameMatchSuggestions(from, to, [], 'forward');
    expect(suggestions).toHaveLength(1);
    // Names are returned with their original casing.
    expect(suggestions[0]!.fromEntityName).toBe('CUSTOMER');
    expect(suggestions[0]!.toEntityName).toBe('customer');
  });

  it('excludes pairs already linked (forward direction)', () => {
    const from = [{ id: 'a', name: 'Customer' }];
    const to = [{ id: 'b', name: 'Customer' }];
    const existingLinks = [{ parentId: 'a', childId: 'b' }];
    expect(buildNameMatchSuggestions(from, to, existingLinks, 'forward')).toEqual([]);
  });

  it('excludes pairs linked in the opposite orientation when direction=reverse', () => {
    // Direction=reverse means we treat the existing link's
    // parent/child as flipped when building the "already linked" set.
    const from = [{ id: 'a', name: 'Customer' }]; // e.g. physical layer
    const to = [{ id: 'b', name: 'Customer' }]; // e.g. logical layer
    const existingLinks = [{ parentId: 'b', childId: 'a' }]; // logical→physical stored
    expect(buildNameMatchSuggestions(from, to, existingLinks, 'reverse')).toEqual([]);
  });

  it('suggests multiple pairs in one call, skips unmatched names', () => {
    const from = [
      { id: 'a1', name: 'Customer' },
      { id: 'a2', name: 'Order' },
      { id: 'a3', name: 'OnlyHere' },
    ];
    const to = [
      { id: 'b1', name: 'Customer' },
      { id: 'b2', name: 'Order' },
    ];
    const suggestions = buildNameMatchSuggestions(from, to, [], 'forward');
    expect(suggestions.map((s) => s.fromEntityId)).toEqual(['a1', 'a2']);
    // 'OnlyHere' has no match — no suggestion.
    expect(suggestions.every((s) => s.fromEntityId !== 'a3')).toBe(true);
  });

  it('returns confidence=high for every MVP suggestion', () => {
    const from = [{ id: 'a', name: 'Customer' }];
    const to = [{ id: 'b', name: 'Customer' }];
    const suggestions = buildNameMatchSuggestions(from, to, [], 'forward');
    expect(suggestions.every((s) => s.confidence === 'high')).toBe(true);
  });

  it('first-wins on duplicate names within the to-side', () => {
    // Two logical entities with the same name — pick the first.
    const from = [{ id: 'a', name: 'Customer' }];
    const to = [
      { id: 'b1', name: 'Customer' },
      { id: 'b2', name: 'Customer' },
    ];
    const suggestions = buildNameMatchSuggestions(from, to, [], 'forward');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.toEntityId).toBe('b1');
  });

  it('returns empty when from-side is empty', () => {
    const to = [{ id: 'b', name: 'Customer' }];
    expect(buildNameMatchSuggestions([], to, [], 'forward')).toEqual([]);
  });

  it('returns empty when to-side is empty', () => {
    const from = [{ id: 'a', name: 'Customer' }];
    expect(buildNameMatchSuggestions(from, [], [], 'forward')).toEqual([]);
  });
});
