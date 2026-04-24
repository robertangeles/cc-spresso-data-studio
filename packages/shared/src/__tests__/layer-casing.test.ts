import { describe, it, expect } from 'vitest';
import { casingForLayer } from '../utils/layer-casing.js';

/**
 * Step 6 Direction A — layer-appropriate casing.
 *
 * physical   → snake_case preserved, lowercased
 * logical    → Title Case, underscores become spaces
 * conceptual → Sentence case, underscores become spaces
 */

describe('casingForLayer', () => {
  it('physical: preserves snake_case and lowercases', () => {
    expect(casingForLayer('employee_name', 'physical')).toBe('employee_name');
  });

  it('logical: Title Case with underscore→space', () => {
    expect(casingForLayer('employee_name', 'logical')).toBe('Employee Name');
  });

  it('conceptual: Sentence case with underscore→space', () => {
    expect(casingForLayer('employee_name', 'conceptual')).toBe('Employee name');
  });

  it('null input returns empty string', () => {
    expect(casingForLayer(null, 'physical')).toBe('');
    expect(casingForLayer(null, 'logical')).toBe('');
    expect(casingForLayer(null, 'conceptual')).toBe('');
  });

  it('undefined input returns empty string', () => {
    expect(casingForLayer(undefined, 'logical')).toBe('');
  });

  it('empty string returns empty string', () => {
    expect(casingForLayer('', 'logical')).toBe('');
    expect(casingForLayer('   ', 'logical')).toBe('');
  });

  it('conceptual: ALL-CAPS input becomes Sentence case', () => {
    expect(casingForLayer('EMPLOYEE', 'conceptual')).toBe('Employee');
  });

  it('physical: uppercased input is lowercased', () => {
    expect(casingForLayer('EMPLOYEE_NAME', 'physical')).toBe('employee_name');
  });

  it('logical: already-cased input is normalised (not left untouched)', () => {
    expect(casingForLayer('Employee Name', 'logical')).toBe('Employee Name');
    expect(casingForLayer('EMPLOYEE NAME', 'logical')).toBe('Employee Name');
  });

  it('logical: multi-word with mixed separators', () => {
    expect(casingForLayer('customer_order_line', 'logical')).toBe('Customer Order Line');
  });

  it('conceptual: multi-word snake_case collapses to single sentence', () => {
    expect(casingForLayer('customer_order_line', 'conceptual')).toBe('Customer order line');
  });

  it('trims surrounding whitespace before casing', () => {
    expect(casingForLayer('  employee_name  ', 'logical')).toBe('Employee Name');
    expect(casingForLayer('  employee_name  ', 'physical')).toBe('employee_name');
  });
});
