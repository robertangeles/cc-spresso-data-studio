import { describe, it, expect } from 'vitest';
import { lintAttribute, lintIdentifier, toSnakeCase } from '../utils/naming-lint.js';

/**
 * Step 4 — naming-lint groundwork (D6).
 * Step 5 — attribute-aware lint extensions.
 *
 * Maps to test-plan-model-studio.md cases:
 *   S4-U1: customerID flagged on physical, fix suggestion = customer_id
 *   S4-U2: Customer entity passes on conceptual layer
 *   S4-U3: reserved SQL word (order/user) → warning
 *   S5-U1-lint: *_id suffix with non-uuid type → warning
 *   S5-U1-lint: VARCHAR without length → warning
 *   S5-U1-lint: NUMERIC scale > precision → violation
 */

describe('naming-lint', () => {
  describe('toSnakeCase', () => {
    it('rewrites camelCase to snake_case', () => {
      expect(toSnakeCase('customerID')).toBe('customer_id');
      expect(toSnakeCase('OrderItem')).toBe('order_item');
    });

    it('preserves acronym + word boundaries', () => {
      expect(toSnakeCase('HTTPRequest')).toBe('http_request');
    });

    it('collapses spaces and hyphens', () => {
      expect(toSnakeCase('Customer Order')).toBe('customer_order');
      expect(toSnakeCase('order-line-item')).toBe('order_line_item');
    });

    it('returns lowercase already-snake names unchanged', () => {
      expect(toSnakeCase('customer_id')).toBe('customer_id');
    });
  });

  describe('lintIdentifier', () => {
    it('S4-U1: customerID on physical layer → snake_case violation with customer_id fix', () => {
      const issues = lintIdentifier('customerID', 'physical');
      const violation = issues.find((i) => i.rule === 'snake_case');
      expect(violation).toBeDefined();
      expect(violation!.severity).toBe('violation');
      expect(violation!.suggestion).toBe('customer_id');
    });

    it('S4-U2: Customer on conceptual layer → no violation', () => {
      const issues = lintIdentifier('Customer', 'conceptual');
      expect(issues).toEqual([]);
    });

    it('S4-U2 follow-up: Customer on physical layer → snake_case violation', () => {
      const issues = lintIdentifier('Customer', 'physical');
      expect(issues.find((i) => i.rule === 'snake_case')).toBeDefined();
    });

    it('S4-U3: reserved SQL word "order" on physical layer → warning', () => {
      const issues = lintIdentifier('order', 'physical');
      const reserved = issues.find((i) => i.rule === 'reserved_sql_word');
      expect(reserved).toBeDefined();
      expect(reserved!.severity).toBe('warning');
    });

    it('S4-U3: reserved SQL word "user" on logical layer → warning (no snake_case violation)', () => {
      const issues = lintIdentifier('user', 'logical');
      expect(issues.some((i) => i.rule === 'snake_case')).toBe(false);
      expect(issues.some((i) => i.rule === 'reserved_sql_word' && i.severity === 'warning')).toBe(
        true,
      );
    });

    it('reserved word on conceptual → not flagged (free-form layer)', () => {
      const issues = lintIdentifier('Order', 'conceptual');
      expect(issues).toEqual([]);
    });

    it('snake_case lowercase identifier on physical → no violations', () => {
      expect(lintIdentifier('customer_order', 'physical')).toEqual([]);
    });

    it('empty string returns no issues', () => {
      expect(lintIdentifier('   ', 'physical')).toEqual([]);
    });
  });

  describe('lintAttribute', () => {
    it('*_id suffix with non-uuid data_type → warning suggesting uuid', () => {
      const issues = lintAttribute('customer_id', 'physical', { dataType: 'varchar', length: 36 });
      const rule = issues.find((i) => i.rule === 'id_suffix_should_be_uuid');
      expect(rule).toBeDefined();
      expect(rule!.severity).toBe('warning');
      expect(rule!.suggestion).toBe('uuid');
    });

    it('*_id suffix with uuid data_type → no id-suffix warning', () => {
      const issues = lintAttribute('customer_id', 'physical', { dataType: 'uuid' });
      expect(issues.some((i) => i.rule === 'id_suffix_should_be_uuid')).toBe(false);
    });

    it('bare "id" name is not flagged (valid PK column)', () => {
      const issues = lintAttribute('id', 'physical', { dataType: 'varchar', length: 10 });
      expect(issues.some((i) => i.rule === 'id_suffix_should_be_uuid')).toBe(false);
    });

    it('VARCHAR without length → warning', () => {
      const issues = lintAttribute('name', 'physical', { dataType: 'VARCHAR' });
      const rule = issues.find((i) => i.rule === 'varchar_requires_length');
      expect(rule).toBeDefined();
      expect(rule!.severity).toBe('warning');
    });

    it('VARCHAR with length → no length warning', () => {
      const issues = lintAttribute('name', 'physical', { dataType: 'varchar', length: 255 });
      expect(issues.some((i) => i.rule === 'varchar_requires_length')).toBe(false);
    });

    it('NUMERIC with scale > precision → violation', () => {
      const issues = lintAttribute('amount', 'physical', {
        dataType: 'NUMERIC',
        precision: 5,
        scale: 10,
      });
      const rule = issues.find((i) => i.rule === 'numeric_scale_gt_precision');
      expect(rule).toBeDefined();
      expect(rule!.severity).toBe('violation');
    });

    it('NUMERIC with scale ≤ precision → no violation', () => {
      const issues = lintAttribute('amount', 'physical', {
        dataType: 'numeric',
        precision: 10,
        scale: 2,
      });
      expect(issues.some((i) => i.rule === 'numeric_scale_gt_precision')).toBe(false);
    });

    it('conceptual layer attribute → base rules only, no attribute rules', () => {
      const issues = lintAttribute('customerID', 'conceptual', { dataType: 'varchar' });
      expect(issues).toEqual([]);
    });

    it('base lintIdentifier rules flow through (snake_case violation preserved)', () => {
      const issues = lintAttribute('customerID', 'physical', { dataType: 'uuid' });
      expect(issues.find((i) => i.rule === 'snake_case')).toBeDefined();
    });
  });
});
