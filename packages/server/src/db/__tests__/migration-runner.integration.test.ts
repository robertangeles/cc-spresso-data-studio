/**
 * Integration tests for the runOnce data-migration guard.
 *
 * Cases:
 *   1. Runs the migration body the first time and inserts a marker row.
 *   2. Skips the body on every subsequent call AND reports ran=false.
 *   3. If the body throws, the marker is rolled back so the next call
 *      retries (i.e. failures don't poison the marker table).
 *   4. Race-safe: two concurrent runOnce calls with the same name only
 *      execute the body once total.
 *
 * Hits the live Render Postgres via the standard `db` connection.
 * Each test uses a unique migration name and cleans up after itself.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { appliedMigrations } from '../schema.js';
import { runOnce } from '../migration-runner.js';

const createdNames = new Set<string>();

function uniqueName(prefix: string): string {
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createdNames.add(name);
  return name;
}

afterEach(async () => {
  for (const name of createdNames) {
    await db.delete(appliedMigrations).where(eq(appliedMigrations.name, name));
  }
  createdNames.clear();
});

describe('runOnce — data migration guard', () => {
  it('runs the body the first time and writes a marker row', async () => {
    const name = uniqueName('runonce-first');
    let callCount = 0;
    const result = await runOnce(name, async () => {
      callCount += 1;
    });

    expect(result.ran).toBe(true);
    expect(callCount).toBe(1);

    const [marker] = await db
      .select()
      .from(appliedMigrations)
      .where(eq(appliedMigrations.name, name));
    expect(marker).toBeDefined();
    expect(marker.name).toBe(name);
    expect(marker.appliedAt).toBeInstanceOf(Date);
  });

  it('skips the body on subsequent calls', async () => {
    const name = uniqueName('runonce-skip');
    let callCount = 0;
    const fn = async () => {
      callCount += 1;
    };

    const first = await runOnce(name, fn);
    const second = await runOnce(name, fn);
    const third = await runOnce(name, fn);

    expect(first.ran).toBe(true);
    expect(second.ran).toBe(false);
    expect(third.ran).toBe(false);
    expect(callCount).toBe(1);
  });

  it('rolls back the marker if the migration body throws', async () => {
    const name = uniqueName('runonce-throws');

    await expect(
      runOnce(name, async () => {
        throw new Error('intentional test failure');
      }),
    ).rejects.toThrow(/intentional test failure/);

    // Marker must NOT be persisted — otherwise the migration would be
    // permanently marked done despite failing.
    const rows = await db.select().from(appliedMigrations).where(eq(appliedMigrations.name, name));
    expect(rows).toHaveLength(0);

    // And a retry on the next call must execute the body again.
    let retryRan = false;
    const retry = await runOnce(name, async () => {
      retryRan = true;
    });
    expect(retry.ran).toBe(true);
    expect(retryRan).toBe(true);
  });

  it('race-safe: two concurrent calls execute the body exactly once', async () => {
    const name = uniqueName('runonce-race');
    let callCount = 0;
    const fn = async () => {
      // Tiny delay so both promises reach the claim insert before either
      // commits — exercises the ON CONFLICT branch.
      await new Promise((r) => setTimeout(r, 10));
      callCount += 1;
    };

    const [a, b, c] = await Promise.all([runOnce(name, fn), runOnce(name, fn), runOnce(name, fn)]);

    // Exactly one of the three reports ran=true; the other two skip.
    const ranFlags = [a.ran, b.ran, c.ran];
    expect(ranFlags.filter((r) => r === true)).toHaveLength(1);
    expect(callCount).toBe(1);
  });
});
