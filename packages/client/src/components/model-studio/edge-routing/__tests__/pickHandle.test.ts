import { describe, expect, it } from 'vitest';
import { pickHandle, type NodeBounds } from '../pickHandle';

const box = (x: number, y: number, width = 280, height = 200): NodeBounds => ({
  x,
  y,
  width,
  height,
});

describe('pickHandle', () => {
  describe('horizontal-dominant separation', () => {
    it('picks right-top -> left when target is to the right', () => {
      const result = pickHandle(box(0, 0), box(500, 0));
      expect(result).toEqual({ sourceHandle: 'right-top', targetHandle: 'left' });
    });

    it('picks left-source -> right-target when target is to the left', () => {
      const result = pickHandle(box(500, 0), box(0, 0));
      expect(result).toEqual({ sourceHandle: 'left-source', targetHandle: 'right-target' });
    });

    it('picks right-facing handles when target is far right AND slightly below', () => {
      const result = pickHandle(box(0, 0), box(600, 50));
      expect(result).toEqual({ sourceHandle: 'right-top', targetHandle: 'left' });
    });
  });

  describe('vertical-dominant separation', () => {
    it('picks bottom -> top when target is below', () => {
      const result = pickHandle(box(0, 0), box(0, 400));
      expect(result).toEqual({ sourceHandle: 'bottom', targetHandle: 'top' });
    });

    it('picks top-source -> bottom-target when target is above', () => {
      const result = pickHandle(box(0, 400), box(0, 0));
      expect(result).toEqual({ sourceHandle: 'top-source', targetHandle: 'bottom-target' });
    });

    it('picks vertical handles when target is far below AND slightly right', () => {
      const result = pickHandle(box(0, 0), box(50, 500));
      expect(result).toEqual({ sourceHandle: 'bottom', targetHandle: 'top' });
    });
  });

  describe('axis tiebreak', () => {
    it('prefers horizontal when dx equals dy (|dx| >= |dy|)', () => {
      const result = pickHandle(box(0, 0), box(300, 300));
      expect(result.sourceHandle === 'right-top' || result.sourceHandle === 'left-source').toBe(
        true,
      );
    });

    it('handles exact overlap by picking horizontal branch with dx = 0', () => {
      const result = pickHandle(box(0, 0), box(0, 0));
      expect(result).toEqual({ sourceHandle: 'right-top', targetHandle: 'left' });
    });
  });

  describe('default dimensions', () => {
    it('accepts partial bounds (width/height default to 280x200)', () => {
      const result = pickHandle({ x: 0, y: 0 }, { x: 500, y: 0 });
      expect(result).toEqual({ sourceHandle: 'right-top', targetHandle: 'left' });
    });

    it('respects custom node widths when provided', () => {
      // Narrow source at 100, wide target at 200; centers are 50 vs 250.
      // Target center > source center => right-facing.
      const result = pickHandle(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 200, y: 0, width: 100, height: 100 },
      );
      expect(result).toEqual({ sourceHandle: 'right-top', targetHandle: 'left' });
    });
  });
});
