# Spresso Data Studio — Task Tracking

## Model Studio — remaining build steps

Authoritative build order from `tasks/alignment-model-studio.md`. Each
step has detailed test cases pre-enumerated in
`tasks/test-plan-model-studio.md`. Reusable Step-4 infra is listed in
the project memory at `project_model_studio_state.md` — use it.

- [x] **Step 1** — Scaffold (flag gate, zod-validate middleware, error
      subclasses, Drizzle migration for 12 tables, pgvector extension).
- [x] **Step 2** — Model CRUD + list page + `canAccessModel(userId, modelId, role)` authz helper.
- [x] **Step 3** — Canvas foundation (React Flow v12) + minimap (D7) + canvas_states persistence.
- [x] **Step 4** — Entity CRUD + detail panel + auto-describe (D5) +
      naming-lint groundwork (D6). Shipped on `main` as `fd110b4` (2026-04-19).
- [x] **Step 4.5** — Origin-direction choice at model creation
      (greenfield vs existing-system). Shipped same merge.
- [x] **Step 5** — Attribute CRUD + synthetic data drawer (D9) +
      naming-lint applied to attributes. Backend merged via commit
      `1e6b3fb` (attribute service + controller + 7 routes +
      `model-studio-synthetic-data` prompt seed + 16 integration tests).
      `lintAttribute()` sibling to `lintIdentifier()` adds `*_id → uuid`
      warning, `VARCHAR` without length warning, `NUMERIC` scale >
      precision violation. Frontend merged separately: `useAttributes`
      hook, `AttributesPanel` with dnd-kit drag-reorder, PK/FK/NN/UQ
      pill toggles, `EntityNode` splits PKs above a divider + non-PKs
      below, `SyntheticDataDrawer` slides up from canvas bottom with
      "SYNTHETIC — NOT REAL" badge + formula-injection-safe copy-to-
      clipboard (`packages/client/src/lib/csvSafe.ts`). Ephemeral
      synthetic results (no row storage) with a `recordChange`
      audit breadcrumb. Attributes lazy-load per-entity on
      panel-open; a model-wide batch endpoint is a deferred
      follow-up (see new entry below).
- [ ] **Step 6** — Relationships + IE + IDEF1X notation rendering +
      notation switcher (currently inert in the canvas header).
- [ ] **Step 7** — Layer switching + crossfade animation (D3) +
      `layer_links` CRUD + linked-objects nav panel. **Use
      `originDirection` from Step 4.5 to set the default
      layer-traversal direction** (greenfield: down, existing_system: up).
- [ ] **Step 8** — Semantic layer bridge + CSV export (with
      formula-injection guard).
- [ ] **Step 9** — DDL export (Snowflake + SQL Server + Postgres) +
      live DDL pane (D4) + parser round-trip validation.
- [ ] **Step 10** — AI chat (SSE streaming) + RAG (pgvector + voyage-3 + `embedding_jobs` worker that drains the queue Step 4 already
      populates) + "Explain model" (D1) + "Paste query" (D8).
- [ ] **Step 11** — Polish: Cmd+K command palette (D2), whiteboard
      empty state (D10), onboarding, keyboard shortcuts, responsive,
      error boundaries.

## Open follow-ups (Step-4-era, address opportunistically)

- [ ] **Entity position drift on reload.** Node positions survive a
      reload but don't land exactly where the user dropped them. Likely
      a coord-system mismatch in
      [packages/client/src/components/model-studio/ModelStudioCanvas.tsx](packages/client/src/components/model-studio/ModelStudioCanvas.tsx)
      between `screenToFlowPosition` (used at create time) and the
      saved positions in `data_model_canvas_states.node_positions`,
      OR the React Flow viewport restoring AFTER nodes mount — so the
      node's position is interpreted relative to a different viewport
      on second render. Reproducible: drag a node, refresh, observe
      the offset.
- [ ] **Suite-mode flakiness on S4-E3 / S4-E4 / S4-E6 Playwright tests.**
      Pass in isolation, fail when run together. Diagnostics show the
      first page load is fine; later page loads sometimes never reach
      `ModelStudioDetailPage`'s useEffect. Coincides with a flaky
      500 from `/api/settings/site/public` (a Step-4-unrelated WIP
      route on `main`). See `tasks/lessons.md` #27 for the writeup.
      Currently marked `.fixme` in
      [packages/client/tests/e2e/model-studio-entities.spec.ts](packages/client/tests/e2e/model-studio-entities.spec.ts).
- [x] **Step 5 E2E tests** (S5-E1..E4). Shipped in
      [packages/client/tests/e2e/model-studio-attributes.spec.ts](packages/client/tests/e2e/model-studio-attributes.spec.ts).
      All four P1 cases green. Uses mouse-based drag for dnd-kit
      reorder; network-wait (`page.waitForResponse`) hoisted before
      `page.goto` to avoid the S4-era race. S5-E5 (P2 drawer
      controls) still outstanding — track as a follow-up if desired.
- [ ] **Model-wide attribute batch endpoint**
      (`GET /api/model-studio/models/:id/attributes`). Today the
      canvas loads attributes per-entity on panel-open, which means
      PK indicators appear on a node only after the user opens its
      panel. A single model-wide batch call on canvas mount would
      preload every node's attributes so PKs render immediately
      after refresh. Server service method + route + client hook
      change. Est. 30 min.
- [ ] **Convert remaining seed scripts to use `runOnce()`** for
      consistency. Today only `migrateModelIds` is guarded; the
      various `seed*` calls in `start()` (`seedRoles`, `seedAIProviders`,
      `seedChannels`, `seedDefaultPrompts`, etc.) are individually
      idempotent but follow the older pattern. Not urgent — they're
      explicit row-existence checks, not bulk UPDATEs.

## Phase 1 (legacy content-builder scaffold — pre-rebrand, kept for history)

- [x] Monorepo scaffold
- [ ] Shared package (types, validation, constants)
- [ ] Server skeleton (Express, config, logger)
- [ ] Database (Drizzle schema, migrations)
- [ ] Auth system (backend)
- [ ] Flow CRUD (backend)
- [ ] Client scaffold + Auth UI
- [ ] Flow Builder UI skeleton

## Tech debt — data practices (Spresso eats its own dog food)

- [x] **Stop running `migrateModelIds()` on every server boot.** Fixed in
      Step 4 follow-up. Added `applied_migrations` table + `runOnce(name, fn)`
      helper at [packages/server/src/db/migration-runner.ts](packages/server/src/db/migration-runner.ts).
      Race-safe via `INSERT ... ON CONFLICT DO NOTHING RETURNING`; rolls
      back the marker if the migration body throws so failures retry on
      the next boot. `migrateModelIds()` call in
      [packages/server/src/services/admin.service.ts](packages/server/src/services/admin.service.ts)
      now wrapped in `runOnce('migrate-model-id-prefixes', ...)`.
      Tested via 4 integration cases (first-run, skip-on-replay,
      throw-rolls-back-marker, race-safe concurrent claims).
