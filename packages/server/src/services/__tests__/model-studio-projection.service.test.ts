import { describe, it, expect } from 'vitest';
import {
  classifyTransition,
  deriveAttrValues,
  selectAttrsToClone,
  validateProjectionRequest,
  type SourceAttr,
  type SourceEntityBrief,
} from '../model-studio-projection.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';

/**
 * Unit tests for the projection service's pure helpers + validator.
 *
 * DB-integrated behaviour (scaffoldEntity orchestrator happy paths,
 * rollback on FK error, audit write, 40001 retry) lives in the
 * integration suite (Task 15). These tests cover the decision logic
 * that determines what happens on each layer transition, which attrs
 * carry over, and what a cloned attr looks like.
 */

const MODEL_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_MODEL_ID = '22222222-2222-2222-2222-222222222222';
const SOURCE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const conceptualSource = (): SourceEntityBrief => ({
  id: SOURCE_ID,
  name: 'Customer',
  layer: 'conceptual',
  dataModelId: MODEL_ID,
  businessName: 'Customer Domain',
  description: 'Any individual or organisation we do business with.',
  altKeyLabels: { AK1: 'Business identifier (customer code)' },
  metadata: { domain: 'Party' },
  tags: ['party', 'core'],
});

const logicalSource = (): SourceEntityBrief => ({
  ...conceptualSource(),
  layer: 'logical',
});

/** Build a minimal SourceAttr fixture with sensible defaults so tests
 *  only set the fields they care about. */
function attr(overrides: Partial<SourceAttr> = {}): SourceAttr {
  return {
    id: 'attr-id',
    name: 'customer_id',
    businessName: null,
    description: null,
    dataType: 'VARCHAR',
    length: 36,
    precision: null,
    scale: null,
    isNullable: false,
    isPrimaryKey: true,
    isForeignKey: false,
    isUnique: true,
    isExplicitUnique: false,
    defaultValue: null,
    classification: null,
    transformationLogic: null,
    altKeyGroup: null,
    ordinalPosition: 1,
    metadata: {},
    tags: [],
    ...overrides,
  };
}

describe('classifyTransition', () => {
  it('classifies conceptual→logical as valid', () => {
    expect(classifyTransition('conceptual', 'logical')).toEqual({
      kind: 'conceptual_to_logical',
    });
  });

  it('classifies logical→physical as valid', () => {
    expect(classifyTransition('logical', 'physical')).toEqual({
      kind: 'logical_to_physical',
    });
  });

  it('classifies same-layer as invalid_same_layer', () => {
    expect(classifyTransition('logical', 'logical')).toEqual({
      kind: 'invalid_same_layer',
    });
  });

  it('classifies conceptual→physical as invalid_two_hop', () => {
    // Two-hop projection is not supported; caller must go conceptual→
    // logical→physical in two steps.
    expect(classifyTransition('conceptual', 'physical')).toEqual({
      kind: 'invalid_two_hop',
    });
  });

  it('classifies reverse transitions (physical→logical) as invalid_reverse', () => {
    expect(classifyTransition('physical', 'logical')).toEqual({
      kind: 'invalid_reverse',
    });
    expect(classifyTransition('logical', 'conceptual')).toEqual({
      kind: 'invalid_reverse',
    });
    expect(classifyTransition('physical', 'conceptual')).toEqual({
      kind: 'invalid_reverse',
    });
  });
});

describe('selectAttrsToClone', () => {
  it('conceptual→logical: keeps only business-key attrs (non-null altKeyGroup)', () => {
    const attrs = [
      attr({ id: 'a1', name: 'customer_id', altKeyGroup: null }),
      attr({ id: 'a2', name: 'customer_cd', altKeyGroup: 'AK1' }),
      attr({ id: 'a3', name: 'email', altKeyGroup: null }),
      attr({ id: 'a4', name: 'external_ref', altKeyGroup: 'AK2' }),
    ];
    const result = selectAttrsToClone(attrs, { kind: 'conceptual_to_logical' });
    expect(result.map((a) => a.id)).toEqual(['a2', 'a4']);
  });

  it('conceptual→logical: returns empty array when source has no business keys', () => {
    const attrs = [attr({ id: 'a1', altKeyGroup: null }), attr({ id: 'a2', altKeyGroup: null })];
    const result = selectAttrsToClone(attrs, { kind: 'conceptual_to_logical' });
    expect(result).toEqual([]);
  });

  it('logical→physical: returns ALL source attrs', () => {
    const attrs = [
      attr({ id: 'a1', altKeyGroup: null }),
      attr({ id: 'a2', altKeyGroup: 'AK1' }),
      attr({ id: 'a3', altKeyGroup: null }),
    ];
    const result = selectAttrsToClone(attrs, { kind: 'logical_to_physical' });
    expect(result.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('invalid transitions return empty array (defensive)', () => {
    const attrs = [attr({ id: 'a1' })];
    expect(selectAttrsToClone(attrs, { kind: 'invalid_same_layer' })).toEqual([]);
    expect(selectAttrsToClone(attrs, { kind: 'invalid_two_hop' })).toEqual([]);
    expect(selectAttrsToClone(attrs, { kind: 'invalid_reverse' })).toEqual([]);
  });
});

describe('deriveAttrValues', () => {
  it('conceptual→logical: strips dataType/length/precision/scale/defaultValue', () => {
    const src = attr({
      dataType: 'VARCHAR',
      length: 36,
      precision: 10,
      scale: 2,
      defaultValue: 'nil',
    });
    const derived = deriveAttrValues(src, { kind: 'conceptual_to_logical' });
    expect(derived.dataType).toBeNull();
    expect(derived.length).toBeNull();
    expect(derived.precision).toBeNull();
    expect(derived.scale).toBeNull();
    expect(derived.defaultValue).toBeNull();
  });

  it('conceptual→logical: preserves flags, classification, altKeyGroup, metadata, tags', () => {
    const src = attr({
      isPrimaryKey: true,
      isNullable: false,
      isUnique: true,
      isExplicitUnique: true,
      classification: 'PII',
      altKeyGroup: 'AK1',
      transformationLogic: 'hash(email)',
      metadata: { source: 'stripe' },
      tags: ['pii', 'gdpr'],
    });
    const derived = deriveAttrValues(src, { kind: 'conceptual_to_logical' });
    expect(derived.isPrimaryKey).toBe(true);
    expect(derived.isNullable).toBe(false);
    expect(derived.isUnique).toBe(true);
    expect(derived.isExplicitUnique).toBe(true);
    expect(derived.classification).toBe('PII');
    expect(derived.altKeyGroup).toBe('AK1');
    expect(derived.transformationLogic).toBe('hash(email)');
    expect(derived.metadata).toEqual({ source: 'stripe' });
    expect(derived.tags).toEqual(['pii', 'gdpr']);
  });

  it('logical→physical: full clone preserving all fields', () => {
    const src = attr({
      dataType: 'VARCHAR',
      length: 255,
      precision: null,
      scale: null,
      defaultValue: 'unknown',
      isPrimaryKey: false,
      isForeignKey: true,
      classification: 'Confidential',
      altKeyGroup: 'AK2',
    });
    const derived = deriveAttrValues(src, { kind: 'logical_to_physical' });
    expect(derived).toMatchObject({
      dataType: 'VARCHAR',
      length: 255,
      defaultValue: 'unknown',
      isForeignKey: true,
      classification: 'Confidential',
      altKeyGroup: 'AK2',
    });
  });

  it('ordinalPosition carries through on both transitions', () => {
    const src = attr({ ordinalPosition: 7 });
    expect(deriveAttrValues(src, { kind: 'conceptual_to_logical' }).ordinalPosition).toBe(7);
    expect(deriveAttrValues(src, { kind: 'logical_to_physical' }).ordinalPosition).toBe(7);
  });

  it('throws on invalid transitions (defensive — should never be reached)', () => {
    const src = attr();
    expect(() => deriveAttrValues(src, { kind: 'invalid_same_layer' })).toThrow();
    expect(() => deriveAttrValues(src, { kind: 'invalid_two_hop' })).toThrow();
    expect(() => deriveAttrValues(src, { kind: 'invalid_reverse' })).toThrow();
  });
});

describe('validateProjectionRequest', () => {
  it('accepts a valid conceptual→logical request', () => {
    const result = validateProjectionRequest({
      modelId: MODEL_ID,
      sourceEntity: conceptualSource(),
      toLayer: 'logical',
      existingProjectionsOnTargetLayer: 0,
      attrsToValidate: [],
    });
    expect(result.transition.kind).toBe('conceptual_to_logical');
  });

  it('accepts a valid logical→physical request with a valid nameOverride', () => {
    const result = validateProjectionRequest({
      modelId: MODEL_ID,
      sourceEntity: logicalSource(),
      toLayer: 'physical',
      nameOverride: 'dim_customer',
      existingProjectionsOnTargetLayer: 0,
      attrsToValidate: [{ name: 'customer_id' }, { name: 'email_address' }],
    });
    expect(result.transition.kind).toBe('logical_to_physical');
  });

  it('rejects missing source entity with NotFoundError', () => {
    expect(() =>
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: null,
        toLayer: 'logical',
        existingProjectionsOnTargetLayer: 0,
        attrsToValidate: [],
      }),
    ).toThrow(NotFoundError);
  });

  it('rejects cross-model source entity with NotFoundError (no existence leak)', () => {
    expect(() =>
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: { ...conceptualSource(), dataModelId: OTHER_MODEL_ID },
        toLayer: 'logical',
        existingProjectionsOnTargetLayer: 0,
        attrsToValidate: [],
      }),
    ).toThrow(NotFoundError);
  });

  it('rejects same-layer target with ValidationError', () => {
    try {
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: conceptualSource(),
        toLayer: 'conceptual',
        existingProjectionsOnTargetLayer: 0,
        attrsToValidate: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.toLayer?.[0]).toMatch(/differ/);
    }
  });

  it('rejects conceptual→physical two-hop with ValidationError and explicit message', () => {
    try {
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: conceptualSource(),
        toLayer: 'physical',
        existingProjectionsOnTargetLayer: 0,
        attrsToValidate: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.toLayer?.[0]).toMatch(/logical first/);
    }
  });

  it('rejects reverse transition (physical→logical) with ValidationError', () => {
    const physicalSource: SourceEntityBrief = { ...conceptualSource(), layer: 'physical' };
    try {
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: physicalSource,
        toLayer: 'logical',
        existingProjectionsOnTargetLayer: 0,
        attrsToValidate: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.toLayer?.[0]).toMatch(/reverse direction/);
    }
  });

  it('rejects when source already has a projection on the target layer (409)', () => {
    try {
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: conceptualSource(),
        toLayer: 'logical',
        existingProjectionsOnTargetLayer: 1,
        attrsToValidate: [],
      });
      expect.fail('Expected ConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
      expect((err as ConflictError).statusCode).toBe(409);
    }
  });

  it('rejects non-physical-safe source name on L→P when no nameOverride', () => {
    // "Customer Orders" contains a space — invalid physical identifier.
    const badSource: SourceEntityBrief = {
      ...logicalSource(),
      name: 'Customer Orders',
    };
    try {
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: badSource,
        toLayer: 'physical',
        existingProjectionsOnTargetLayer: 0,
        attrsToValidate: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.nameOverride?.[0]).toMatch(
        /valid physical identifier/,
      );
    }
  });

  it('accepts non-physical-safe source name on L→P when nameOverride is valid', () => {
    // Source name is bad but the user supplied a clean override.
    const badSource: SourceEntityBrief = {
      ...logicalSource(),
      name: 'Customer Orders',
    };
    expect(() =>
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: badSource,
        toLayer: 'physical',
        nameOverride: 'customer_orders',
        existingProjectionsOnTargetLayer: 0,
        attrsToValidate: [],
      }),
    ).not.toThrow();
  });

  it('rejects L→P when any source attr has a non-physical-safe name', () => {
    try {
      validateProjectionRequest({
        modelId: MODEL_ID,
        sourceEntity: logicalSource(),
        toLayer: 'physical',
        existingProjectionsOnTargetLayer: 0,
        attrsToValidate: [
          { name: 'customer_id' },
          { name: 'Email Address' }, // bad — contains a space
          { name: 'created_at' },
        ],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.sourceAttrs?.[0]).toMatch(/Email Address/);
    }
  });
});
