import { describe, it, expect } from 'vitest';
import {
  modelCreateSchema,
  modelUpdateSchema,
  ORIGIN_DIRECTION,
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
