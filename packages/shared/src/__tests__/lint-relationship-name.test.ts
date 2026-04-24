import { describe, it, expect } from 'vitest';
import { lintRelationshipName } from '../utils/naming-lint.js';

/**
 * Step 6 — relationship-name lint (sibling to lintIdentifier /
 * lintAttribute). Advisory only; relationship names are optional so
 * empty / null input returns an empty array without issues.
 *
 * Maps to tasks/test-plan-model-studio.md cases:
 *   S6-U10: 'CustomerOrders' on physical → snake_case violation + camelCase warning.
 *   S6-U11: null / empty → [] (silent).
 */

describe('lintRelationshipName', () => {
  it('S6-U11: null input returns no issues', () => {
    expect(lintRelationshipName(null, 'physical')).toEqual([]);
  });

  it('S6-U11: undefined input returns no issues', () => {
    expect(lintRelationshipName(undefined, 'physical')).toEqual([]);
  });

  it('S6-U11: empty string returns no issues', () => {
    expect(lintRelationshipName('', 'physical')).toEqual([]);
  });

  it('S6-U11: whitespace-only returns no issues', () => {
    expect(lintRelationshipName('   ', 'physical')).toEqual([]);
  });

  it('S6-U10: "CustomerOrders" on physical → snake_case violation', () => {
    const issues = lintRelationshipName('CustomerOrders', 'physical');
    const violation = issues.find((i) => i.rule === 'snake_case');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('violation');
    expect(violation!.suggestion).toBe('customer_orders');
  });

  it('S6-U10: "CustomerOrders" on physical → camelCase/PascalCase warning', () => {
    const issues = lintRelationshipName('CustomerOrders', 'physical');
    const warn = issues.find((i) => i.rule === 'relationship_name_case');
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
    expect(warn!.message).toBe('Use snake_case or sentence-style');
  });

  it('"customerOrders" (camelCase) on physical → snake_case violation + case warning', () => {
    const issues = lintRelationshipName('customerOrders', 'physical');
    expect(issues.some((i) => i.rule === 'snake_case')).toBe(true);
    expect(issues.some((i) => i.rule === 'relationship_name_case')).toBe(true);
  });

  it('"has_many_orders" (physical) → no pattern hint (matches convention)', () => {
    const issues = lintRelationshipName('has_many_orders', 'physical');
    expect(issues.some((i) => i.rule === 'relationship_name_pattern')).toBe(false);
  });

  it('"belongs_to_customer" (physical) → no pattern hint', () => {
    const issues = lintRelationshipName('belongs_to_customer', 'physical');
    expect(issues.some((i) => i.rule === 'relationship_name_pattern')).toBe(false);
  });

  it('"customer_to_invoice" (physical) → no pattern hint', () => {
    const issues = lintRelationshipName('customer_to_invoice', 'physical');
    expect(issues.some((i) => i.rule === 'relationship_name_pattern')).toBe(false);
  });

  it('"line_items_of_order" (physical) → no pattern hint', () => {
    const issues = lintRelationshipName('line_items_of_order', 'physical');
    expect(issues.some((i) => i.rule === 'relationship_name_pattern')).toBe(false);
  });

  it('"customer_orders" (physical, no pattern word) → info pattern hint', () => {
    const issues = lintRelationshipName('customer_orders', 'physical');
    const hint = issues.find((i) => i.rule === 'relationship_name_pattern');
    expect(hint).toBeDefined();
    expect(hint!.severity).toBe('info');
    expect(hint!.message).toMatch(/has_|belongs_to_/);
  });

  it('"customer_orders" (physical, no pattern word) → no snake_case violation', () => {
    // Already snake_case, so the physical identifier rule should not fire.
    const issues = lintRelationshipName('customer_orders', 'physical');
    expect(issues.some((i) => i.rule === 'snake_case')).toBe(false);
  });

  it('"CustomerOrders" on conceptual → no snake_case rule (free-form layer)', () => {
    const issues = lintRelationshipName('CustomerOrders', 'conceptual');
    expect(issues.some((i) => i.rule === 'snake_case')).toBe(false);
    // camelCase warning still fires on conceptual — style drift matters on every layer.
    expect(issues.some((i) => i.rule === 'relationship_name_case')).toBe(true);
  });

  it('"CustomerOrders" on logical → no snake_case violation (enforced only on physical)', () => {
    const issues = lintRelationshipName('CustomerOrders', 'logical');
    expect(issues.some((i) => i.rule === 'snake_case')).toBe(false);
  });

  it('trims surrounding whitespace before evaluating', () => {
    const issues = lintRelationshipName('  has_many_orders  ', 'physical');
    expect(issues).toEqual([]);
  });
});
