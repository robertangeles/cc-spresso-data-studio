import { describe, it, expect, vi } from 'vitest';
import { runSerializable } from '../serializable-tx.js';

/**
 * Unit tests for the SERIALIZABLE + bounded-retry transaction wrapper.
 *
 * We don't need a real DB here — the contract is purely about retry
 * behaviour on 40001 (serialization_failure) errors. A mock db whose
 * `transaction` method we can program per-test gives us full coverage
 * without the cost or flakiness of a live Postgres.
 *
 * Real-DB verification of the full create-layer-link flow under
 * concurrent load lives in the integration suite (Task 15 / Step 7).
 */

/** Minimal mock that looks like a `PgDatabase` to the wrapper.
 *  `any` cast is deliberate — the tests target the wrapper's retry
 *  behaviour, not Drizzle's generic parameter machinery. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockDb(transaction: (...args: any[]) => any): any {
  return { transaction };
}

/** Build a fake Postgres error carrying a SQLSTATE code in the
 *  requested position (top-level, `.cause`, or both). Mirrors the
 *  variations Drizzle has historically surfaced across versions. */
function pgErr(sqlstate: string, placement: 'top' | 'cause' | 'both' = 'top'): Error {
  const e = new Error(`pg error ${sqlstate}`) as Error & { code?: string; cause?: unknown };
  if (placement === 'top' || placement === 'both') {
    e.code = sqlstate;
  }
  if (placement === 'cause' || placement === 'both') {
    e.cause = { code: sqlstate };
  }
  return e;
}

describe('runSerializable', () => {
  // Using real timers — the jitter is 10-50ms per retry, so 2 retries
  // total stays well under 150ms. Keeps the tests simple + avoids the
  // unhandled-rejection timing race that fake-timers introduce when
  // `runAllTimersAsync()` runs concurrently with an unclaimed promise.

  it('runs the inner function once on happy path and returns its result', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transaction = vi.fn(async (cb: any, _opts?: any) => cb({}));
    const db = makeMockDb(transaction);

    const result = await runSerializable(db, fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    // Second argument must pass SERIALIZABLE isolation to Drizzle.
    expect(transaction.mock.calls[0]![1]).toEqual({ isolationLevel: 'serializable' });
  });

  it('retries once on 40001 and succeeds on the second attempt', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw pgErr('40001');
      return 'ok-on-retry';
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transaction = vi.fn(async (cb: any, _opts?: any) => cb({}));
    const db = makeMockDb(transaction);

    const result = await runSerializable(db, fn);

    expect(result).toBe('ok-on-retry');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('retries up to MAX_ATTEMPTS (3) then surfaces the final 40001', async () => {
    const fn = vi.fn(async () => {
      throw pgErr('40001');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transaction = vi.fn(async (cb: any, _opts?: any) => cb({}));
    const db = makeMockDb(transaction);

    await expect(runSerializable(db, fn)).rejects.toThrow('pg error 40001');
    // 3 attempts total (1 initial + 2 retries), per the wrapper's policy.
    expect(fn).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-40001 errors — they bubble on the first attempt', async () => {
    const uniqueViolation = pgErr('23505');
    const fn = vi.fn(async () => {
      throw uniqueViolation;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transaction = vi.fn(async (cb: any, _opts?: any) => cb({}));
    const db = makeMockDb(transaction);

    await expect(runSerializable(db, fn)).rejects.toBe(uniqueViolation);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('detects 40001 when the SQLSTATE lives on .cause (Drizzle-wrapped)', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw pgErr('40001', 'cause');
      return 'ok';
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transaction = vi.fn(async (cb: any, _opts?: any) => cb({}));
    const db = makeMockDb(transaction);

    const result = await runSerializable(db, fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry an unrelated error that happens to be shaped like pg error', async () => {
    const appError = new Error('ValidationError: cycle');
    // No SQLSTATE code anywhere.
    const fn = vi.fn(async () => {
      throw appError;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transaction = vi.fn(async (cb: any, _opts?: any) => cb({}));
    const db = makeMockDb(transaction);

    await expect(runSerializable(db, fn)).rejects.toBe(appError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
