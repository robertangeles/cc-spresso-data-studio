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
- [ ] **Step 5** — Attribute CRUD + synthetic data drawer (D9) +
      naming-lint applied to attributes. Wire `enqueueEmbedding()` for
      attributes. Extend `lintIdentifier()` with attribute-specific
      rules (data-type aware, e.g. `*_id` → suggest `uuid`).
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

- [ ] **Entity position drifts on reload** (Step 4 follow-up). Node positions
      survive a reload but don't land exactly where the user dropped them.
      Likely a coord-system mismatch in [packages/client/src/components/model-studio/ModelStudioCanvas.tsx](packages/client/src/components/model-studio/ModelStudioCanvas.tsx)
      between `screenToFlowPosition` (used at create time) and the
      saved positions in `data_model_canvas_states.node_positions`,
      OR the React Flow viewport restoring after the nodes mount —
      so the node's position is interpreted relative to a different
      viewport on second render. Reproducible: drag a node, refresh,
      observe the offset.
