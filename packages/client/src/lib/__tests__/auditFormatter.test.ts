import { describe, it, expect } from 'vitest';
import { formatAuditEvent, type AuditEvent } from '../auditFormatter';

/**
 * Pure-function tests for the audit-event humaniser.
 *
 * Contract: formatAuditEvent always returns a non-empty string[],
 * never throws, and never dumps raw JSON in the common cases.
 */

function event(partial: Partial<AuditEvent>): AuditEvent {
  return {
    id: 'ev-1',
    action: partial.action ?? 'update',
    changedBy: 'user-1',
    beforeState: partial.beforeState ?? null,
    afterState: partial.afterState ?? null,
    createdAt: partial.createdAt ?? '2026-04-20T00:00:00.000Z',
    ...partial,
  };
}

describe('formatAuditEvent — create action', () => {
  it('summarises non-default initial values', () => {
    const lines = formatAuditEvent(
      event({
        action: 'create',
        afterState: {
          name: 'customer_id',
          dataType: 'uuid',
          isPrimaryKey: true,
          classification: 'PII',
        },
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('customer_id');
    expect(lines[0]).toContain('uuid');
    expect(lines[0]).toContain('primary key');
    expect(lines[0]).toContain('PII');
  });

  it('falls back to "Created" when afterState is empty', () => {
    const lines = formatAuditEvent(event({ action: 'create', afterState: {} }));
    expect(lines).toEqual(['Created.']);
  });

  it('handles missing afterState gracefully', () => {
    const lines = formatAuditEvent(event({ action: 'create', afterState: null }));
    expect(lines).toEqual(['Created.']);
  });
});

describe('formatAuditEvent — update action', () => {
  it('narrates a rename', () => {
    const lines = formatAuditEvent(
      event({
        action: 'update',
        beforeState: { name: 'customer_id' },
        afterState: { name: 'cust_id' },
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Name');
    expect(lines[0]).toContain('customer_id');
    expect(lines[0]).toContain('cust_id');
  });

  it('phrases PK toggle as "Marked as primary key"', () => {
    const lines = formatAuditEvent(
      event({
        action: 'update',
        beforeState: { isPrimaryKey: false },
        afterState: { isPrimaryKey: true },
      }),
    );
    expect(lines).toEqual(['Marked as primary key.']);
  });

  it('phrases isNullable=false as "Set NOT NULL"', () => {
    const lines = formatAuditEvent(
      event({
        action: 'update',
        beforeState: { isNullable: true },
        afterState: { isNullable: false },
      }),
    );
    expect(lines).toEqual(['Set NOT NULL.']);
  });

  it('summarises classification set', () => {
    const lines = formatAuditEvent(
      event({
        action: 'update',
        beforeState: { classification: null },
        afterState: { classification: 'PII' },
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Classification set');
    expect(lines[0]).toContain('PII');
  });

  it('summarises long description change by size, not content', () => {
    const lines = formatAuditEvent(
      event({
        action: 'update',
        beforeState: { description: 'short' },
        afterState: { description: 'x'.repeat(2000) },
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Definition');
    expect(lines[0]).toContain('5');
    expect(lines[0]).toContain('2000');
    // Must NOT inline the 2000-char body.
    expect(lines[0]).not.toContain('xxxxxx');
  });

  it('narrates multiple field changes as multiple lines', () => {
    const lines = formatAuditEvent(
      event({
        action: 'update',
        beforeState: { name: 'a', dataType: 'varchar', isPrimaryKey: false },
        afterState: { name: 'b', dataType: 'text', isPrimaryKey: true },
      }),
    );
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.some((l) => l.includes('Name'))).toBe(true);
    expect(lines.some((l) => l.includes('Data type'))).toBe(true);
    expect(lines.some((l) => l.includes('primary key'))).toBe(true);
  });

  it('handles missing beforeState gracefully', () => {
    const lines = formatAuditEvent(
      event({ action: 'update', beforeState: null, afterState: { name: 'x' } }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/before-state or after-state unavailable/i);
  });

  it('skips internal bookkeeping fields (id, createdAt, updatedAt)', () => {
    const lines = formatAuditEvent(
      event({
        action: 'update',
        beforeState: { id: 'a', createdAt: '2026', updatedAt: '2026', name: 'x' },
        afterState: { id: 'a', createdAt: '2026', updatedAt: '2027', name: 'y' },
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Name');
  });

  it('humanises unknown field names', () => {
    const lines = formatAuditEvent(
      event({
        action: 'update',
        beforeState: { someNewField: 'a' },
        afterState: { someNewField: 'b' },
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Some new field');
  });
});

describe('formatAuditEvent — delete action', () => {
  it('narrates a cascaded delete with dependents', () => {
    const lines = formatAuditEvent(
      event({
        action: 'delete',
        beforeState: {
          name: 'customer_id',
          cascaded: true,
          dependents: { attributeLinks: 2, semanticMappings: 1 },
        },
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Deleted');
    expect(lines[0]).toContain('cascaded');
    expect(lines[0]).toContain('link');
  });

  it('narrates a simple delete without dependents', () => {
    const lines = formatAuditEvent(event({ action: 'delete', beforeState: { name: 'x' } }));
    expect(lines).toEqual(['Deleted `x`.']);
  });
});

describe('formatAuditEvent — synthetic data', () => {
  it('narrates synthetic generation with row count + model', () => {
    const lines = formatAuditEvent(
      event({
        action: 'synthetic_generated',
        afterState: {
          rowCount: 10,
          modelUsed: 'anthropic/claude-sonnet-4-6',
          promptSlug: 'model-studio-synthetic-data',
        },
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('10');
    expect(lines[0]).toContain('claude-sonnet-4-6');
  });
});

describe('formatAuditEvent — edge cases', () => {
  it('returns fallback line on unknown action', () => {
    const lines = formatAuditEvent(event({ action: 'magic_happens' }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('magic_happens');
  });

  it('never throws on corrupt event shape', () => {
    const corrupt = {
      id: 'ev-x',
      action: 'update',
      changedBy: 'user-1',
      beforeState: 'not-an-object',
      afterState: 42,
      createdAt: '2026-04-20',
    } as unknown as AuditEvent;
    expect(() => formatAuditEvent(corrupt)).not.toThrow();
    const lines = formatAuditEvent(corrupt);
    expect(lines.length).toBeGreaterThan(0);
  });
});
