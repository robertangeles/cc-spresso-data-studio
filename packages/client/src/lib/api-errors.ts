import axios from 'axios';

/**
 * Shared helpers for narrowing axios errors against the Spresso server's
 * envelope shape. Step 7 hooks import these; earlier hooks
 * (`useRelationships`, `useAttributes`, …) inlined equivalent helpers —
 * they stay untouched per CLAUDE.md §3 (Surgical Changes).
 *
 * Envelope contract (server-side, see `utils/errors.ts`):
 *   { success: false, error: string, statusCode: number,
 *     details?: Record<string, string[]> }
 */

export interface ServerErrorBody {
  success: false;
  error?: string;
  statusCode?: number;
  details?: Record<string, string[]>;
}

/** Narrow an unknown thrown value to the server's structured error
 *  envelope. Returns `null` for anything that isn't an axios error
 *  carrying the expected `{ success: false, ... }` body. */
export function readServerError(err: unknown): ServerErrorBody | null {
  if (!axios.isAxiosError(err)) return null;
  const body = err.response?.data as unknown;
  if (
    body === null ||
    typeof body !== 'object' ||
    !('success' in body) ||
    (body as { success: unknown }).success !== false
  ) {
    return null;
  }
  return body as ServerErrorBody;
}

/** Extract a user-facing error message from a thrown value. Prefers
 *  the server's `error` field, falls back to `err.message`, then the
 *  caller's fallback string. */
export function errorMessage(err: unknown, fallback: string): string {
  const body = readServerError(err);
  if (body?.error) return body.error;
  if (err instanceof Error) return err.message;
  return fallback;
}

/** True when the error is an axios error with the given HTTP status. */
export function isStatus(err: unknown, status: number): boolean {
  return axios.isAxiosError(err) && err.response?.status === status;
}

/** Pull a specific key from the server's `details` bag (arrays of
 *  messages keyed by field). Returns `null` when absent. */
export function readDetailField(err: unknown, key: string): string[] | null {
  const body = readServerError(err);
  const arr = body?.details?.[key];
  return Array.isArray(arr) ? arr : null;
}
