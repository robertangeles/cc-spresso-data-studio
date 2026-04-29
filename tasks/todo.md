# Spresso Data Studio — Task Tracking

> **Backlog source of truth.** When the user asks "what's our backlog"
> or "what's next", read THIS file. The "Current backlog at-a-glance"
> section below is the answer; the rest of this file is detail.

## Current backlog at-a-glance _(updated 2026-04-28)_

### In progress — Step 7 (Layer Linking, full cathedral)

Branch: `feature/model-studio-step7-layer-linking` — local-only, no
push yet. 6 of 8 lanes shipped:

- [x] **Lane 1** — Backend (entity-link CRUD, attribute-link CRUD,
      auto-projection, projection-chain, layer-coverage, name-match
      suggester endpoint, cycle guard via SERIALIZABLE+retry). Commit
      `f65b005`.
- [x] **Lane 2** — Client hooks (useLayerLinks, useAttributeLinks,
      useProjection, useProjectionChain, useLayerCoverage). Commit
      `0586b54`.
- [x] **Lane 3** — Layer switcher + origin badge + canvas crossfade + Shift+Alt+C/L/P shortcuts + URL `?layer=` source of truth.
      Commit `4d972dc`. Bonus fix folded in: lesson L34 — `isLoading`
      stale-false on routing-param change.
- [x] **Lane 4** — Entity-card decorations (CoverageBadges,
      UnlinkedEntityGlow, AutoProjectButton greenfield-only),
      LinkedObjectsPanel, ProjectToModal, breadcrumb mount, D-2
      LayerSwitcher glow. Commit `6bc9dc0`.
- [x] **Lane 5** — Name-match auto-link suggester (EXP-3). Bottom
      drawer, from/to layer pickers, per-row Accept + Accept-all
      batch. Commit `6f44196`.
- [x] **Lane 6** — Attribute layer-links editor (EXP-4). Wires the
      previously-stubbed `'layerLinks'` tab in AttributePropertyEditor
      with a row-per-partner dropdown picker; bidirectional view via
      `currentPartnerAttrId`. Commit `8224618`.
- [ ] **Lane 7** — **EXP-5 Cross-layer overlay mode** (~⌘L). Toggleable
      canvas split into 3 columns (Conceptual / Logical / Physical)
      so all layers read side-by-side. ~2 days CC-paced.
- [ ] **Lane 8** — **EXP-8 CDMP-style PDF export.** Server-side
      `@react-pdf/renderer` route producing cover + trust chain +
      coverage matrix + per-entity chains + canvas raster snapshot.
      ~2 days CC-paced.

### Step 7 polish (deferred to Step 11 polish pass)

- [ ] **Initial-load entity flash** — entities render at `{0,0}` for
      ~100-300ms before canvas-state lands. Resolution: fold canvas-
      state into the entity fetch (Option C). User chose this on
      2026-04-24. Detail: see "Step 11 polish backlog" section below.
- [ ] **Optional polish — clickable CoverageBadges.** Bright pill
      jumps to the linked partner on that layer. Considered + parked
      during Lane 4 testing. Defer until users ask.

### After Step 7 ships

- [ ] **Step 8** — Semantic layer bridge (binds conceptual entities ↔
      business glossary). Step 7's layer-links + attribute-links are
      the prereq. Unlocks the chatbot's ability to talk about a model
      in business terms.
- [ ] **Step 9** — DDL export (Snowflake + SQL Server + Postgres).
      Now traceable per attribute thanks to Lane 6.
- [ ] **Step 10** — AI chat (SSE streaming) + RAG over the model.
- [ ] **Step 11** — Polish (Cmd+K palette, whiteboard empty state,
      onboarding, responsive, error boundaries) + the Step 7 polish
      items above.

---

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
- [x] **Step 5** — Attribute CRUD + D9 synthetic data + attribute
      lint + Erwin-style editor + governance classification + rules
      tab + PK/FK/NN/UQ invariant normaliser + human-readable audit.
      Shipped across 8 commits on
      `feature/model-studio-step5-attributes`
      (`1e6b3fb` → `0ff65d1`) and merged into `main` via no-ff merge
      `c14b2a0` on 2026-04-20. Render auto-deploy triggered.
      Highlights: - Backend: attribute CRUD (5 routes), reorder (atomic dense
      1..N), D9 synthetic data (ephemeral, system-prompt-backed,
      CSV-injection-safe), batch endpoint
      `GET /models/:id/attributes?lint=bool`, per-attribute
      history endpoint, `lintAttribute()` extension of
      `lintIdentifier()`, pure `normalizeAttributeFlags()` that
      encodes SQL invariants in one place (PK ⇒ NN + UQ silent
      coerce; PK + FK coexist). - Schema: `data_model_attributes` gained
      `classification VARCHAR(50)` (indexed) and
      `transformation_logic TEXT`. - Client: `EntityEditor` (compact 420px ↔ expanded 960px ↔
      full-screen modal on <1280px; localStorage preference);
      Erwin-style `AttributeGrid` with sticky header, zebra
      stripes, left amber rail on selected row, dnd-kit keyboard + pointer reorder, inline Classification dropdown (colour-
      coded tones, `color-scheme: dark`); `AttributePropertyEditor`
      with 12 tabs (General / Constraints / Layer Links / Keys /
      Appearance / Documentation / Glossary / Usage /
      Custom Fields / Audit / Rules / Governance) — 4 wired
      (General, Audit, Rules, Synthetic via drawer), 8 stubs with
      "Ships in Step N" placeholders; amber-tinted scope header
      shows `ATTRIBUTE · name · type · PK/FK/classification` when
      an attribute is selected; tooltips on every column + every
      tab; FlagToggle `locked` state mirrors PK→NN+UQ invariant;
      `auditFormatter` lib renders audit events as plain-English
      lines ("Marked as primary key", "Set NOT NULL",
      "Classification set to `PII`", "Definition updated
      (5 → 2000 chars)", etc.); `EntityNode` splits PKs above a
      divider + non-PKs below. - Tests: 64 shared unit + 12 normaliser unit +
      24 server integration + 17 auditFormatter unit +
      5 Playwright E2E (S5-E1..E4). All green on branch tip.
- [ ] **Step 6** — Relationships + IE + IDEF1X notation rendering +
      notation switcher (currently inert in the canvas header).
- [ ] **Step 7 (FULL CATHEDRAL — per CEO review 2026-04-24)** — Layer
      switching + crossfade + layer_links CRUD + linked-objects nav + **auto-projection** (EXP-1) + **projection chain breadcrumb**
      (EXP-2) + **name-match auto-link suggester** (EXP-3) +
      **attribute-link CRUD write UI** (EXP-4) + **cross-layer overlay
      mode ⌘L** (EXP-5) + **unlinked-entity glow nudge** (EXP-6) +
      **⌘↑/⌘↓ projection navigation** (EXP-7) + **CDMP-auditor
      full-model PDF provenance export** (EXP-8) + 8 delights.
      See CEO plan: `~/.gstack/projects/robertangeles-cc-spresso-data-studio/ceo-plans/2026-04-24-step7-layer-linking.md`
      for full scope, architectural decisions, and test-row expansions.
      Keyboard shortcuts: **Alt+1/Alt+2/Alt+3** layer switch (NOT ⌘1/⌘2/⌘3
      which collide with browser tab switchers on macOS). ⌘↑/⌘↓ for
      projection navigation. Effort: human ~14-16 days / CC ~17-21 hours.
- [ ] **Step 8** — Semantic layer bridge + CSV export (with
      formula-injection guard).
- [ ] **Step 9** — DDL export (Snowflake + SQL Server + Postgres) +
      live DDL pane (D4) + parser round-trip validation.
- [ ] **Step 10** — AI chat (SSE streaming) + RAG (pgvector + voyage-3 + `embedding_jobs` worker that drains the queue Step 4 already
      populates) + "Explain model" (D1) + "Paste query" (D8).
- [ ] **Step 11** — Polish: Cmd+K command palette (D2), whiteboard
      empty state (D10), onboarding, keyboard shortcuts, responsive,
      error boundaries.

## Step 11 polish backlog — canvas-state fetch race on page load

- [ ] **Fold canvas-state into the entity fetch (eliminate page-load
      render race).** On page load, entities render before
      `canvas.state.nodePositions` arrives, so every entity paints at
      `{x:0, y:0}` for 100-300ms before snapping to its saved
      position. The jank is visible — entities appear clubbed in the
      top-left, then flash into place.

      **Root cause** (pre-existing Step-4 issue, not Step 7):
      - [ModelStudioCanvas.tsx:265-307](../packages/client/src/components/model-studio/ModelStudioCanvas.tsx#L265)
        — `structuralNodes` memo gives every new entity
        `position: {x:0, y:0}` as a "placeholder" with a
        `// Never trust this value.` comment.
      - [ModelStudioCanvas.tsx:322](../packages/client/src/components/model-studio/ModelStudioCanvas.tsx#L322)
        — the structural-sync effect paints those placeholders as soon
        as entities arrive, because `canvas.state.nodePositions` is
        still `{}` at that moment (from `useCanvasState`'s initial
        `EMPTY`).
      - [ModelStudioCanvas.tsx:344](../packages/client/src/components/model-studio/ModelStudioCanvas.tsx#L344)
        — the `hasSeededPositions` effect patches positions when the
        SEPARATE `GET /canvas-state` fetch resolves. That reconciliation
        is what the user sees as "the flash."

      **Fix (Option C — architectural):** Fold canvas-state into the
      entity-list response so there's ONE round-trip: on model open,
      `GET /models/:id/entities` (or a new combined endpoint) returns
      `{ entities, attributes, canvasState, layerLinks, attributeLinks }`
      in one payload. Client seeds React Flow with real positions from
      the first render. No placeholder frame, no race, no flash.

      Bonus: also closes the related n+1 gap the eng-review outside-
      voice flagged for Step 7 (Lane 1 built a unified /layer-coverage
      endpoint for similar reasons).

      **Alternatives considered** (dropped in favour of C):
      - A: delay node rendering until canvas.isLoading === false.
        Smallest diff but costs a 100-300ms empty canvas on every open.
      - B: render nodes with opacity 0 until seeded, then fade in.
        Same wait as A, plus extra CSS machinery.

      **Target:** Step 11 polish pass. User explicitly chose Option C
      on 2026-04-24 during Step 7 Lane 2 build.

## Step 7 follow-ups (captured by CEO review 2026-04-24)

- [ ] **`docs/architecture/model-studio-layer-linking.md`** — mandatory
      architecture doc per CLAUDE.md §Verification Before Done. Must
      cover: cycle-detection BFS invariants, multi-parent tree-shape
      contract for `resolveProjectionChain`, DMBOK framing (conceptual
      has no attrs by convention), `wrapCascading` refresh list
      extensions, action-verb framing ("Project to..." not "Link to...").
      Write alongside Step 7 implementation.

- [ ] **Composite PK with partial attribute-link (Step 9 concern).**
      If user links logical.customer_id → physical.customer_id but NOT
      logical.email → physical.email on a composite-PK entity, DDL
      export has to handle the orphan half. Options: (a) emit
      constraint only for linked attrs, (b) fail loudly and surface
      the gap in Live DDL pane, (c) auto-propose the missing attribute-
      link. Decide during Step 9 DDL generator design.

- [ ] **Drag-and-drop entity linking** (carried from original Step 7
      plan's NOT-shipping list). "Project to..." modal stays the
      single entry point for MVP. Drag-to-link has its own edge cases
      (accidental link on overlapping entities, cross-layer drag
      through React Flow's connection mode). Defer until real users
      surface the gesture as a preferred workflow.

- [ ] **Link annotations / notes on `layer_link` rows** (carried from
      original plan). `linkType` stays `'layer_projection'` for MVP.
      If projections grow into typed relationships (e.g.,
      `'materialized_view_of'`, `'denormalization_of'`), schema add
      a `note text` column and surface in the linked-objects panel.

- [ ] **Bulk "project this layer" sweep** (carried from original plan).
      One-click "project every conceptual entity to logical." Useful
      for greenfield users who've designed the conceptual layer and
      want to scaffold logical wholesale. Defer past Step 7 auto-
      project single-entity ships; revisit when users do 10+ sequential
      manual projections.

- [ ] **Extract Infection Virus design standard into `docs/architecture/DESIGN.md`.**
      Currently the design system lives inline in CLAUDE.md's
      "MANDATORY: Infection Virus Design Standard" section. Extraction
      to a standalone DESIGN.md would: (a) let future `/design-consultation`
      runs calibrate against a dedicated doc instead of a CLAUDE.md
      section; (b) make the spec discoverable by new engineers and
      external designers; (c) capture evolving decisions like Step 7's
      layer palette (Conceptual=amber, Logical=blue, Physical=green) + Step 6's relationship visual language + future DDL palette.
      Target: Step 11 polish pass. Effort: human ~2h / CC ~30min.
      Captured by /plan-design-review 2026-04-24 as TODO-D1.

- [ ] **Mobile overlay-mode viewer (<768px).** Step 7 ships overlay as
      desktop-only with a "view on desktop" tooltip at sub-768 widths
      (per design review Pass 6). Full mobile overlay requires:
      stacked-layer UX (3 sections vertical, swipe between), pinch-zoom
      for provenance arrows, touch gestures for jump-to-parent/child,
      read-only mode enforced. Revisit when analytics show tablet
      access or user request. Effort: human ~3 days / CC ~3h.
      Captured by /plan-design-review 2026-04-24 as TODO-D2.

- [ ] **Color-blind verification Playwright test for Step 7 overlay.**
      Layer palette uses Conceptual=amber, Logical=cool-blue,
      Physical=emerald. Blue/green pair confuses deuteranopia (most
      common). Pair every color reference with a text label (already
      specced). Add a Playwright test that screenshots the overlay
      in a deuteranopia simulation and asserts color-distance between
      columns stays above threshold. Small test; catches regressions
      if palette ever shifts toward blue/green collision. Effort: CC ~30min.

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

- [x] **Merge `feature/model-studio-step5-attributes` into `main`.**
      Done 2026-04-20 as merge commit `c14b2a0`. Pushed to origin;
      Render auto-deploy triggered. Feature branch can be deleted
      locally + on origin at any time.

- [ ] **Step 5 P2 drawer-controls spec (S5-E5).** Playwright:
      copy-to-clipboard + regenerate + close buttons on the
      synthetic-data drawer. Small; add when tightening up tests.

- [ ] **Wire the remaining 8 stub tabs over future Steps.** All
      stubs live in
      [packages/client/src/components/model-studio/AttributePropertyEditor.tsx](packages/client/src/components/model-studio/AttributePropertyEditor.tsx)
      and already declare `shipsIn` in their TABS metadata:
      Constraints (check-constraint table), Layer Links (Step 7),
      Keys (Step 9), Appearance (metadata JSONB editor),
      Documentation (Step 11 Markdown editor), Glossary (Step 8),
      Usage (Step 10 cross-model query), Custom Fields (metadata
      UDP editor), Governance (steward + compliance tags beyond
      the in-grid classification). Each is a single-file add.

- [ ] **Audit event action set is minimal.** `auditFormatter` handles
      `create` / `update` / `delete` / `synthetic_generated` /
      `attribute_order` / `reorder`. Future actions (Step 6
      relationship events, Step 7 layer_link events) should
      register phrases — add cases in `formatAuditEvent`'s switch
      and extend `FIELD_LABELS` as new columns land.

- [x] **Model-wide attribute batch endpoint** — shipped in Step 5
      follow-ups (`8c8ee38`). `GET /api/model-studio/models/:id/attributes?lint=bool` + `useAttributes.loadAll()` on canvas mount. PK indicators now
      render immediately on first paint / after refresh.
- [ ] **Convert remaining seed scripts to use `runOnce()`** for
      consistency. Today only `migrateModelIds` is guarded; the
      various `seed*` calls in `start()` (`seedRoles`, `seedAIProviders`,
      `seedChannels`, `seedDefaultPrompts`, etc.) are individually
      idempotent but follow the older pattern. Not urgent — they're
      explicit row-existence checks, not bulk UPDATEs.

## Step 6 follow-ups (deferred from Phase 6 Playwright build)

- [ ] **Entity-delete undo via soft-delete / restore endpoint.** Step 6 ships undo/redo for rel CRUD, attr CRUD, entity create+update, notation flip, and canvas drag. Entity DELETE is intentionally not reversible in MVP (cascades across attrs, rels, layer_links, canvas positions — replay requires either tombstones across the whole schema OR ID-preserving restore endpoints). See tasks/alignment-step6-patch.md §2.3 for the decision + rationale.

- [x] Step 6 Showcase seed script — packages/server/src/scripts/seed-step6-showcase.ts. Run with `pnpm -C packages/server db:seed-step6-showcase`. Idempotent via runOnce.

- [x] **Fixture auth rescue (S6-E2 / E5 / E6 / E7 / E8 + new
      E11/E12 unblocked).** Spec refactored to the `dependencies:
['setup']` project chain — one login per run via `setup`,
      one `POST /api/auth/refresh` per suite to mint an access token
      for API calls. Zero per-test logins, zero rate-limit burn.
      See the header comment of
      `packages/client/tests/e2e/model-studio-relationships.spec.ts`
      for full strategy.
- [ ] **S6-E1 / E3 / E4 — React Flow v12 drag-to-connect automation.**
      Still `.fixme` in
      `packages/client/tests/e2e/model-studio-relationships.spec.ts`.
      Playwright's `mouse.down/move/up` sequence is not a reliable
      driver for React Flow v12's connection mode — the synthetic
      PointerEvents either pan the canvas or release before the
      target handle is registered as the drop target. Options to
      explore in a dedicated follow-up session: (a) switch to
      `page.dispatchEvent('pointermove')` with explicit PointerEvent
      init dicts, (b) add a test-only keyboard command `Alt+C` on
      the source handle that starts React Flow connection mode
      without drag, (c) drive connection via the React Flow
      `onConnectStart`/`onConnectEnd` internals using a `page.evaluate`
      hook. Drag-dependent cases unblock after one of these lands.
- [x] **S6-E13 — cardinality glyphs visible in edge SVG.** GREEN after
      Agent C's smoothstep + outward-glyph fix. Playwright asserts
      `[data-glyph]` elements render outside the entity node bbox.
- [ ] **S6-E14 — self-ref arc assertion tuning.** Agent C's fix makes
      the arc visible (screenshot confirmed — `agent-c-selfref.png`),
      but the Playwright assertion Agent F wrote speculatively expected
      a specific path `d` attribute format and doesn't match the final
      two-arc geometry (`M sx sy A 22 22 0 0 1 ... A 22 22 0 0 1 ...`).
      Needs an assertion re-tune: check for `data-self-ref="true"` +
      assert the path starts with `M ` AND contains `A 22 22` instead
      of the current tighter regex. Currently `.fixme` in
      `packages/client/tests/e2e/model-studio-relationships.spec.ts`.
- [ ] **S6-E15 — undo create rel (⌘Z) assertion tuning.** Agent A's
      undo core is live (128/128 unit green incl. 11 undo tests), but
      the Playwright keyboard-dispatch assertion needs adjustment —
      `page.keyboard.press('Control+Z')` on the canvas may not reach
      the document-level keydown handler while React Flow has focus.
      Needs `document.dispatchEvent(new KeyboardEvent('keydown', ...))`
      pattern (same technique Agent F used for E6's Delete key). Test
      written; `.fixme`.
- [ ] **S6-E16 — undo notation flip (⌘Z) assertion tuning.** Same
      keyboard-dispatch root cause as E15. Same fix. `.fixme`.
- [ ] **S6-E9 — two-tab BroadcastChannel notation sync E2E.** Currently
      `.fixme` in
      `packages/client/tests/e2e/model-studio-relationships.spec.ts`.
      Root cause: the per-test fixture launches each Playwright
      `BrowserContext` in its own Chromium process, and
      `BroadcastChannel` does not cross process boundaries — so a
      notation flip in context A is never received in context B.
      Options for un-fixme: (a) add one dedicated test that shares a
      single `BrowserContext` across two `page`s (without breaking the
      existing per-test auth-injection pattern), or (b) lean on
      `S6-U21` (`useNotation` BroadcastChannel unit test) as sufficient
      coverage. Pick one in a follow-up phase.
- [ ] **S6-E10 — `⌘R` keyboard-draw flow.** Currently `.fixme` in the
      same spec. There is no keyboard-draw handler on
      `ModelStudioCanvas.tsx` today — Phase 6 investigation confirms
      zero references to KeyR / metaKey / `'r'` anywhere in the
      model-studio tree. Ship the handler (select source entity →
      `⌘R` → select target → `Enter` creates the rel) then un-fixme
      the test.

- [ ] **Candidate-key-referenced foreign keys (alt-key FK targets).**
      Today every FK references the source entity's primary key. Standard
      SQL allows an FK to reference any column (or column-set) with a
      UNIQUE constraint — a candidate key — which Erwin + ER Studio both
      support as "alternate-key FK" / "role-named FK".

      Gap evidence:
        - [packages/server/src/services/model-studio-relationship-propagate.service.ts:296](packages/server/src/services/model-studio-relationship-propagate.service.ts#L296)
          only SELECTs source attrs with `isPrimaryKey = true`; UQ-only
          columns and AK-group members are skipped.
        - [packages/server/src/services/model-studio-relationship.service.ts:989](packages/server/src/services/model-studio-relationship.service.ts#L989)
          `setKeyColumns` rejects any non-PK source attribute.
        - Relationship row has no `referencedColumn` metadata — DDL
          generation in Step 9 will have to default to the PK.

      Scope when picked up:
        1. Schema: add `source_attribute_ids uuid[]` OR equivalent
           per-pair metadata on the propagated FK attr so DDL can emit
           the right `REFERENCES <entity>(<col>)` clause. Keep
           backward-compat default to PK.
        2. Server: relax the PK check in propagate-service + setKeyColumns
           to allow `isPrimaryKey=true OR isUnique=true OR altKeyGroup
           IS NOT NULL` as eligible source. Reject anything else with
           a clear 422.
        3. Client: RelationshipPanel's Key Columns section — add a
           second "Source column" dropdown on each row so the user can
           pick from any candidate key on the source entity (default =
           a PK row per PK). Composite AKs need their member columns
           listed together.
        4. DDL (Step 9): emit correct REFERENCES clause based on the
           persisted referenced column(s).
      Blocked by: nothing. Additive; PK-referenced stays the default
      path. Rough effort: 2-3 hrs.

- [ ] **EntityEditor: tabbed property sheet (Erwin convention).**
      Convert the EntityEditor header (name / business name /
      definition / actions) into a compact row + tabs below:
      **Attributes** (default) | Definition | Keys | Documentation.
      Rationale: Erwin + ER Studio + PowerDesigner all ship this
      exact UX — it's the convention senior CDMP practitioners expect,
      and it keeps the attribute grid (the working surface) on screen
      while isolating prose / keys / docs to their own tabs. This PR
      (`feature/model-studio-step6-relationships`) ships Direction A
      (collapsible Definition with 1-line preview + localStorage
      persistence) in
      [packages/client/src/components/model-studio/EntityEditor.tsx](packages/client/src/components/model-studio/EntityEditor.tsx)
      as the quick win — 1hr, zero new abstractions, immediate fix
      for "long Definition pushes grid off-screen". The tabbed
      refactor is deferred because it's ~4-6hrs of scaffolding (tab
      container + route state + migrating the existing Row 4 /
      action-strip sections + updating Playwright selectors) that
      doesn't block the demo. Where to start: model the tabs as a
      reusable `<PropertySheetTabs>` primitive since the
      `AttributePropertyEditor` (already tabbed) can adopt the same
      component in a follow-up pass. Blocked by: nothing — can ship
      any time after Step 6 merges.

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
