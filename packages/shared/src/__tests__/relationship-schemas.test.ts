import { describe, it, expect } from 'vitest';
import type {
  CreateRelationshipInput,
  Relationship,
  UpdateRelationshipInput,
} from '../utils/model-studio.schemas.js';
import {
  createRelationshipSchema,
  relationshipMetadataSchema,
  relationshipSchema,
  updateRelationshipSchema,
} from '../utils/model-studio.schemas.js';

/**
 * Step 6 — relationship Zod schemas.
 *
 * Maps to tasks/test-plan-model-studio.md cases:
 *   S6-U8: createRelationshipSchema normalises (trims name, rejects invalid enum).
 *   (metadata 4 KB + reserved-key rules enforce §7 security hard rules.)
 *   (updateRelationshipSchema requires version — 6A optimistic lock.)
 */

const UUID_A = '00000000-0000-0000-0000-000000000001';
const UUID_B = '00000000-0000-0000-0000-000000000002';
const UUID_C = '00000000-0000-0000-0000-000000000003';
const UUID_D = '00000000-0000-0000-0000-000000000004';

const validBase: CreateRelationshipInput = {
  sourceEntityId: UUID_A,
  targetEntityId: UUID_B,
  sourceCardinality: 'one_or_many',
  targetCardinality: 'one',
  isIdentifying: false,
  layer: 'logical',
};

describe('Model Studio — relationship schemas (Step 6)', () => {
  describe('createRelationshipSchema', () => {
    it('S6-U8: trims the relationship name', () => {
      const parsed = createRelationshipSchema.parse({
        ...validBase,
        name: '  places  ',
      });
      expect(parsed.name).toBe('places');
    });

    it('S6-U8: rejects an invalid cardinality enum value', () => {
      const result = createRelationshipSchema.safeParse({
        ...validBase,
        sourceCardinality: 'loads',
      });
      expect(result.success).toBe(false);
    });

    it('S6-U8: rejects an invalid layer enum value', () => {
      const result = createRelationshipSchema.safeParse({
        ...validBase,
        layer: 'warehouse',
      });
      expect(result.success).toBe(false);
    });

    it('accepts a null name (unnamed edges are legal)', () => {
      const parsed = createRelationshipSchema.parse({ ...validBase, name: null });
      expect(parsed.name).toBeNull();
    });

    it('rejects unknown keys (strict)', () => {
      const result = createRelationshipSchema.safeParse({
        ...validBase,
        version: 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-uuid source/target ids', () => {
      const result = createRelationshipSchema.safeParse({
        ...validBase,
        sourceEntityId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('relationshipMetadataSchema', () => {
    it('accepts an empty object', () => {
      expect(relationshipMetadataSchema.parse({})).toEqual({});
    });

    it('accepts an arbitrary nested bag under the 4 KB cap', () => {
      const bag = { display: { color: '#ffd60a', layout: 'arc' }, tags: ['infer', 'auto'] };
      expect(relationshipMetadataSchema.parse(bag)).toEqual(bag);
    });

    it('rejects metadata whose serialised form exceeds 4 KB (4097 bytes)', () => {
      // Build a payload whose JSON.stringify length lands just above 4096.
      // `{"v":"<padding>"}` → 8 overhead chars + padding length.
      const padding = 'x'.repeat(4097 - 8);
      const tooBig = { v: padding };
      expect(JSON.stringify(tooBig).length).toBeGreaterThan(4096);
      const result = relationshipMetadataSchema.safeParse(tooBig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Metadata exceeds 4 KB');
      }
    });

    it('accepts metadata whose serialised form is exactly 4096 bytes', () => {
      const padding = 'x'.repeat(4096 - 8);
      const onTheLine = { v: padding };
      expect(JSON.stringify(onTheLine).length).toBe(4096);
      const result = relationshipMetadataSchema.safeParse(onTheLine);
      expect(result.success).toBe(true);
    });

    it('rejects a top-level __proto__ key (parsed from raw JSON — real attack surface)', () => {
      // Object-literal `{ __proto__: ... }` sets the prototype instead of
      // creating an own property, so the banned-key check would never see
      // it. JSON.parse preserves `__proto__` as an own property, which is
      // exactly the request body shape an attacker would send.
      const payload = JSON.parse('{"__proto__":{"polluted":true}}');
      const result = relationshipMetadataSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects a top-level constructor key', () => {
      const result = relationshipMetadataSchema.safeParse({ constructor: 'pwn' });
      expect(result.success).toBe(false);
    });

    it('rejects a top-level prototype key', () => {
      const result = relationshipMetadataSchema.safeParse({ prototype: {} });
      expect(result.success).toBe(false);
    });
  });

  describe('updateRelationshipSchema', () => {
    it('requires a positive integer version (6A optimistic lock)', () => {
      const result = updateRelationshipSchema.safeParse({ name: 'renamed' });
      expect(result.success).toBe(false);
    });

    it('rejects a non-integer version', () => {
      const result = updateRelationshipSchema.safeParse({ name: 'renamed', version: 1.5 });
      expect(result.success).toBe(false);
    });

    it('rejects a zero or negative version', () => {
      expect(updateRelationshipSchema.safeParse({ name: 'x', version: 0 }).success).toBe(false);
      expect(updateRelationshipSchema.safeParse({ name: 'x', version: -1 }).success).toBe(false);
    });

    it('accepts a patch with only version + one field', () => {
      const parsed = updateRelationshipSchema.parse({
        version: 3,
        isIdentifying: true,
      });
      expect(parsed.version).toBe(3);
      expect(parsed.isIdentifying).toBe(true);
    });

    it('accepts a patch that flips both cardinalities atomically', () => {
      const parsed = updateRelationshipSchema.parse({
        version: 2,
        sourceCardinality: 'zero_or_one',
        targetCardinality: 'one',
      });
      expect(parsed.sourceCardinality).toBe('zero_or_one');
      expect(parsed.targetCardinality).toBe('one');
    });

    it('rejects unknown keys (strict)', () => {
      const result = updateRelationshipSchema.safeParse({
        version: 1,
        bogus: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('relationshipSchema (canonical row)', () => {
    it('parses a fully populated row with ISO datetime fields', () => {
      const row = {
        id: UUID_A,
        dataModelId: UUID_B,
        sourceEntityId: UUID_C,
        targetEntityId: UUID_D,
        name: 'places',
        sourceCardinality: 'one_or_many',
        targetCardinality: 'one',
        isIdentifying: true,
        layer: 'logical',
        metadata: { display: { color: '#ffd60a' } },
        version: 4,
        createdAt: '2026-04-20T10:30:00.000Z',
        updatedAt: '2026-04-20T10:30:00.000Z',
      };
      const parsed = relationshipSchema.parse(row);
      expect(parsed.version).toBe(4);
      expect(parsed.metadata.display).toEqual({ color: '#ffd60a' });
    });

    it('defaults metadata to {} when absent', () => {
      const parsed = relationshipSchema.parse({
        id: UUID_A,
        dataModelId: UUID_B,
        sourceEntityId: UUID_C,
        targetEntityId: UUID_D,
        sourceCardinality: 'one',
        targetCardinality: 'one',
        isIdentifying: false,
        layer: 'conceptual',
        version: 1,
        createdAt: '2026-04-20T10:30:00.000Z',
        updatedAt: '2026-04-20T10:30:00.000Z',
      });
      expect(parsed.metadata).toEqual({});
    });
  });

  describe('type-level compilation', () => {
    it('CreateRelationshipInput / UpdateRelationshipInput / Relationship compile via z.infer', () => {
      const create: CreateRelationshipInput = { ...validBase };
      const update: UpdateRelationshipInput = { version: 1, name: 'x' };
      const row: Relationship = {
        id: UUID_A,
        dataModelId: UUID_B,
        sourceEntityId: UUID_C,
        targetEntityId: UUID_D,
        name: null,
        sourceCardinality: 'one',
        targetCardinality: 'one',
        isIdentifying: false,
        layer: 'conceptual',
        metadata: {},
        version: 1,
        createdAt: '2026-04-20T10:30:00.000Z',
        updatedAt: '2026-04-20T10:30:00.000Z',
      };
      expect(create.sourceCardinality).toBe('one_or_many');
      expect(update.version).toBe(1);
      expect(row.version).toBe(1);
    });
  });
});
