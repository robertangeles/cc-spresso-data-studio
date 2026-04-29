import { describe, it, expect } from 'vitest';
import { autoProjectTargetFor, expectedNextLayerFor, isUnlinked } from '../layer-direction';

describe('expectedNextLayerFor', () => {
  it('greenfield flows conceptual → logical → physical, terminates at physical', () => {
    expect(expectedNextLayerFor('greenfield', 'conceptual')).toBe('logical');
    expect(expectedNextLayerFor('greenfield', 'logical')).toBe('physical');
    expect(expectedNextLayerFor('greenfield', 'physical')).toBeNull();
  });

  it('existing_system flows physical → logical → conceptual, terminates at conceptual', () => {
    expect(expectedNextLayerFor('existing_system', 'physical')).toBe('logical');
    expect(expectedNextLayerFor('existing_system', 'logical')).toBe('conceptual');
    expect(expectedNextLayerFor('existing_system', 'conceptual')).toBeNull();
  });
});

describe('autoProjectTargetFor', () => {
  it('greenfield supports conceptual→logical and logical→physical', () => {
    expect(autoProjectTargetFor('greenfield', 'conceptual')).toBe('logical');
    expect(autoProjectTargetFor('greenfield', 'logical')).toBe('physical');
    expect(autoProjectTargetFor('greenfield', 'physical')).toBeNull();
  });

  it('existing_system has NO auto-project target (server only supports greenfield directions)', () => {
    expect(autoProjectTargetFor('existing_system', 'physical')).toBeNull();
    expect(autoProjectTargetFor('existing_system', 'logical')).toBeNull();
    expect(autoProjectTargetFor('existing_system', 'conceptual')).toBeNull();
  });
});

describe('isUnlinked', () => {
  it('greenfield: conceptual entity without logical projection is unlinked', () => {
    expect(
      isUnlinked('greenfield', 'conceptual', { conceptual: true, logical: false, physical: false }),
    ).toBe(true);
  });

  it('greenfield: conceptual entity WITH logical projection is linked', () => {
    expect(
      isUnlinked('greenfield', 'conceptual', { conceptual: true, logical: true, physical: false }),
    ).toBe(false);
  });

  it('greenfield: physical entity is never unlinked (terminal layer)', () => {
    expect(
      isUnlinked('greenfield', 'physical', { conceptual: false, logical: false, physical: true }),
    ).toBe(false);
  });

  it('existing_system: physical entity without logical projection is unlinked', () => {
    expect(
      isUnlinked('existing_system', 'physical', {
        conceptual: false,
        logical: false,
        physical: true,
      }),
    ).toBe(true);
  });

  it('existing_system: conceptual entity is never unlinked (terminal layer)', () => {
    expect(
      isUnlinked('existing_system', 'conceptual', {
        conceptual: true,
        logical: false,
        physical: false,
      }),
    ).toBe(false);
  });

  it('returns false when the coverage cell is undefined (matrix still loading)', () => {
    expect(isUnlinked('greenfield', 'logical', undefined)).toBe(false);
  });
});
