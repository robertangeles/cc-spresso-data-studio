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

## 7. Test all routes via curl before marking feature done

**Problem:** Multiple features shipped with endpoints that returned 404, 401, or wrong data — only discovered when the user tested in the browser, burning API credits.

**Fix:** After every new or updated API endpoint, test it with curl before touching the frontend:

```
curl -X POST http://localhost:3003/api/chat/conversations -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"model":"claude-sonnet-4-6"}'
```

**Rule:** MANDATORY for every new/updated feature:

1. List every API route the feature touches
2. Test each with curl (or ctx_execute fetch) — verify status 200 and correct response shape
3. Test auth: verify 401 without token, 403 for wrong role
4. Test error paths: missing params, invalid IDs
5. Only THEN wire the frontend
6. This is non-negotiable — no exceptions

## 8. Clean up test data after testing

**Problem:** 12+ test user accounts accumulated in the production database from debugging sessions. Junk data pollutes the DB and confuses the user when viewing admin pages.

**Fix:** Deleted all test accounts: `DELETE FROM users WHERE email != 'trebor.selegna@outlook.com'`

**Rule:** After any testing that creates test accounts, records, or data:

1. Delete test users: `DELETE FROM users WHERE email LIKE '%test.com'`
2. Delete orphaned data from related tables
3. Never leave test data in the DB after a session
4. Use a consistent test email pattern (e.g., `test*@test.com`) so cleanup is easy

## 9. Render deployment: pnpm not available by default

**Problem:** Render's Node runtime doesn't have pnpm installed. `corepack enable` fails because the filesystem is read-only (`EROFS: read-only file system`). Using `pnpm --filter` to build individual packages fails because TypeScript project references between workspace packages don't resolve when built in isolation.

**Fix:**

- Install pnpm via npm: `npm install -g pnpm`
- Use `pnpm -r build` (recursive) instead of `--filter` — it respects workspace dependency order and builds shared types before dependent packages
- Final build command: `npm install -g pnpm && pnpm install && pnpm -r build`

**Rule:** For pnpm monorepos on Render: always use `npm install -g pnpm` (not corepack), and always use `pnpm -r build` (not `--filter`) to ensure workspace dependencies resolve in the correct order.

## 10. Render deployment: devDependencies not installed in production

**Problem:** Render sets `NODE_ENV=production` which tells pnpm to skip `devDependencies`. But `@types/*` packages (express, node, etc.) are devDependencies needed for the `tsc` build step. Build fails with "Could not find a declaration file" errors for every import.

**Fix:** Prefix the install step with `NODE_ENV=development` to force all dependencies to install during build:

```
NODE_ENV=development pnpm install
```

**Rule:** Always use `NODE_ENV=development pnpm install` in Render build commands. The production NODE_ENV is only needed at runtime (start command), not during build. Build needs all deps including @types.

## 11. Render deployment: stale tsconfig.tsbuildinfo breaks declaration generation

**Problem:** `tsconfig.tsbuildinfo` is committed to git with absolute local machine paths. On Render, TypeScript sees the stale buildinfo and may skip regenerating `.d.ts` declaration files. Server then can't find type declarations for `@cc/shared`.

**Fix:** Delete the buildinfo before building:

```
rm -f packages/shared/tsconfig.tsbuildinfo
```

**Rule:** Either add `tsconfig.tsbuildinfo` to `.gitignore`, or delete it in the Render build command before compiling. Stale buildinfo from a different machine will cause silent type resolution failures.

## 12. Render deployment: static file path must resolve from compiled output, not source

**Problem:** `path.resolve(__dirname, '../../../client/dist')` resolved to the wrong directory because `__dirname` in production points to `packages/server/dist/` (compiled), not `packages/server/src/` (source). Off by one directory level, serving from `<root>/client/dist` instead of `<root>/packages/client/dist`.

**Fix:** Use `process.cwd()` for production paths instead of `__dirname` with relative traversal:

```typescript
const clientDist = path.join(process.cwd(), 'packages/client/dist');
```

**Rule:** Never use `__dirname` with relative paths for cross-package references in production. Use `process.cwd()` (always the project root) or environment variables. Always count directory levels from the **compiled output** location, not the source file.

## 13. Render deployment: DATABASE_URL needs sslmode=require

**Problem:** Render PostgreSQL requires SSL connections. The server's `pg.Pool` connects without SSL by default, causing "SSL/TLS required" fatal errors on startup.

**Fix:** Append `?sslmode=require` to the `DATABASE_URL` environment variable on Render.

**Rule:** Always add `?sslmode=require` to any cloud-hosted PostgreSQL connection string. The server code already handles SSL when this flag is present — it's the env var that needs it.

## 14. Render deployment: complete working build command for pnpm monorepo

**Problem:** Multiple failed deploys due to cascading issues: no pnpm, no devDeps, stale buildinfo, wrong paths.

**Final working build command:**

```
npm install -g pnpm@9 && NODE_ENV=development pnpm install && rm -f packages/shared/tsconfig.tsbuildinfo && pnpm -C packages/shared build && pnpm -C packages/server build && cd packages/client && npx vite build
```

**Rule:** Record the exact working build command. When deploying a new monorepo to Render, start from this template and adjust package names. Don't iterate on Render's slow build cycle — test the build command locally first with `NODE_ENV=production` to catch issues before pushing.

## 15. Render deployment: custom domain setup (GoDaddy + Render)

**Steps:**

1. Render → Service → Settings → Custom Domains → Add domain
2. GoDaddy DNS:
   - Root domain: Two A records → `216.24.57.1` and `216.24.57.253`
   - www subdomain: CNAME → `<service-name>.onrender.com`
3. Set `CLIENT_URL=https://yourdomain.com` in Render env vars
4. Render auto-provisions SSL certificate (Let's Encrypt)
5. DNS propagation takes 5-10 minutes

**Rule:** Always set both root (A records) and www (CNAME) so both URLs work. Use the root domain (no www) as the canonical `CLIENT_URL`.

## 16. CI/CD: pnpm monorepo with composite TypeScript requires build-before-lint

**Problem:** GitHub Actions CI failed repeatedly because eslint with `@typescript-eslint` needs `@cc/shared` declaration files (`.d.ts`) to exist before linting server code. On a clean CI checkout, `dist/` doesn't exist. Tried 6 approaches: separate typecheck steps, paths mapping, removing composite, reordering steps — each revealed a deeper issue.

**Root cause chain:**

1. `@cc/shared` uses `composite: true` in tsconfig — requires built output
2. pnpm's strict isolation created hardlinked copies (not symlinks) — server couldn't see shared's dist
3. Stale `tsconfig.tsbuildinfo` caused tsc to skip rebuild even when dist was deleted
4. Build artifacts accidentally committed into `src/` were linted and contained `any` types

**Fix:**

1. `.npmrc`: `link-workspace-packages=true` — forces pnpm to use symlinks
2. Build script: `rm -f packages/shared/tsconfig.tsbuildinfo && pnpm -C packages/shared build && pnpm -C packages/server build && pnpm -C packages/client build`
3. CI order: install → build all → lint → test
4. `.gitignore`: `*.tsbuildinfo` + `packages/shared/src/**/*.js` + `packages/shared/src/**/*.d.ts`

**Rule:** In a pnpm monorepo with TypeScript composite project references:

- Always build shared packages BEFORE lint (declarations are a build dependency, not a workaround)
- Always use `link-workspace-packages=true` in `.npmrc`
- Always clean `tsconfig.tsbuildinfo` before builds (prevents stale cache)
- Never commit build artifacts — gitignore `*.tsbuildinfo` and `**/*.d.ts` in source dirs
- Make build order explicit in scripts — don't rely on `pnpm -r` parallel execution

## 17. Never take shortcuts in CI/CD configuration

**Problem:** When CI kept failing, the tempting fix was "just move lint after build" or "just suppress the warning." Each shortcut masked the real issue and created a new failure mode.

**Fix:** Traced the actual module resolution path: import statement → node_modules symlink → package.json exports → dist/index.d.ts → composite tsbuildinfo → build order. Fixed each layer properly.

**Rule:** When a CI pipeline fails, trace the full resolution chain from the error message to the root cause. Don't reorder steps to avoid errors — fix why the error happens. Don't suppress lint rules — fix the code. Don't skip checks — fix the config. Every shortcut becomes technical debt.

## 18. Infection Virus design standard — not optional polish

**Problem:** Content Builder initially shipped with flat, clinical UI. Platform chips were all gray, empty states were boring, cards had no depth. It looked functional but uninspiring — not investor-demo ready.

**Fix:** Established "Infection Virus" as a MANDATORY design standard in CLAUDE.md: glass morphism, amber glows, gradient accents, depth layers, micro-animations, per-platform colors, keyboard shortcuts.

**Rule:** Every new UI component must pass the "would you want to touch it?" test before shipping. Glass morphism on cards, hover lift effects, platform-specific colors, stagger animations on mount, glow on focus states. This is not polish — it's a core design requirement. Added to CLAUDE.md as enforceable standard.

## 19. Progressive disclosure > overwhelming users

**Problem:** Content Builder showed everything at once — 11 platform chips, media studio, AI assistant, schedule panel — without guiding users through the natural workflow (write → platforms → adapt → media → schedule).

**Fix:** Implemented a flow state machine (IDLE → WRITING → PLATFORMS_SELECTED → ADAPTED → READY) that controls what's visible and what glows. Media Studio starts collapsed. Schedule panel dims until content exists. Contextual placeholders guide the next action.

**Rule:** For complex multi-step features, use progressive disclosure: show only what's relevant at each step. Add subtle glow/nudge to the next recommended action. Power users can always expand everything manually. Step indicators provide orientation without being patronizing.

## 20. Follow branching strategy — no exceptions for "speed"

**Problem:** Multi-account picker feature (8 files, 250+ lines) was committed directly to main without a feature branch. Shipped a calendar JOIN bug that fanned out scheduled posts to all accounts per platform. Deployed broken code to production because shortcuts were taken.

**Fix:** Fixed the calendar query to join on socialAccountId instead of platform slug. But the damage was already in production.

**Rule:** Non-trivial changes (3+ files or architectural decisions) MUST go on a feature branch. No exceptions. The workflow is: branch → implement → CI passes → verify end-to-end → merge with --no-ff → confirm with user before push. Committing directly to main for speed is a false economy — the time "saved" gets spent debugging production bugs.

## 21. Verify JOIN queries when tables have one-to-many relationships

**Problem:** Calendar query LEFT JOINed scheduledPosts to socialAccounts by platform slug. When a user had 2 Facebook Pages connected, every scheduled Facebook post appeared twice in the calendar — one phantom row per account.

**Fix:** Changed the JOIN to use `eq(socialAccounts.id, scheduledPosts.socialAccountId)` — a direct FK reference instead of a loose platform match.

**Rule:** When writing JOINs involving tables with one-to-many relationships (like socialAccounts per platform), always join on a specific FK, never on a categorical field like platform slug. A slug-based join will fan out rows as soon as multiple accounts exist.

## 22. Check overflow when restructuring container layout

**Problem:** Restructured AICommandBar into a card layout with `overflow-hidden` for the Knight Rider animation. This clipped the PromptBadge dropdown which opens `bottom-full` (upward, outside the container).

**Fix:** Changed `overflow-hidden` to `overflow-x-clip` so the Knight Rider pseudo-elements are clipped horizontally but the dropdown can overflow vertically.

**Rule:** When adding `overflow-hidden` to any container, check if child components have absolute-positioned elements (dropdowns, tooltips, popovers) that need to escape the container. Use `overflow-x-clip` or `overflow-y-clip` for directional clipping when needed. Always test interactive elements after layout restructuring.

## 23. Impact analysis before every change — mandatory regression checklist

**Problem:** Multiple bugs shipped in one session because changes were made without asking "what existing features will this affect?" The calendar JOIN fan-out, the overflow clipping the PromptBadge dropdown, and deploying without verifying affected features.

**Fix:** N/A — process failure, not code failure.

**Rule:** Before pushing ANY change, answer these questions:

1. **What existing features live in or depend on the files I changed?** List them.
2. **For each affected feature, does it still work?** Verify — don't assume.
3. **Did I change a container/wrapper/layout?** Check all children: dropdowns, modals, tooltips, popovers, absolute-positioned elements.
4. **Did I change a data query or schema?** Check all consumers of that data: calendar, lists, dashboards, exports.
5. **Add every affected feature to the regression checklist** and verify before marking done.

This is not optional polish — it is the difference between a product and a demo.

## 24. Use React portals for dropdowns inside styled containers

**Problem:** PromptBadge dropdown was invisible for hours because it was rendered inside a container with `overflow-hidden`/`overflow-x-clip`. CSS spec: setting overflow on one axis forces the other to compute as `auto`, clipping both directions. Multiple attempts to fix with `overflow-x-clip`, `z-index`, and position changes all failed because the fundamental problem was the dropdown being a child of a clipped container.

**Fix:** Used `createPortal(dropdown, document.body)` to render the dropdown at document root, positioned with `getBoundingClientRect()` relative to the button. Also moved prompts data to single `usePrompts()` instance in parent, passed as props — eliminated stale state from multiple independent hook instances.

**Rule:** Any dropdown, tooltip, popover, or modal that needs to escape its parent container MUST use a React portal. Never rely on z-index or overflow tweaks — they are fragile and browser-dependent. When debugging "invisible but data exists" UI issues, check the DOM inspector first to see if the element exists but is clipped, before assuming a data/state problem.

## 25. Enumerate detailed test plan BEFORE writing any feature code

**Problem:** Features were implemented without upfront test planning, leading to ad-hoc testing that missed components, edge cases, and interaction scenarios. Bugs slipped through because there was no systematic checklist to verify against.

**Fix:** Established as a mandatory ways-of-working standard: every new feature must have a fully enumerated test plan with detailed test cases created during the planning phase, before any implementation begins.

**Rule:** MANDATORY for every new feature:

1. During planning (plan mode or review), enumerate ALL test cases in a structured table
2. Break tests into categories: **Unit**, **Integration**, **E2E**, **Edge Cases**
3. Each test case must specify: ID, description, setup/input, expected result, priority (P1/P2)
4. Cover all paths: happy path, error path, empty/null/boundary inputs, interaction edge cases (double-click, navigate-away, rapid switching, concurrent actions)
5. Write the test plan to a file: `tasks/test-plan-{feature}.md`
6. During implementation, write tests alongside code and check off against the plan
7. No feature is marked complete until every P1 test case passes
8. The test plan is a deliverable — not an afterthought
