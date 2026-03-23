# Content Builder - Lessons Learned

<!-- Format: Problem / Fix / Rule -->

## 1. Axios 401 interceptor causes infinite redirect loop

**Problem:** Axios response interceptor redirects to `/login` via `window.location.href` on refresh token failure. On the login page, `AuthProvider` calls `/auth/refresh` on mount, which fails, triggering the interceptor redirect again — infinite loop.

**Fix:**
- Guard redirect: `if (window.location.pathname !== '/login')` before `window.location.href = '/login'`
- Mark initial session restore call with `_retry: true` so interceptor skips re-triggering

**Rule:** Any `window.location.href` redirect in an Axios interceptor must check current path to prevent loops. Initial auth restore calls should bypass the retry interceptor.

## 2. dotenv path resolution in monorepo

**Problem:** `dotenv.config({ path: path.resolve(__dirname, '../../../.env') })` from `packages/server/src/config/` resolved to `packages/server/.env` instead of the root `.env`. Server silently fell back to localhost DB defaults.

**Fix:** Changed to `../../../../.env` (4 levels up from `packages/server/src/config/` to repo root).

**Rule:** Always count directory levels carefully when using `__dirname` with `import.meta.url` in a monorepo. When a DB connection falls back to localhost, suspect the `.env` path first. Add a `verifyConnection()` call at startup to fail fast instead of silently using wrong defaults.

## 3. Always kill stale ports before asking user to test

**Problem:** After code changes, asking the user to restart with `pnpm dev` fails with `EADDRINUSE` because the old server process is still holding the port. User has to manually kill the port every time.

**Fix:** Always run `npx kill-port 3001; npx kill-port 5173` before asking the user to restart dev servers.

**Rule:** Before ANY "restart and test" instruction, kill ports 3001 and 5173 first. Never assume the user closed the old process. This is a mandatory step — not optional.

## 4. End-to-end verification is MANDATORY before presenting work as done

**Problem:** Multiple features shipped with bugs that the user discovered during testing — duplicate SSE events, 404 on approval endpoints, stale auth tokens, missing route guards. Each fix required another round trip instead of catching it before handoff.

**Fix:** After every feature or fix, before telling the user to test:
1. `pnpm tsc` — both client and server must pass
2. `drizzle-kit push` — if schema changed
3. Trace every new UI interaction to its API endpoint — verify the route exists, the handler is correct, and the response is consumed properly
4. Check state transitions — what happens on success, error, empty, and stale states
5. Verify guard conditions — buttons disabled when they should be, API calls guarded against impossible states

**Rule:** NEVER mark a feature done without mentally walking through every user interaction end-to-end. If a button calls an API, verify the route exists. If an SSE event emits, verify it's consumed exactly once. If state changes, verify the UI reflects it. The user is not a QA tester — that's my job.

## 5. Always check .env when changing config defaults

**Problem:** Changed JWT access token expiry default from '15m' to '4h' in config/index.ts, but `.env` had `JWT_ACCESS_EXPIRY=15m` which overrides the default. User spent hours debugging 401 errors that were caused by expired 15-minute tokens during long orchestration runs.

**Fix:** Changed `.env` to `JWT_ACCESS_EXPIRY=4h`.

**Rule:** When changing ANY config default, ALWAYS check `.env` and `.env.example` for overrides. The `.env` file takes priority over code defaults — a code change without an `.env` update is invisible. Check BOTH files every time.

## 6. Never add useState after an early return

**Problem:** Added `useState(false)` for `showDeleteModal` after the `if (isLoading || !flow) return` guard in FlowBuilderPage. React hooks must be called in the same order every render — placing a hook after a conditional return means it runs on some renders but not others, causing "Rendered more hooks than during the previous render."

**Fix:** Moved `useState` above the early return.

**Rule:** ALL hooks (useState, useEffect, useCallback, useRef) must be declared BEFORE any conditional return. When adding state to an existing component, always check for early returns and place the new hook above them.
