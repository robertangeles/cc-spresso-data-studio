# Model Studio — Agent Alignment Briefing

> **Purpose:** Shared source of truth for every agent (Explore, Plan, general-purpose) working on the Model Studio feature. Before starting ANY task, read this file end-to-end. Non-negotiables are marked **MANDATORY**.

---

## 1. Nobel Laureate mindset (the posture we build from)

We build as if a Nobel Laureate in data science was shipping the tool they personally wished existed. That means:

- **First-principles rigor.** Every design choice has a stated reason. "Because it was there" is not a reason.
- **Label inference vs. fact.** Never guess and present it as truth. If you infer, write `[Inference]`. If the log says X, quote the log. (Mirrors repo's Debugging Protocol step 3.)
- **Elegance is economy.** The simplest design that explains the most. DRY is not stylistic — it is scientific parsimony. If two modules solve the same problem twice, one of them is wrong.
- **Synthesis across domains.** Data modelling is also: linguistics (naming), pedagogy (disclosure), UX (cognitive load), AI alignment (prompt injection). Every feature serves all four.
- **Curiosity about the user's world.** Experienced data architects have tacit knowledge we must surface, not override. The tool respects their expertise.

---

## 2. Obsession virus (what makes users fanatical)

This is not "polish." This is the product. Every single component must pass the "would a user want to touch this?" test, AND the deeper "would a user tell their peers about this moment?" test.

The fanatical moments we are building toward:

1. **"Wait — it just wrote the description for me from the structure alone."** (D5: auto-describe)
2. **"Wait — I pasted my query and it drafted the tables I need."** (D8: paste-SQL)
3. **"Wait — I took a photo of my whiteboard and it's already on the canvas."** (D10: whiteboard empty state)
4. **"Wait — it flagged my naming violation before I even saved."** (D6: naming lint)
5. **"Wait — I can Cmd+K to anything in this model."** (D2: command palette)

Every other interaction must feel at least coherent with those moments. No flat surfaces. No generic gray. No clinical empty states. No "good enough" — ever.

The **[Infection Virus Design Standard](../CLAUDE.md#mandatory-infection-virus-design-standard)** (CLAUDE.md) is not recommendation — it is spec:

- Glass morphism on every card/panel: `backdrop-blur`, `bg-surface-2/50`, `border-white/5`
- Amber glow on active/focused/selected: `shadow-[0_0_12px_rgba(255,214,10,0.15)]`
- Gradient buttons & accents: `bg-gradient-to-r from-accent to-amber-600`
- Hover lift on interactive cards: `hover:-translate-y-1 hover:shadow-dark-lg`
- Spring easing on transitions, stagger on mount, shimmer during loading
- Focus rings have amber glow, not default browser rings
- Empty states: hero icons with glow, gradient text, quick-start cards — never "No items. Create one." prose

---

## 3. Debugging Protocol (MANDATORY)

Verbatim from CLAUDE.md:

1. Read the error output exactly as written. Do not interpret.
2. Identify the exact file, line, and function where the error originates.
3. State only what the error message confirms. Label anything else `[Inference]`.
4. Do not suggest a fix until root cause is confirmed by evidence in the code or logs.
5. If root cause cannot be determined, state: "I need more information." Then list exactly what information is needed.
6. Never guess. Never patch. Never suggest multiple fixes hoping one works.
7. One confirmed problem. One evidence-based fix. One test to verify.

### Required investigation format

```
- Confirmed: [what the error proves]
- Evidence: [exact file, line, log output]
- Root cause: [only if confirmed by evidence]
- Fix: [only after root cause is confirmed]
- Verify with: [exact command or test]
```

---

## 4. Testing Standards (MANDATORY — per CLAUDE.md section 7 + lessons 7, 25)

### Order of operations (never inverted)

1. **Test plan first** (lesson 25). Every feature has `tasks/test-plan-{feature}.md` with enumerated cases BEFORE code.
2. **Backend before frontend** (lesson 7). Every new/updated API route gets curl-verified before the frontend touches it:
   - 200 happy path with correct response shape
   - 401 without token
   - 403 for wrong org / wrong user
   - 404 for invalid ID
   - 400/422 for invalid body
3. **Tests alongside code.** Service → unit test. Route → integration test. User-facing feature → E2E test.
4. **Full regression before marking done** (CLAUDE.md §7):
   - `pnpm test`
   - `pnpm test:integration`
   - `pnpm tsc`
   - `drizzle-kit push` (from `packages/server/`) if schema changed
   - Smoke-test every affected route
   - List results in task summary

### Unhappy path is mandatory

For every test case: happy + invalid input + missing auth + rate limit + edge case (nil, empty, boundary, duplicate, concurrent). "It works when I click it" is not a test.

---

## 5. Stack conventions (taste calibration summary)

From the CEO-review audit:

| Concern          | Convention                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Primary keys     | `uuid('id').defaultRandom().primaryKey()`                                                                                         |
| Foreign keys     | `.references(() => table.id, { onDelete: 'cascade' })`                                                                            |
| Timestamps       | `timestamp('...', { withTimezone: true }).notNull().defaultNow()`                                                                 |
| JSONB            | `jsonb('metadata').notNull().default('{}')` or `'[]'` — used for metadata + tags (not TEXT[])                                     |
| Enum-like        | `varchar('layer', { length: 20 }).notNull()` + check constraint (no `pgEnum`)                                                     |
| Naming           | `snake_case` tables (plural), `snake_case` columns (CLAUDE.md §Database Design)                                                   |
| Indexes          | Every FK gets one; comment above every index explaining the query it serves                                                       |
| Errors           | `AppError` subclasses from `packages/server/src/utils/errors.ts`; services throw, controllers `next(err)`, global handler formats |
| Routes           | Express router, `router.use(authenticate)` at router level                                                                        |
| Validation       | Introduce `zod-validate` middleware for Model Studio (cleanly, first consumer)                                                    |
| Client routing   | React Router v6 + `<ProtectedRoute>`                                                                                              |
| Client state     | Custom hooks (`useModel`, `useModelChat`, etc.) — **NOT Zustand**                                                                 |
| Client styling   | Tailwind + CSS variables; glass morphism + amber per Infection Virus                                                              |
| AI prompts       | DB-backed via `system_prompts` table — **NEVER hardcoded** (memory: `feedback_no_hardcoded_prompts`)                              |
| Default AI model | `claude-sonnet-4-6` (NOT `claude-sonnet-4-20250514` — that's stale in the MVP plan)                                               |
| Chat storage     | Match existing `conversations`/`messages` pattern — persist, don't drop                                                           |
| Ports            | Frontend Vite `5176`, Backend Express `3006` — **DO NOT CHANGE**                                                                  |

### Already-existing error subclasses — REUSE, don't duplicate

- `AppError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError`, `ConflictError`, `TooManyRequestsError` (has `retryAfter`)
- `CaptchaError`, `TokenExpiredError`, `EmailConfigError`, `SessionQuotaExceededError`, `InsufficientCreditsError`, `StripeConfigError` (domain-specific — leave alone)

### New subclasses to add (9, not 12)

- `ProviderTimeoutError` — Voyage/Anthropic timeout
- `ProviderUnavailableError` — 5xx from providers
- `NetworkError` — DNS/connection
- `ProviderResponseError` — malformed provider response
- `AIRefusalError` — Claude returned a refusal; assistant message still shown
- `InvalidAIResponseError` — unparseable structured response
- `ContextTooLargeError` — token limit hit
- `DBError` — generic DB write failure (for audit log writes that must not fail the request)
- `InternalError` — unexpected server error with `supportCode` (short random string)

---

## 6. Locked architecture (from approved plan)

### Premise: IN this monorepo

- Do NOT create a new repo.
- Do NOT add Next.js, FastAPI, SQLAlchemy, Supabase, Fly.io, or Vercel.
- Do use existing: Express, Drizzle, Vite, React Flow (v12), Anthropic SDK (via provider registry), voyage-3 via Node SDK.

### Decisions that are final

| Decision                   | Locked choice                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Canvas lib                 | React Flow v12                                                                             |
| State                      | Custom hooks, NOT Zustand                                                                  |
| AI context strategy        | RAG-first (top-5 chunks + compact summary ~4k tokens) + opt-in "Deep analyze" button       |
| Embedding trigger          | Debounced 3s + batched via `embedding_jobs` table; dedupe on `(object_id, content_digest)` |
| Org scoping                | `org_id` + `owner_id` on `models` from day one                                             |
| Feature flag               | `enable_model_studio` in site_settings; default OFF                                        |
| Rollout                    | Render auto-deploy; flag gate rollback < 1 min                                             |
| Tags column convention     | `jsonb('tags').notNull().default('[]')` — NOT `text[]`                                     |
| Synthetic data terminology | "synthetic data" — NOT "fake data"                                                         |

### 10 delights — ALL in MVP

D1 Explain-model button | D2 Cmd+K palette | D3 Layer crossfade | D4 Live DDL pane | D5 Auto-describe | D6 Naming lint | D7 Minimap | D8 Paste-SQL | D9 Synthetic data preview | D10 Whiteboard screenshot empty state

Each has a landing step in the build order (see plan file). Infection Virus applies to each.

---

## 7. Build order (revised 11 steps)

```
Step 1   Scaffold (flag gate, zod-validate middleware, error subclasses, Drizzle migration for 12 tables, pgvector extension)
Step 2   Model CRUD + list page + canAccessModel(userId, modelId, role) authz helper
Step 3   Canvas foundation (React Flow v12) + minimap (D7) + canvas_states persistence
Step 4   Entity CRUD + detail panel + auto-describe (D5) + naming-lint groundwork (D6)
Step 5   Attribute CRUD + synthetic data drawer (D9) + naming lint applied to attributes
Step 6   Relationships + IE + IDEF1X notation rendering + notation switcher
Step 7   Layer switching + crossfade animation (D3) + layer_links CRUD + linked-objects nav panel
Step 8   Semantic layer bridge + CSV export (with CSV formula-injection guard)
Step 9   DDL export (Snowflake + SQL Server + Postgres) + live DDL pane (D4) + parser round-trip validation
Step 10  AI chat (SSE streaming) + RAG (pgvector + voyage-3 + embedding_jobs worker) + "Explain model" (D1) + "Paste query" (D8)
Step 11  Polish: Cmd+K command palette (D2), whiteboard empty state (D10), onboarding, keyboard shortcuts, responsive, error boundaries
```

Every step produces something testable. Every step updates `tasks/test-plan-model-studio.md` with its test cases checked off as they pass.

---

## 8. Critical lessons that apply (from tasks/lessons.md)

- **L2:** `.env` path from `packages/server/src/config/` is `../../../../.env` (4 levels up). Verify DB connects to remote, not localhost, at startup.
- **L3:** Before asking for a restart — `npx kill-port 3006; npx kill-port 5176` (NOT 3001/5173).
- **L5:** Changed a config default? Check `.env` and `.env.example` for overrides.
- **L6:** All React hooks before any conditional return. When adding state to a gated page, place hooks above the guard.
- **L7:** Test routes via curl BEFORE frontend. No exceptions.
- **L8:** Delete test data after testing. Use `test*@test.com` pattern for easy cleanup.
- **L11:** `rm -f packages/shared/tsconfig.tsbuildinfo` before local builds if tsc acts weird.
- **L16:** Build order: `shared → server → client`. Always explicit.
- **L18:** Infection Virus is spec, not polish.
- **L19:** Progressive disclosure — show what's relevant at each step; add glow to next action.
- **L20:** Feature branch mandatory for non-trivial changes (Model Studio is _very_ non-trivial).
- **L21:** JOIN on FK (`eq(a.id, b.aId)`), never on a slug / categorical.
- **L22:** Adding `overflow-hidden` on a container? Check dropdowns / tooltips / popovers inside it. Use `overflow-x-clip` for directional clipping.
- **L23:** Impact analysis checklist BEFORE every change — list affected features, verify each still works.
- **L24:** Dropdowns/tooltips/popovers inside styled containers = `createPortal(..., document.body)`. Applies to Cmd+K palette (D2), entity context menus, attribute-edit popovers.
- **L25:** Test plan BEFORE code. `tasks/test-plan-model-studio.md` is a deliverable.

---

## 9. Impact-analysis checklist (run BEFORE every edit in Model Studio)

1. What existing features live in / depend on the files I changed? List them.
2. For each affected feature, does it still work? Verify — don't assume.
3. Did I change a container/wrapper/layout? Check children — dropdowns, modals, tooltips, popovers, absolute-positioned elements.
4. Did I change a query or schema? Check every consumer — calendar, lists, dashboards, exports.
5. Add every affected feature to the regression checklist and verify before marking done.

---

## 10. Verification ritual (MANDATORY before any step is "done")

```
1. pnpm -C packages/shared build
2. pnpm -C packages/server build
3. pnpm -C packages/client build  (or vite build for client)
4. pnpm tsc                        (whole monorepo clean)
5. pnpm test                       (unit)
6. pnpm test:integration           (API + DB)
7. drizzle-kit push                (from packages/server if schema changed)
8. Curl every new/touched route:
   - 200 happy (correct shape)
   - 401 no auth
   - 403 wrong org
   - 404 invalid id
   - 422 invalid body
9. E2E Playwright for user-facing flows
10. Visual check against Infection Virus standard
11. Update tasks/test-plan-model-studio.md — mark cases passed
12. Update tasks/lessons.md if anything surprising learned
13. Update relevant docs/ file if user-facing feature added/changed
14. Git status clean except intentional changes
```

---

## 11. When in doubt

Ask the user. Do NOT guess. Do NOT patch. Do NOT ship half-baked. Do NOT hardcode prompts or credentials. Do NOT deviate from this briefing without flagging the deviation explicitly.

Every agent reading this: if any instruction here conflicts with your narrower task prompt, this file wins unless the user has explicitly authorised the deviation in writing.

---

_Last updated: 2026-04-19 — post-CEO-review approval, pre-Step-1._
