import { describe, it, expect } from 'vitest';
import {
  attributeCreateSchema,
  attributeReorderSchema,
  attributeUpdateSchema,
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
