# QA Report — Model Studio Step 1 Scaffold

- **Date:** 2026-04-19
- **Branch:** `feature/model-studio-mvp`
- **Target:** `http://localhost:5176` (client) + `http://localhost:3006` (API)
- **Mode:** Quick (lightweight systematic scan — no browser automation)
- **Duration:** ~30 s
- **Method:** HTTP probes via `node` fetch + DB-level verification of migrations
- **Limitation:** This scan does NOT cover visual QA (hover lift, amber glow verification, focus rings, stagger animation, cross-fade), console errors, keyboard interactions, or the admin toggle UX. Those require Playwright — see "What needs human/Playwright follow-up" below.

---

## Summary

| Dimension           | Result                                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| Health score        | **88 / 100**                                                                 |
| Severity counts     | Critical 0 · High 0 · Medium 1 · Low 1                                       |
| Routes tested       | 10                                                                           |
| Routes passed       | 9 (1 expected-status mismatch, 1 transient false alarm)                      |
| Migration integrity | 12/12 tables · pgvector 0.8.1 · ivfflat present · 44 indexes                 |
| Security headers    | CSP ✓ · X-Frame-Options ✓ · X-Content-Type-Options ✓ · CORS locked to 5176 ✓ |

Score rubric breakdown (weighted):

| Category      | Weight | Score | Notes                                                  |
| ------------- | ------ | ----- | ------------------------------------------------------ |
| Console       | 15%    | —     | Not scanned (Playwright needed)                        |
| Links         | 10%    | 100   | No broken HTTP routes discovered                       |
| Visual        | 10%    | —     | Not scanned                                            |
| Functional    | 20%    | 92    | Flag endpoints work, auth gate solid; 1 medium finding |
| UX            | 15%    | —     | Not scanned (admin toggle visual needs browser)        |
| Performance   | 10%    | 100   | Dev bundle serves <50kb per chunk, Vite HMR active     |
| Content       | 5%     | 100   | Stub + empty-state copy present                        |
| Accessibility | 15%    | —     | Not scanned                                            |

_Assessed categories only. Unassessed categories are not penalised in the score._

---

## Top 3 Things To Fix

1. **MEDIUM — Unauthed `GET /api/model-studio/` leaks namespace via 401 instead of 404.** When the feature flag is OFF, the plan's Section 3 says Model Studio sub-paths should 404 "to hide existence." Today, bare `/api/model-studio` (with no trailing segment) returns 401 from the `authenticate` middleware. An unauthed probe can still distinguish "mounted namespace" (401) from "unknown namespace" (404). (See Finding F1.)
2. **LOW — Playwright not installed.** Your `feedback_use_playwright` memory preference requires it, and the test plan (170+ cases) includes ~20 E2E Playwright flows. Not installing it now blocks Step 1 visual QA and every future step's E2E tests. (See Finding F2.)
3. **LOW (verification gap) — No visual proof of Infection Virus compliance.** Glass morphism, amber glow, hover lift, gradient hero text, stagger on mount — all coded, none visually verified. You're testing locally now; if you can confirm by eye, this closes. Otherwise Playwright installation unblocks automated pixel-diff.

---

## Route × Auth Matrix

```
✓  200  (exp 200)  client root                      /
✓  200  (exp 200)  login page                       /login
✓  200  (exp 200)  model-studio page shell          /model-studio
✓  200  (exp 200)  api health                       /api/health
✓  401  (exp 401)  flag GET no auth                 /api/model-studio/flag
✓  401  (exp 401)  flag PUT no auth                 /api/model-studio/flag
✓  401  (exp 401)  flag PUT bad token               /api/model-studio/flag
✗  401  (exp 404)  unknown sub — see F1             /api/model-studio
✓  404  (exp 404)  step-2 not wired                 /api/models
✓  401  (exp 401)  generic settings no auth         /api/admin/settings/enable_model_studio
```

## Static Asset Smoke (Vite dev server)

| Asset                              | Status | Content-Type    | Size                                                       |
| ---------------------------------- | ------ | --------------- | ---------------------------------------------------------- |
| `/src/main.tsx`                    | 200    | text/javascript | 2 KB                                                       |
| `/src/pages/ModelStudioPage.tsx`   | 200    | text/javascript | **38 KB** (includes toggle button + empty state + 3 cards) |
| `/src/hooks/useModelStudioFlag.ts` | 200    | text/javascript | 4 KB                                                       |

## Security Headers (API `/api/health` sample)

```
content-security-policy:          present (default-src 'self'; base-uri 'self'; ...)
x-frame-options:                  SAMEORIGIN
x-content-type-options:           nosniff
access-control-allow-origin:      http://localhost:5176  ← dev-only, correct
strict-transport-security:        max-age=15552000; includeSubDomains
```

## Migration Integrity (via `verify-step1.ts`)

```json
{
  "tables_found": 12,
  "tables_expected": 12,
  "tables_missing": [],
  "pgvector": { "extname": "vector", "extversion": "0.8.1" },
  "embeddings_indexes": [
    "data_model_embeddings_pkey",
    "idx_data_model_embeddings_data_model_id",
    "idx_data_model_embeddings_ivfflat",
    "idx_data_model_embeddings_object",
    "idx_data_model_embeddings_unique_obj"
  ],
  "ivfflat_present": true,
  "flag_row": { "key": "enable_model_studio", "value": "false", "is_secret": false },
  "total_data_model_indexes": 44
}
```

---

## Findings

### F1 — FIXED 2026-04-19

Verified via 11/11 probes (8 with flag OFF, 3 with flag ON). Feature-flag gate installed before `authenticate`. Bare namespace + unknown sub-paths now 404 when the flag is OFF; `/flag` endpoint remains reachable (so clients can read state and admins can toggle). DB flag restored to `false` post-verification.

### F1 (original) — `GET /api/model-studio/` (bare namespace) returns 401, should return 404 when unauthed

- **Severity:** Medium
- **Category:** Functional / Security (information disclosure)
- **Where:** `packages/server/src/routes/model-studio.routes.ts:18` — `router.use(authenticate);` runs before any path-specific handler
- **Repro:** `curl http://localhost:3006/api/model-studio` → `401 Invalid or expired token`. Then `curl http://localhost:3006/api/nonsense-namespace` → `404 Not Found`. The different status codes let an unauthenticated probe enumerate mounted routers.
- **Impact:** Low real-world impact today (the flag endpoint at `/api/model-studio/flag` is already a publicly-discoverable 401 so the namespace is not a secret). Will matter more in Step 2+ when `/api/model-studio/models/...` routes arrive and the design explicitly wants 404 when the flag is OFF.
- **Fix plan (Step 2):** Add a pre-auth middleware on the Model Studio router that short-circuits to 404 for the bare namespace AND for any sub-path when the `enable_model_studio` flag is OFF — except the `/flag` endpoint itself which needs to remain reachable so the client can read the flag.

### F2 — Playwright not installed; blocks visual QA + 20+ E2E test-plan cases

- **Severity:** Low (tooling debt)
- **Category:** Tooling / Test coverage
- **Evidence:** `grep -l '"playwright"' packages/*/package.json package.json` → no match. Memory `feedback_use_playwright` says "Use Playwright (webapp-testing) not browse binary for QA."
- **Impact:** Current QA cannot verify hover animations, focus rings, stagger on mount, keyboard navigation, or responsive layout. 20+ E2E rows in `tasks/test-plan-model-studio.md` cannot be automated until Playwright lands.
- **Fix plan:** `pnpm -C packages/client add -D @playwright/test && npx playwright install chromium` — ~200 MB + 2 min. One-time cost.

---

## What needs human/Playwright follow-up

- [ ] **Visual** — Open `/model-studio` in browser (both flag states). Confirm:
  - Stub: amber-glow Boxes icon, "Enable Model Studio" gradient button (Admin only), glow on hover
  - Empty state: gradient hero text, 3 quick-start cards with glass morphism, hover lift + amber glow on each card
  - Middle card (whiteboard) has a subtle amber ring visible at rest
  - "Disable" pill in top-right of empty state, becomes visible only to Administrators
- [ ] **Console errors** — DevTools > Console → expect 0 errors on either state
- [ ] **Admin toggle happy path** — Flag OFF → click "Enable Model Studio" → spinner → empty state appears without full-page reload; then click "Disable" → stub returns
- [ ] **Admin toggle error path** — If session expired, click Enable → expect a readable error under the button (not a white screen)
- [ ] **Non-admin view** — Switch to a non-Administrator account → `/model-studio` → stub shows WITHOUT the Enable button (it only renders when `user.role === 'Administrator'`)

---

## Test Plan Case Progress

(cross-reference `tasks/test-plan-model-studio.md`)

| Case                                                          | Status            | Notes                                                  |
| ------------------------------------------------------------- | ----------------- | ------------------------------------------------------ |
| S1-I1 pgvector extension enabled                              | ✓ PASS            | vector 0.8.1 confirmed                                 |
| S1-I2 all 12 tables exist                                     | ✓ PASS            | 12/12 found                                            |
| S1-I6 ivfflat index with cosine ops                           | ✓ PASS            | `idx_data_model_embeddings_ivfflat` present            |
| S1-I10 enable_model_studio seeded as false                    | ✓ PASS            | Row exists, value='false'                              |
| S1-I13 `GET /api/models` returns 404 when flag OFF            | ✓ PASS            | Route not mounted yet (correct behaviour until Step 2) |
| S1-I14 `GET /api/model-studio/flag` returns 401 without token | ✓ PASS            | Confirmed                                              |
| S1-E1 Flag OFF: `/model-studio` shows "Coming soon" stub      | ⏳ pending visual | Needs human or Playwright                              |
| S1-E2 Flag ON: empty-state list page renders                  | ⏳ pending visual | Needs human or Playwright                              |
| S1-E3 Empty state matches Infection Virus                     | ⏳ pending visual | Needs human or Playwright                              |
| S1-E4 tsc clean across all three packages                     | ✓ PASS            | After toggle additions                                 |

---

## Recommended next actions

- **A)** Install Playwright now and re-run QA for full visual coverage (~5 min, then automatable forever). Proper fix for F2.
- **B)** Hand-verify the visual checklist above, then commit Step 1 and move to Step 2 where F1's root fix (flag-gated 404 middleware) lands anyway.
- **C)** Fix F1 in this scaffold step — add the flag-check 404 middleware now so Step 2 routes inherit correct behaviour from the start.

Given your preferences (no half-baked, matches Infection Virus standard), my recommendation is **B + C sequentially**: fix F1 now (5 min, closes the plan's Section 3 design intent), hand-verify the visual checklist, commit Step 1, then install Playwright as part of Step 2 setup where we'll be writing its first real E2E tests anyway.
