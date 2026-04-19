import { describe, it, expect } from 'vitest';
import { lintIdentifier, toSnakeCase } from '../utils/naming-lint.js';

/**
 * Step 4 — naming-lint groundwork (D6).
 *
 * Maps to test-plan-model-studio.md cases:
 *   S4-U1: customerID flagged on physical, fix suggestion = customer_id
 *   S4-U2: Customer entity passes on conceptual layer
 *   S4-U3: reserved SQL word (order/user) → warning
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
});
