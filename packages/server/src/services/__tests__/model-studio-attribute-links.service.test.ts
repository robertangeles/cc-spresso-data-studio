import { describe, it, expect } from 'vitest';
import {
  validateAttributeLinkCreate,
  type AttributeBrief,
} from '../model-studio-attribute-links.service.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

/**
 * Unit tests for the pure validation chain used by
 * `createAttributeLink`. Parallels the layer-links validator test
 * suite — same branch coverage, different entity-brief shape because
 * attributes inherit their layer from the OWNING entity (two-hop
 * resolution: attr → entity → layer).
 *
 * Real-DB behaviour (SERIALIZABLE tx, 23505 → 409, 40001 retry,
 * audit write) lives in the integration suite (Task 15).
 */

const MODEL_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_MODEL_ID = '22222222-2222-2222-2222-222222222222';

const PARENT_ATTR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CHILD_ATTR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const THIRD_ATTR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const PARENT_ENTITY_ID = '11111111-0000-0000-0000-aaaaaaaaaaaa';
const CHILD_ENTITY_ID = '11111111-0000-0000-0000-bbbbbbbbbbbb';
const THIRD_ENTITY_ID = '11111111-0000-0000-0000-cccccccccccc';

const conceptualAttr = (): AttributeBrief => ({
  id: PARENT_ATTR_ID,
  name: 'customer_id',
  entityId: PARENT_ENTITY_ID,
  entityName: 'Customer',
  entityLayer: 'conceptual',
  dataModelId: MODEL_ID,
});

const logicalAttr = (): AttributeBrief => ({
  id: CHILD_ATTR_ID,
  name: 'customer_id',
  entityId: CHILD_ENTITY_ID,
  entityName: 'Customer',
  entityLayer: 'logical',
  dataModelId: MODEL_ID,
});

describe('validateAttributeLinkCreate', () => {
  it('passes for a valid cross-layer attribute link with no cycle', () => {
    expect(() =>
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ATTR_ID,
        childId: CHILD_ATTR_ID,
        parent: conceptualAttr(),
        child: logicalAttr(),
        existingEdges: [],
      }),
    ).not.toThrow();
  });

  it('rejects self-loop (parentId === childId) with ValidationError', () => {
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ATTR_ID,
        childId: PARENT_ATTR_ID,
        parent: conceptualAttr(),
        child: conceptualAttr(),
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details).toHaveProperty('childId');
    }
  });

  it('rejects missing parent attribute with NotFoundError', () => {
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ATTR_ID,
        childId: CHILD_ATTR_ID,
        parent: null,
        child: logicalAttr(),
        existingEdges: [],
      });
      expect.fail('Expected NotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it('rejects missing child attribute with NotFoundError', () => {
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ATTR_ID,
        childId: CHILD_ATTR_ID,
        parent: conceptualAttr(),
        child: null,
        existingEdges: [],
      });
      expect.fail('Expected NotFoundError');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
    }
  });

  it('rejects parent attribute from a different model with ValidationError', () => {
    const crossModelParent: AttributeBrief = {
      ...conceptualAttr(),
      dataModelId: OTHER_MODEL_ID,
    };
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ATTR_ID,
        childId: CHILD_ATTR_ID,
        parent: crossModelParent,
        child: logicalAttr(),
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).statusCode).toBe(400);
    }
  });

  it('rejects child attribute from a different model with ValidationError', () => {
    const crossModelChild: AttributeBrief = {
      ...logicalAttr(),
      dataModelId: OTHER_MODEL_ID,
    };
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ATTR_ID,
        childId: CHILD_ATTR_ID,
        parent: conceptualAttr(),
        child: crossModelChild,
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects same-layer attributes (entities on same layer) with ValidationError', () => {
    // Two attrs on two DIFFERENT entities that happen to share a layer
    // is still same-layer from the attribute-link perspective.
    const sameLayerChild: AttributeBrief = {
      ...logicalAttr(),
      entityLayer: 'conceptual',
    };
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ATTR_ID,
        childId: CHILD_ATTR_ID,
        parent: conceptualAttr(),
        child: sameLayerChild,
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.childId?.[0]).toMatch(/different layers/);
    }
  });

  it('rejects two attrs on the SAME entity (trivially same-layer)', () => {
    // Two attrs on the same entity can never be a valid cross-layer
    // link — caught by the same-layer check.
    const siblingAttr: AttributeBrief = {
      ...conceptualAttr(),
      id: CHILD_ATTR_ID,
      name: 'customer_cd',
    };
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: PARENT_ATTR_ID,
        childId: CHILD_ATTR_ID,
        parent: conceptualAttr(),
        child: siblingAttr,
        existingEdges: [],
      });
      expect.fail('Expected ValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });

  it('rejects a 3-hop cycle detected by the BFS', () => {
    // Chain: PARENT_ATTR → CHILD_ATTR → THIRD_ATTR. Add THIRD → PARENT.
    const physicalAttr: AttributeBrief = {
      id: THIRD_ATTR_ID,
      name: 'customer_id',
      entityId: THIRD_ENTITY_ID,
      entityName: 'dim_customer',
      entityLayer: 'physical',
      dataModelId: MODEL_ID,
    };
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: THIRD_ATTR_ID,
        childId: PARENT_ATTR_ID,
        parent: physicalAttr,
        child: conceptualAttr(),
        existingEdges: [
          { parentId: PARENT_ATTR_ID, childId: CHILD_ATTR_ID },
          { parentId: CHILD_ATTR_ID, childId: THIRD_ATTR_ID },
        ],
      });
      expect.fail('Expected ValidationError for cycle');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).details?.childId?.[0]).toMatch(/cycle/);
    }
  });

  it('allows a legitimate diamond: two conceptual attrs → one logical attr', () => {
    // PARENT(conceptual) → CHILD(logical) already exists. Adding
    // THIRD(conceptual) → CHILD is a valid multi-parent shape (one
    // logical attribute projected from two conceptual sources).
    const secondConceptual: AttributeBrief = {
      id: THIRD_ATTR_ID,
      name: 'party_id',
      entityId: THIRD_ENTITY_ID,
      entityName: 'Party',
      entityLayer: 'conceptual',
      dataModelId: MODEL_ID,
    };
    expect(() =>
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: THIRD_ATTR_ID,
        childId: CHILD_ATTR_ID,
        parent: secondConceptual,
        child: logicalAttr(),
        existingEdges: [{ parentId: PARENT_ATTR_ID, childId: CHILD_ATTR_ID }],
      }),
    ).not.toThrow();
  });

  it('rejects a cycle even when simpler rules pass individually', () => {
    // Regression guard: when simpler rules (cross-model, same-layer,
    // missing-entity) all pass, the cycle check must still fire.
    try {
      validateAttributeLinkCreate({
        modelId: MODEL_ID,
        parentId: CHILD_ATTR_ID,
        childId: PARENT_ATTR_ID,
        parent: logicalAttr(),
        child: conceptualAttr(),
        existingEdges: [{ parentId: PARENT_ATTR_ID, childId: CHILD_ATTR_ID }],
      });
      expect.fail('Expected ValidationError for cycle');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
    }
  });
});
