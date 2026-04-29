import { describe, it, expect } from 'vitest';
import {
  attributeCreateSchema,
  attributeReorderSchema,
  attributeUpdateSchema,
  entityUpdateSchema,
  modelCreateSchema,
  modelUpdateSchema,
  ORIGIN_DIRECTION,
  syntheticDataRequestSchema,
} from '../utils/model-studio.schemas.js';

/**
 * Step 4.5 — origin_direction enum on data_models.
 *
 * The dialog passes both `originDirection` and `activeLayer`; this suite
 * locks the contract on the input boundary so a typo in the dialog can't
 * silently mis-route a model into the wrong starting layer.
 */

describe('Model Studio — origin_direction schemas', () => {
  it('ORIGIN_DIRECTION enum lists greenfield + existing_system', () => {
    expect(ORIGIN_DIRECTION.options).toEqual(['greenfield', 'existing_system']);
  });

  describe('modelCreateSchema', () => {
    const baseInput = {
      name: 'Test Model',
      projectId: '00000000-0000-0000-0000-000000000000',
    };

    it('defaults originDirection to "greenfield" when omitted', () => {
      const parsed = modelCreateSchema.parse(baseInput);
      expect(parsed.originDirection).toBe('greenfield');
    });

    it('accepts originDirection: "existing_system"', () => {
      const parsed = modelCreateSchema.parse({ ...baseInput, originDirection: 'existing_system' });
      expect(parsed.originDirection).toBe('existing_system');
    });

    it('accepts originDirection: "greenfield" explicitly', () => {
      const parsed = modelCreateSchema.parse({ ...baseInput, originDirection: 'greenfield' });
      expect(parsed.originDirection).toBe('greenfield');
    });

    it('rejects unknown originDirection values', () => {
      const result = modelCreateSchema.safeParse({ ...baseInput, originDirection: 'reverse' });
      expect(result.success).toBe(false);
    });

    it('rejects originDirection of wrong type', () => {
      const result = modelCreateSchema.safeParse({ ...baseInput, originDirection: 42 });
      expect(result.success).toBe(false);
    });
  });

  describe('modelUpdateSchema', () => {
    it('accepts a patch with only originDirection', () => {
      const parsed = modelUpdateSchema.parse({ originDirection: 'existing_system' });
      expect(parsed.originDirection).toBe('existing_system');
    });

    it('rejects unknown originDirection values on update', () => {
      const result = modelUpdateSchema.safeParse({ originDirection: 'top_down' });
      expect(result.success).toBe(false);
    });
  });
});

/**
 * Step 5 — attribute + synthetic-data schemas.
 *
 * Locks the attribute payload shape so the service can assume typed
 * fields and the client can rely on the same defaults.
 */

describe('Model Studio — attribute schemas', () => {
  describe('attributeCreateSchema', () => {
    it('S5-U1: VARCHAR dataType accepted on a physical-layer attribute payload', () => {
      const parsed = attributeCreateSchema.parse({
        name: 'customer_name',
        dataType: 'VARCHAR',
        length: 255,
      });
      expect(parsed.dataType).toBe('VARCHAR');
      expect(parsed.length).toBe(255);
    });

    it('defaults isNullable=true, isPrimaryKey=false, isForeignKey=false, isUnique=false', () => {
      const parsed = attributeCreateSchema.parse({ name: 'amount' });
      expect(parsed.isNullable).toBe(true);
      expect(parsed.isPrimaryKey).toBe(false);
      expect(parsed.isForeignKey).toBe(false);
      expect(parsed.isUnique).toBe(false);
    });

    it('rejects empty name', () => {
      const result = attributeCreateSchema.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
    });

    it('rejects unknown keys (strict)', () => {
      const result = attributeCreateSchema.safeParse({ name: 'x', bogus: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('attributeUpdateSchema', () => {
    it('requires at least one field', () => {
      const result = attributeUpdateSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts a patch with only isPrimaryKey', () => {
      const parsed = attributeUpdateSchema.parse({ isPrimaryKey: true });
      expect(parsed.isPrimaryKey).toBe(true);
    });
  });

  describe('attributeReorderSchema', () => {
    it('accepts a non-empty ids array', () => {
      const parsed = attributeReorderSchema.parse({
        ids: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
      });
      expect(parsed.ids).toHaveLength(2);
    });

    it('rejects an empty ids array', () => {
      const result = attributeReorderSchema.safeParse({ ids: [] });
      expect(result.success).toBe(false);
    });

    it('rejects non-uuid ids', () => {
      const result = attributeReorderSchema.safeParse({ ids: ['not-a-uuid'] });
      expect(result.success).toBe(false);
    });
  });

  describe('syntheticDataRequestSchema', () => {
    it('defaults count to 10', () => {
      const parsed = syntheticDataRequestSchema.parse({});
      expect(parsed.count).toBe(10);
    });

    it('accepts count 1–25', () => {
      expect(syntheticDataRequestSchema.parse({ count: 1 }).count).toBe(1);
      expect(syntheticDataRequestSchema.parse({ count: 25 }).count).toBe(25);
    });

    it('rejects count > 25', () => {
      const result = syntheticDataRequestSchema.safeParse({ count: 100 });
      expect(result.success).toBe(false);
    });
  });
});

/**
 * Step 7 — entity.layer immutability guard.
 *
 * Mutating entity.layer post-create would retroactively invalidate the
 * layer_links graph: links that were cross-layer (legal) could become
 * same-layer (illegal), and links that were outside a chain could enter
 * one without passing the cycle-detection BFS. `entityUpdateSchema`
 * omits the `layer` field entirely and uses `.strict()` so a PATCH
 * body that includes it fails fast at the zod layer. See the service
 * guard at `model-studio-entity.service.ts` for the second layer of
 * defence (schema + service).
 */
describe('entityUpdateSchema — layer immutability guard (Step 7)', () => {
  it('accepts a normal patch with name + description', () => {
    const result = entityUpdateSchema.safeParse({
      name: 'Customer',
      description: 'A person who buys things.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a patch that includes `layer` with .strict() unrecognized-key error', () => {
    const result = entityUpdateSchema.safeParse({
      name: 'Customer',
      layer: 'physical',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // zod reports strict-mode violations as `unrecognized_keys` with
      // the offending key list. Assert the shape is visible enough for
      // the global error handler to surface a clear 400.
      const issue = result.error.issues.find((i) => i.code === 'unrecognized_keys');
      expect(issue).toBeDefined();
      expect(issue?.keys).toEqual(['layer']);
    }
  });

  it('rejects a patch that contains only `layer` (no other fields)', () => {
    // The schema's `.refine` also requires at least one recognised field.
    // `layer` alone is unrecognised, so both rules fire — we just check
    // the parse fails and that `layer` surfaces in the error.
    const result = entityUpdateSchema.safeParse({ layer: 'logical' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const hasLayerKeyError = result.error.issues.some(
        (i) => i.code === 'unrecognized_keys' && i.keys.includes('layer'),
      );
      expect(hasLayerKeyError).toBe(true);
    }
  });

  it('still requires at least one valid field (refine rule survives)', () => {
    // Empty object must also be rejected so the PATCH isn't a no-op.
    const result = entityUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
