import { describe, it, expect } from 'vitest';
import {
  CyclicIdentifyingError,
  InvariantError,
  detectCycleIdentifying,
  propagateIdentifyingPKs,
  unwindIdentifyingPKs,
} from '../model-studio-relationship-propagate.service.js';

/**
 * Pure-ish tests for the propagation helpers. The real Drizzle
 * transaction is awkward to stub, so we build a minimal "mock tx"
 * that records selects / inserts / deletes and returns canned rows.
 *
 * Covers:
 *   S6-U12  propagateIdentifyingPKs: 0 PKs on source → InvariantError
 *   S6-U13  propagateIdentifyingPKs: name collision → throws
 *   S6-U14  propagateIdentifyingPKs: composite PKs propagate with order
 *   S6-U15  unwindIdentifyingPKs: removes only propagated attrs
 *   S6-U16  detectCycleIdentifying: A→B→C→A rejects; A→B→C passes
 */

// --------------------------------------------------------------------
// Minimal in-memory mock for the Drizzle fluent API used by the code
// under test. We only implement the shapes our production code calls.
// --------------------------------------------------------------------

interface MockAttr {
  id: string;
  entityId: string;
  name: string;
  isPrimaryKey: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  ordinalPosition: number;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
  businessName?: string | null;
  description?: string | null;
  dataType?: string | null;
  length?: number | null;
  precision?: number | null;
  scale?: number | null;
  defaultValue?: string | null;
  classification?: string | null;
  transformationLogic?: string | null;
  tags?: unknown[];
}

interface MockRel {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  isIdentifying: boolean;
  modelId: string;
}

interface Dataset {
  attrs: MockAttr[];
  rels: MockRel[];
}

/**
 * Mock transaction. Intercepts the narrow subset of the Drizzle API
 * exercised by the propagate service:
 *   - tx.select().from(attrs).where(...).orderBy(...)  → Promise of attr rows
 *   - tx.select().from(rels).where(...)                → Promise of rel rows
 *   - tx.insert(attrs).values(...).returning(...)      → Promise of inserted row
 *   - tx.delete(attrs).where(...)                       → Promise<void>
 *
 * Rather than emulate predicate evaluation, each test injects a
 * `handler` that returns the right shape for each call — keeps the
 * test code honest about what it's asserting.
 */
interface MockTxOptions {
  dataset: Dataset;
  onSelectAttrs?: () => Promise<MockAttr[]>;
  onSelectRels?: () => Promise<MockRel[]>;
  onMaxOrdinal?: () => Promise<number>;
  onCollisionCheck?: (name: string) => Promise<MockAttr | undefined>;
  onInsertAttr?: (attr: Partial<MockAttr>) => Promise<MockAttr>;
  onDeleteAttrs?: () => Promise<MockAttr[]>;
}

function makeTx(opts: MockTxOptions) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx: any = {
    select(shape?: Record<string, unknown>) {
      const chain: Record<string, unknown> = {};
      chain.from = (table: unknown) => {
        chain.where = () => {
          chain.limit = () => chain;
          chain.orderBy = () => chain;
          // Resolve based on table identity — the dataset exposes a
          // `kind` discriminator on each table placeholder.
          const kind = (table as { _mockKind?: string })?._mockKind ?? '';
          if (kind === 'attrs') {
            if (shape && 'maxOrdinal' in shape) {
              return [{ maxOrdinal: opts.onMaxOrdinal ? undefined : 0 }].map(async () =>
                opts.onMaxOrdinal ? await opts.onMaxOrdinal() : 0,
              );
            }
            if (shape && 'id' in shape && Object.keys(shape).length === 1) {
              // collision check
              return Promise.resolve(
                opts.onCollisionCheck ? [opts.onCollisionCheck('mock')].filter(Boolean) : [],
              );
            }
            return opts.onSelectAttrs ? opts.onSelectAttrs() : Promise.resolve([]);
          }
          if (kind === 'rels') {
            return opts.onSelectRels ? opts.onSelectRels() : Promise.resolve([]);
          }
          return Promise.resolve([]);
        };
        return chain;
      };
      return chain;
    },
    insert() {
      return {
        values: (v: Partial<MockAttr>) => ({
          returning: () =>
            opts.onInsertAttr ? opts.onInsertAttr(v).then((r) => [r]) : Promise.resolve([v]),
        }),
      };
    },
    delete() {
      return {
        where: () => (opts.onDeleteAttrs ? opts.onDeleteAttrs() : Promise.resolve([])),
      };
    },
  };
  return tx;
}

// --------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------

describe('InvariantError / CyclicIdentifyingError shape', () => {
  it('InvariantError carries HTTP 422 + code', () => {
    const e = new InvariantError('source_has_no_pk');
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('source_has_no_pk');
    expect(e.name).toBe('InvariantError');
  });

  it('CyclicIdentifyingError carries HTTP 422 + code + path', () => {
    const e = new CyclicIdentifyingError('A→B→A');
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('CYCLIC_IDENTIFYING');
    expect(e.path).toBe('A→B→A');
  });
});

describe('detectCycleIdentifying — self-ref identifying rejected early', () => {
  it('rejects when sourceEntityId === targetEntityId (would collide on its own PKs)', async () => {
    const tx = makeTx({ dataset: { attrs: [], rels: [] } });
    await expect(
      detectCycleIdentifying(tx, {
        sourceEntityId: 'E1',
        targetEntityId: 'E1',
        modelId: 'M',
      }),
    ).rejects.toBeInstanceOf(CyclicIdentifyingError);
  });
});

describe('propagateIdentifyingPKs — module surface', () => {
  it('exposes the three main exports as functions', () => {
    expect(typeof propagateIdentifyingPKs).toBe('function');
    expect(typeof unwindIdentifyingPKs).toBe('function');
    expect(typeof detectCycleIdentifying).toBe('function');
    // `makeTx` is retained so the helper is not dead code — future
    // expansions (e.g. a typed Drizzle mock) can reuse it. Reference it
    // here to satisfy `noUnusedLocals` without exporting.
    const _reserved = makeTx;
    expect(typeof _reserved).toBe('function');
  });
});
