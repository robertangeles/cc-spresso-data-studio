import { describe, it, expect } from 'vitest';
import { validateLayerLinkCreate, type EntityBrief } from '../model-studio-layer-links.service.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

/**
 * Unit tests for the pure validation chain used by `createLink`.
 *
 * All DB-dependent behaviour (SERIALIZABLE tx, unique-violation 409,
 * 40001 retry against real Postgres, audit log write) lives in
 * `model-studio-layer-links.integration.test.ts` (Task 15). These tests
 * cover the branches that can reject a request WITHOUT touching the DB:
 * self-loop, missing entity, cross-model, same-layer, cycle.
 *
 * The validator is called twice per request — once in the pre-flight
 * (empty existingEdges) and once under SERIALIZABLE (with real edges).
 * Both call sites share this function, so getting it right here locks
 * both paths.
 */

const MODEL_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_MODEL_ID = '22222222-2222-2222-2222-222222222222';
const PARENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CHILD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const THIRD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const conceptualParent = (): EntityBrief => ({
  id: PARENT_ID,
  name: 'Customer',
  layer: 'conceptual',
  dataModelId: MODEL_ID,
});

const logicalChild = (): EntityBrief => ({
  id: CHILD_ID,
  name: 'Customer',
  layer: 'logical',
  dataModelId: MODEL_ID,
});

describe('validateLayerLinkCreate', () => {
  it('passes for a valid cross-layer link in the same model with no cycle', () => {
    expect(() =>
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parent: conceptualParent(),
        child: logicalChild(),
        existingEdges: [],
      }),
    ).not.toThrow();
  });

  it('rejects self-loop (parentId === childId) with ValidationError', () => {
    // Self-loop rejected before entity lookups even matter — caller
    // can pass null entities and still get the right error.
    try {
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ID,
        childId: PARENT_ID,
        parent: conceptualParent(),
        child: conceptualParent(),
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toHaveProperty('childId');
    }
  });

  it('rejects missing parent entity with NotFoundError', () => {
    try {
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parent: null,
        child: logicalChild(),
        existingEdges: [],
      });
      expect.fail('Expected NotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as NotFoundError).statusCode).toBe(404);
    }
  });

  it('rejects missing child entity with NotFoundError', () => {
    try {
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parent: conceptualParent(),
        child: null,
        existingEdges: [],
      });
      expect.fail('Expected NotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it('rejects parent belonging to a different model with ValidationError', () => {
    const crossModelParent: EntityBrief = {
      ...conceptualParent(),
      dataModelId: OTHER_MODEL_ID,
    };
    try {
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parent: crossModelParent,
        child: logicalChild(),
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).statusCode).toBe(400);
    }
  });

  it('rejects child belonging to a different model with ValidationError', () => {
    const crossModelChild: EntityBrief = {
      ...logicalChild(),
      dataModelId: OTHER_MODEL_ID,
    };
    try {
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parent: conceptualParent(),
        child: crossModelChild,
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects same-layer link (both conceptual) with ValidationError', () => {
    const sameLayerChild: EntityBrief = {
      ...logicalChild(),
      layer: 'conceptual',
    };
    try {
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ID,
        childId: CHILD_ID,
        parent: conceptualParent(),
        child: sameLayerChild,
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.childId?.[0]).toMatch(/different layers/);
    }
  });

  it('rejects a cycle — adding CHILD→PARENT when PARENT→CHILD already exists', () => {
    // Chain shape: PARENT(conceptual) → CHILD(logical) → THIRD(physical).
    // Now try to add THIRD → PARENT — should detect via BFS.
    const physicalThird: EntityBrief = {
      id: THIRD_ID,
      name: 'dim_customer',
      layer: 'physical',
      dataModelId: MODEL_ID,
    };
    try {
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: THIRD_ID,
        childId: PARENT_ID,
        parent: physicalThird,
        child: conceptualParent(),
        existingEdges: [
          { parentId: PARENT_ID, childId: CHILD_ID },
          { parentId: CHILD_ID, childId: THIRD_ID },
        ],
      });
      expect.fail('Expected ValidationError for cycle');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.childId?.[0]).toMatch(/cycle/);
    }
  });

  it('allows a legitimate diamond: two conceptuals → one logical', () => {
    // Existing edge PARENT → CHILD. Now adding THIRD(conceptual) → CHILD
    // is fine (multi-parent DAG is legitimate — one logical entity
    // projected from two conceptuals).
    const secondConceptual: EntityBrief = {
      id: THIRD_ID,
      name: 'Party',
      layer: 'conceptual',
      dataModelId: MODEL_ID,
    };
    expect(() =>
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: THIRD_ID,
        childId: CHILD_ID,
        parent: secondConceptual,
        child: logicalChild(),
        existingEdges: [{ parentId: PARENT_ID, childId: CHILD_ID }],
      }),
    ).not.toThrow();
  });

  it('allows a legitimate multi-child case: one logical → two physicals', () => {
    // Existing edge PARENT(logical) → CHILD(physical). Adding PARENT →
    // THIRD(physical) is fine — partitioned fact-table pattern.
    //
    // Note the parent/child layers here reflect a logical-to-physical
    // projection; we reuse PARENT_ID/CHILD_ID slots but swap the
    // layers to exercise the multi-child shape without growing the
    // fixture surface.
    const logicalParent: EntityBrief = { ...conceptualParent(), layer: 'logical' };
    const physicalChildA: EntityBrief = { ...logicalChild(), layer: 'physical' };
    const physicalChildB: EntityBrief = {
      id: THIRD_ID,
      name: 'dim_customer_archive',
      layer: 'physical',
      dataModelId: MODEL_ID,
    };
    expect(() =>
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ID,
        childId: THIRD_ID,
        parent: logicalParent,
        child: physicalChildB,
        existingEdges: [{ parentId: PARENT_ID, childId: physicalChildA.id }],
      }),
    ).not.toThrow();
  });

  it('rejects a cycle even when both entities pass all non-cycle checks individually', () => {
    // Regression shape: the cycle check must run LAST in the chain.
    // If the cycle detector ran before the cross-model / same-layer
    // checks, a cycle across mis-shaped inputs could be misreported.
    // We verify the cycle rejection still fires when the simpler rules
    // are all clean.
    try {
      validateLayerLinkCreate({
        modelId: MODEL_ID,
        parentId: CHILD_ID,
        childId: PARENT_ID,
        parent: logicalChild(),
        child: conceptualParent(),
        existingEdges: [{ parentId: PARENT_ID, childId: CHILD_ID }],
      });
      expect.fail('Expected ValidationError for cycle');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });
});
