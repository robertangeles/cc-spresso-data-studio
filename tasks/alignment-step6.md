# Step 6 Build Brief — Relationships + IE/IDEF1X Notation

> **Every agent working on Step 6 MUST read this file before writing code.**
> This is the single source of truth for Step 6. It encodes every CEO-review
> decision. If an instruction here conflicts with a narrower prompt, this file
> wins unless the user has explicitly authorised the deviation in writing.

**Branch:** `feature/model-studio-step6-relationships` (branched from `main`
@ `c14b2a0`, 2026-04-20).

**Scope mode:** **EXPANSION** (cathedral). Locked by CEO review.

**Feature flag:** `MODEL_STUDIO_RELATIONSHIPS_ENABLED` (env var, default
`false`; gate all routes + client entry points).

**Ports:** 3006 (server) / 5176 (client). Default AI model
`anthropic/claude-sonnet-4-6`. AI prompts DB-backed via `system_prompts`
(N/A for Step 6 — no LLM calls).

---

## 1. What ships with Step 6 (decision ledger)

### Core (pre-enumerated in alignment-model-studio.md)

- 5 routes: `POST/GET/PATCH/DELETE /api/model-studio/models/:id/relationships`
  (+ `/:relId` for item ops) + `POST /api/model-studio/models/:id/relationships/infer`.
- IE + IDEF1X SVG renderers covering all 5 cardinalities × 2 identifying flags.
- `NotationSwitcher` mounted in canvas header.
- Server enforcement: cross-layer, cross-model, cycle-safe.

### EXPANSION deltas (all locked)

| ID  | Decision                                                                                    |
| --- | ------------------------------------------------------------------------------------------- |
| 1A  | `notation` persisted per-user on `data_model_canvas_states` (NOT on `data_models`).         |
| 2A  | `isIdentifying=true` performs **full Erwin PK propagation** in the same transaction.        |
| 3A  | **Self-referential** rels allowed. Arc-loop render.                                         |
| 4A  | FK ↔ Rel **bidirectional non-blocking toasts** with ⌘↵ confirm. Never auto-write.           |
| 5A  | `POST /rels/infer` is **sync with 30 s cap**; >2000 attrs → 202 + `jobId` (embedding_jobs). |
| 6A  | `version INT NOT NULL DEFAULT 1` on `data_model_relationships`. 409 on PATCH conflict.      |
| 7B  | `BroadcastChannel` sync — **generalised to all `canvas_states` fields**, not just notation. |
| 8A  | Visual regression: **Vitest JSDOM snapshot** of SVG markup (~20 cases).                     |
| 9A  | **Admin diagnostics endpoint** detects orphan propagated attrs. Ships now.                  |

### Delights (all 6 ship with Step 6)

- **D-R1** Edge shimmer on creation (amber pulse, 1.5 s fade).
- **D-R2** Hover/focus edge pulses both endpoint entity borders.
- **D-R3** Right-click edge context menu (rename / flip / toggle identifying /
  copy cardinality / delete) — `createPortal(document.body)` per L24.
- **D-R4** Notation flip preserves React Flow viewport (zoom/pan).
- **D-R5** Orphan-entity amber-dot badge on entities with 0 rels. Canvas
  toggle to hide.
- **D-R6** "Tidy" button — `dagre` auto-layout, rel-aware edge routing.

### Also shipping (emergent from review)

- **Mermaid export**: `GET /api/admin/model-studio/models/:id/relationships/explain`
  returns Mermaid ER diagram text.

### NOT shipping in Step 6 (recorded in TODOS / alignment doc)

- Chen / UML / Barker notations (phase 2).
- React Flow viewport culling / edge virtualisation for >3k rels (Step 11).
- Shared `<PropertyPanelShell>` extraction from EntityEditor + RelationshipPanel
  (Step 7 will be the 3rd instance — extract then).
- Version columns on entities/attributes (only `data_model_relationships`
  gets one now).
- Real-time multi-user SSE for edge updates (phase 3; MVP polls).

---

## 2. Test plan (37 cases, appended in `tasks/test-plan-model-studio.md`)

### Shared unit (11)

| ID     | Assertion                                                                  |
| ------ | -------------------------------------------------------------------------- |
| S6-U1  | IE renderer: one-to-many → bar + crow's foot                               |
| S6-U2  | IE renderer: zero-or-one → open circle + bar                               |
| S6-U3  | IDEF1X renderer: one-to-many → bar + filled circle                         |
| S6-U4  | Identifying rel → solid line                                               |
| S6-U5  | Non-identifying rel → dashed line                                          |
| S6-U8  | `normalizeRelationship` trims name, rejects invalid enum                   |
| S6-U9  | `inferCardinalityFromFlags`: FK+UQ+NN → `one`; FK nullable → `zero_or_one` |
| S6-U10 | `lintRelationshipName` → `'CustomerOrders'` emits camelCase warning        |
| S6-U11 | `lintRelationshipName` on null/empty → silent (name optional)              |
| S6-U18 | IE SVG snapshot (5 cards × 2 identifying = 10)                             |
| S6-U19 | IDEF1X SVG snapshot (5 cards × 2 identifying = 10)                         |

### Server unit (6)

| ID     | Assertion                                                                         |
| ------ | --------------------------------------------------------------------------------- |
| S6-U6  | Relationship service rejects cross-layer                                          |
| S6-U7  | Rejects cross-model                                                               |
| S6-U12 | `propagateIdentifyingPKs`: 0 PKs on source → `InvariantError`                     |
| S6-U13 | `propagateIdentifyingPKs`: target name collision → throws, TX rollback            |
| S6-U14 | `propagateIdentifyingPKs`: composite PKs propagate with correct order + types     |
| S6-U15 | `unwindIdentifyingPKs`: removes only propagated attrs, preserves user-added       |
| S6-U16 | `detectCycleIdentifying`: A→B→C→A rejects; A→B→C passes                           |
| S6-U17 | `inferRelationshipsFromFkGraph`: 10 FK attrs → 10 proposals; dangling → skip+warn |

### Server integration (12)

| ID     | Route                                | Case                             |
| ------ | ------------------------------------ | -------------------------------- |
| S6-I1  | `POST /rels`                         | Happy → 201                      |
| S6-I2  | `DELETE /rels/:id`                   | Happy → 200                      |
| S6-I3  | `PATCH /rels/:id` with stale version | 409                              |
| S6-I4  | `PATCH` isIdentifying false→true     | Composite PKs propagated + audit |
| S6-I5  | `DELETE` identifying rel             | Propagated PKs removed + audit   |
| S6-I6  | `POST` cross-model forged body       | 422                              |
| S6-I7  | `POST` self-ref                      | 201 (3A)                         |
| S6-I8  | `GET /rels` IDOR attempt             | Only returns user's model rels   |
| S6-I9  | `POST /infer` on zero-FK model       | 200 + empty proposals            |
| S6-I10 | `POST /infer` on >2000-attr model    | 202 + jobId (5A)                 |
| S6-I11 | `POST` metadata >4KB                 | 422                              |
| S6-I12 | Changelog write failure (mock)       | Whole TX rolls back              |

### Client unit (6)

| ID     | Assertion                                                                  |
| ------ | -------------------------------------------------------------------------- |
| S6-U20 | Self-ref arc geometry test (source===target → arc path)                    |
| S6-U21 | `useNotation` hook BroadcastChannel sync across simulated tabs             |
| S6-U22 | `auditFormatter` renders rel create/update/delete/propagate/unwind phrases |
| S6-U23 | `CascadeDeleteDialog` displays correct rel count + list                    |
| S6-U24 | `useRelationships` optimistic create rolls back on server error            |
| S6-U25 | `InferRelationshipsPanel` accept-one / accept-all / reject flows           |

### E2E (10)

| ID     | Flow                                                                       |
| ------ | -------------------------------------------------------------------------- |
| S6-E1  | Drag handle A→B → edge appears                                             |
| S6-E2  | Flip IE→IDEF1X → all edges re-render (no data loss)                        |
| S6-E3  | Drag to empty canvas → cancels                                             |
| S6-E4  | Duplicate drag → opens existing rel panel                                  |
| S6-E5  | Drag in IE → flip IDEF1X → flip IE → original render restored              |
| S6-E6  | Delete entity with 3 rels → CascadeDeleteDialog → confirm → rels gone      |
| S6-E7  | Toggle isIdentifying true→false → confirm modal → propagated attrs removed |
| S6-E8  | Infer button → panel → accept 3 proposals → 3 rels created                 |
| S6-E9  | Two-tab notation sync via BroadcastChannel (7B)                            |
| S6-E10 | `⌘R` keyboard-draw flow (select source → ⌘R → select target → ↵)           |

### Test infrastructure mandates

- **Playwright:** `page.waitForResponse(/\/relationships/)` hoisted BEFORE
  `page.goto` (learnt in Step 5; avoids the S4-era mount/data-fetch race).
- **Visual snapshots:** Vitest JSDOM `expect(container).toMatchSnapshot()` on
  SVG markup. No Playwright PNG snapshots.
- **Integration tests:** use the same Drizzle real-DB test harness as Step 5
  (`setupServerTestDb` or whatever Step-5 used).
- **Test data hygiene:** per CLAUDE.md L8, use `test*@test.com` seeded models
  and clean up in `afterEach`.

---

## 3. Schema changes (migrations)

Both migrations MUST be wrapped in `runOnce(name, fn)` from
`packages/server/src/db/migration-runner.ts`.

### Migration A — `add-canvas-states-notation`

```sql
-- notation values MUST match packages/shared/src/utils/model-studio.schemas.ts
-- NOTATION enum (lowercase: 'ie', 'idef1x').
ALTER TABLE data_model_canvas_states
  ADD COLUMN notation VARCHAR(10) NOT NULL DEFAULT 'ie'
    CHECK (notation IN ('ie','idef1x'));
```

### Migration B — `add-rels-version-and-unique`

```sql
ALTER TABLE data_model_relationships
  ADD COLUMN version INT NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX idx_data_model_rels_unique_triple
  ON data_model_relationships (
    data_model_id,
    source_entity_id,
    target_entity_id,
    COALESCE(name, '')
  );

-- Partial index for cycle detection
CREATE INDEX idx_data_model_rels_identifying
  ON data_model_relationships (source_entity_id, target_entity_id)
  WHERE is_identifying = true;
```

Drizzle `schema.ts` updated in lockstep (schema-first; migration-runner is
the canonical runtime applier).

---

## 4. File inventory (net-new + extensions)

### `packages/shared/src/utils/` (EXTEND existing files — no new subdirs)

- `model-studio.schemas.ts` **EXT** — existing file already exports
  `CARDINALITY` (lowercase: `'one' | 'many' | 'zero_or_one' |
'zero_or_many' | 'one_or_many'`), `NOTATION` (`'ie' | 'idef1x'` —
  **lowercase**), `LAYER`. ADD at end of file: `relationshipSchema`,
  `createRelationshipSchema`, `updateRelationshipSchema`,
  `relationshipMetadataSchema` (with 4 KB refine + reserved-key block).
  All new schemas reuse existing enums — do NOT redefine.
- `cardinality-inference.ts` **NEW** — pure
  `inferCardinalityFromFlags({ isFk, isUq, isNn, targetIsPk })`.
  Returns `{ source, target, confidence }`. Lives in shared so client
  can preview before POST.
- `naming-lint.ts` **EXT** — existing file exports `lintIdentifier` +
  `lintAttribute`. ADD `lintRelationshipName(name, layer)` as a sibling
  export. Advisory rules: `has_*` / `belongs_to_*` suggestion, camelCase
  warning on physical, empty/null → silent (name optional).

### `packages/server/src/services/` (pattern mirrors Step 5)

- `model-studio-relationship-flags.ts` **NEW** — pure
  `normalizeRelationship(input)`. Lives in server to mirror the
  `model-studio-attribute-flags.ts` layout (Step 5 precedent).
  Trims name, canonicalises enums, returns `{ normalized, warnings }`.

### `packages/server/src/db/`

- `schema.ts` **EXT** — add `notation` to canvas_states table; add `version`
  to relationships table. Add partial index definition.
- `migrations/` **NEW** — migration functions wrapped in `runOnce`.

### `packages/server/src/services/`

- `model-studio-relationship.service.ts` **NEW** — CRUD + cross-layer +
  cross-model + self-ref + cycle checks + version increment.
- `model-studio-relationship-propagate.service.ts` **NEW** — pure TX logic:
  `propagateIdentifyingPKs(tx, rel)`, `unwindIdentifyingPKs(tx, rel)`,
  `detectCycleIdentifying(tx, source, target)`. ALL throws propagate up —
  never swallowed.
- `model-studio-relationship-infer.service.ts` **NEW** — `inferRelationshipsFromFkGraph(modelId)`
  walks FK graph; sync for ≤2000 attrs; returns `{ proposals, jobId? }`
  shape matching 5A.
- `model-studio-relationship-diagnostics.service.ts` **NEW** — lists orphan
  propagated attrs. Used by admin endpoint (9A).
- `model-studio-entity.service.ts` **EXT** — `deleteEntity` return shape
  includes `{ impactedRelationshipIds: string[], impactedCount: number }`
  BEFORE the delete fires (so UI can confirm).

### `packages/server/src/routes/`

- `model-studio.routes.ts` **EXT** — this repo keeps **all** model-studio
  routes in one file. Do NOT create a separate rel routes file. Append:
  - `POST /models/:id/relationships` — create
  - `GET /models/:id/relationships` — list (batch)
  - `GET /models/:id/relationships/:relId` — read one
  - `PATCH /models/:id/relationships/:relId` — update (with `version`)
  - `DELETE /models/:id/relationships/:relId` — delete (+ unwind if identifying)
  - `POST /models/:id/relationships/infer` — 5A sync/async
  - `GET /models/:id/entities/:entityId/impact` — cascade preview
  - `GET /admin/model-studio/models/:id/relationships/diagnostics` — 9A orphan detector (org-admin only)
  - `GET /admin/model-studio/models/:id/relationships/explain` — Mermaid ER export
    All gated on `MODEL_STUDIO_RELATIONSHIPS_ENABLED` (check via existing flag
    pattern in the file — if none, use `process.env.MODEL_STUDIO_RELATIONSHIPS_ENABLED === 'true'`).
    All use `assertCanAccessModel(userId, modelId, role)`.

### `packages/client/src/components/model-studio/`

- `RelationshipEdge.tsx` **NEW** — custom React Flow edge. Props:
  `{ sourceCardinality, targetCardinality, isIdentifying, notation, isSelfRef }`.
  Renders SVG symbols table-driven (D-R1 shimmer CSS on mount).
- `RelationshipPanel.tsx` **NEW** — compact 420 / expanded 960 / full-screen
  <1280. Tabs: General / Cardinality / Governance / Audit / Rules /
  Appearance. Governance + Appearance = `StubTab` placeholders until
  Step 8/11. Follows EntityEditor layout pattern.
- `NotationSwitcher.tsx` **NEW** — canvas header IE/IDEF1X toggle. Uses
  `useNotation` hook.
- `CascadeDeleteDialog.tsx` **NEW** — shows impacted rels list + count
  - re-query on confirm to catch races.
- `InferRelationshipsPanel.tsx` **NEW** — proposals list with accept / reject
  / accept-all; handles 202 + polling path for async infer.
- `EdgeContextMenu.tsx` **NEW** (D-R3) — `createPortal(document.body)`.
  Actions: rename / flip direction / toggle identifying / copy cardinality
  / delete.
- `OrphanBadge.tsx` **NEW** (D-R5) — amber dot on EntityNode when rel count = 0.
- `TidyButton.tsx` **NEW** (D-R6) — dagre auto-layout wrapper. Uses `@dagrejs/dagre`.
- `EntityNode.tsx` **EXT** — attribute-level drag handles on FK / PK rows.
  Keep existing 4 entity-level handles as fallback.
- `ModelStudioCanvas.tsx` **EXT** — real `edges` + `onConnect` + delete
  interceptor that opens `CascadeDeleteDialog` + mount `NotationSwitcher` +
  `TidyButton`.

### `packages/client/src/hooks/` (or wherever hooks live — mirror Step 5)

- `useRelationships.ts` **NEW** — `loadAll(modelId)`, `create(input)`,
  `update(id, input, version)`, `remove(id)`, `infer(modelId)`. Optimistic
  with reconcile-on-error.
- `useNotation.ts` **NEW** — reads/writes `canvas_states.notation`;
  BroadcastChannel sync generalised to ALL canvas_states fields per 7B.
- `useBroadcastCanvas.ts` **NEW** — single channel `model-studio:canvas:{modelId}`;
  publishes `{ field, value, clientId }`; subscribers dedupe own messages.

### `packages/client/src/lib/`

- `auditFormatter.ts` **EXT** — add rel phrases:
  - `created`: `"Linked {source.name} to {target.name} ({srcCard}:{tgtCard}{, identifying})"`
  - `updated`: per-field (`"Changed cardinality from many→one"`, `"Renamed to X"`, `"Marked as identifying"`, etc.)
  - `deleted`: `"Removed relationship {source.name}→{target.name}"`
  - `propagated`: `"Propagated 3 composite PK attributes: customer_id, region_id, tenant_id"`
  - `unwound`: `"Removed 3 propagated PK attributes"`
    Extend `FIELD_LABELS` with `sourceCardinality`, `targetCardinality`,
    `isIdentifying`, `layer`, `name`.

### `docs/model-studio/`

- `relationships.md` **NEW** — user-facing guide (IE vs IDEF1X, when to use
  identifying, how to draw/edit/delete, cascade behaviour) + ops runbook
  (rollback, diagnostics endpoint, feature flag).
- `feature-flags.md` **NEW or EXT** — list all Model Studio flags.

### `.env.example`

- Add `MODEL_STUDIO_RELATIONSHIPS_ENABLED=false`.

---

## 5. Error & rescue contract (mandatory)

- **NEVER `catch (e)` or `catch (e: any)` without narrowing.** Every catch
  block must name the specific exception class.
- **Audit write failures are tolerated** per existing codebase contract
  (`recordChange` in `model-studio-changelog.service.ts` explicitly does
  NOT rethrow — losing an audit row is ruled worse than losing a user
  mutation). The CEO-review premise "TX rolls back on audit failure"
  was based on a wrong assumption about the existing code — amended
  2026-04-20. TX-rollback-on-audit-failure is therefore out of scope
  for Step 6. What IS enforced: if `propagateIdentifyingPKs` fails
  mid-TX, the rel insert rolls back (S6-I12 asserts this).
- **DB timeouts** (`ConnectionTimeoutError`, `QueryTimeoutError`) → throw
  `ServiceUnavailableError` → 503 + `Retry-After: 2`.
- **Optimistic lock violation** (PATCH with stale version) → 409 with
  `{ code: 'VERSION_CONFLICT', serverVersion }`.
- **Client optimistic updates** must have a reconcile-on-error path that
  reverts + toasts. Never leave a zombie edge.
- **Cyclic identifying rels** → `CyclicIdentifyingError` with path in
  message: `"A→B→C→A"`.
- **Cascade deletes** are NEVER silent. Entity delete → `GET :id/impact` →
  dialog → confirm → DELETE.

---

## 6. Authorisation contract

- Every route calls `assertCanAccessModel(userId, modelId, role)` from
  `packages/server/src/services/model-studio-authz.service.ts` BEFORE
  loading data.
- `GET /rels` — reader+ role suffices.
- `POST /rels`, `PATCH /rels/:id`, `DELETE /rels/:id`, `POST /rels/infer` —
  editor+ role.
- Admin diagnostics (`/api/admin/model-studio/.../diagnostics`) — org admin only.

---

## 7. Security hard rules

- `name` sanitised server-side: trim, `.max(128)`, regex reject control chars.
- `metadata` JSONB: zod refine `JSON.stringify(m).length <= 4096`; reject
  `__proto__` / `constructor` / `prototype` keys.
- Rate limit `POST /rels/infer`: 10/min per user.
- CSV injection: right-click "copy cardinality" uses `escapeClipboardCell`
  from `packages/client/src/lib/csvSafe.ts`.
- No new secrets. No `console.log`. All logging via pino.

---

## 8. Observability contract

Every mutating service method emits a structured pino log at entry and exit:

```
INFO  relationship.create     modelId=... userId=... sourceId=... targetId=... identifying=true durationMs=12
WARN  relationship.cycleReject modelId=... source=... target=... path=A→B→C→A
ERROR relationship.txRollback  reason=uniqueViolation modelId=... conflictAttrName=customer_id
```

Metrics (even if backend is just counters in memory for MVP):

- `model_studio_rels_created_total{identifying}`
- `model_studio_rels_deleted_total`
- `model_studio_rels_version_conflicts_total`
- `model_studio_rels_tx_rollbacks_total{reason}`
- `model_studio_rels_propagation_count` (histogram)

---

## 9. Verification ritual (CLAUDE.md §10)

Before marking any phase complete:

1. `pnpm -C packages/shared build`
2. `pnpm -C packages/server build`
3. `pnpm -C packages/client build`
4. `pnpm tsc` (monorepo clean)
5. `pnpm test` (unit)
6. `pnpm test:integration` (real DB)
7. `drizzle-kit push` (from `packages/server`) if schema changed
8. **Curl every new/touched route** (200 / 401 / 403 / 404 / 422 / 409 matrix)
9. Playwright E2E
10. Visual check against Infection Virus standard
11. Update `tasks/test-plan-model-studio.md` — mark cases passed
12. Update `tasks/lessons.md` with anything surprising
13. Update `docs/model-studio/relationships.md`

---

## 10. Collaboration protocol for agents

- **Read this file in full** before writing any code.
- **State what you're building, what files you'll touch, and what you'll
  NOT touch** at the top of your response.
- **No silent deviations** from this brief. If you must deviate, call it
  out explicitly.
- **No hardcoded prompts** (N/A for Step 6 but rule is global).
- **No `catch (e: any)`** — name the exception.
- **No `console.log`** — use pino (server) or nothing (client — add structured
  event if needed).
- **No new dependencies** unless listed here (only `@dagrejs/dagre` is
  approved new dep).
- **No touching unrelated files.** If you notice a bug elsewhere, note it
  in `tasks/todo.md` as a follow-up. Do not fix in this PR.
- **Ship with tests.** Every new function → unit test. Every new route →
  integration test. Every user-visible flow → at least one E2E.

---

_Last updated: 2026-04-20. Branch tip at creation: `3229738`. Locked by
CEO-mode plan review in the same session._
