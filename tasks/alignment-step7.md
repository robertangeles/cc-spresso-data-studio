# Step 7 — Layer switching + `layer_links` CRUD + linked-objects nav

Development brief. Complements [alignment-model-studio.md](alignment-model-studio.md)
and the Step-7 test rows already enumerated in
[test-plan-model-studio.md](test-plan-model-studio.md) lines 362–387.

---

## Why this step

Today an entity on the conceptual layer and its logical / physical projection are **three independent rows** with no connection between them. The canvas header shows the active layer as a read-only label ([ModelStudioDetailPage.tsx:100](../packages/client/src/components/model-studio/ModelStudioDetailPage.tsx#L100) — `<InertSelect label={capitalize(model.activeLayer)}>`). A CDMP practitioner expects to:

1. Pick which layer they're working on.
2. Navigate between a logical "Customer" entity and its physical `dim_customer` projection without losing their place.
3. See at a glance that "this conceptual Customer has a logical projection but no physical one yet."
4. See a layer transition that reads as intentional, not a hard cut.

Step 7 wires the `data_model_layer_links` table (already in schema, already indexed — [schema.ts:2084-2105](../packages/server/src/db/schema.ts#L2084)) into the canvas, adds a writable layer switcher, and animates the layer change so the user's attention survives the transition.

---

## What ships

### Core

| #     | What                                                                                                                                                                                                                                                                     | Where                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| S7-C1 | **Writable layer switcher** — replaces the header's `InertSelect` with a live picker. Clicking a layer updates `data_models.active_layer` via PATCH and re-queries the canvas for that layer.                                                                            | `LayerSwitcher.tsx` (new) + `model-studio.service.ts`                                    |
| S7-C2 | **`layer_links` CRUD** — 4 routes: `POST` / `DELETE` / `GET by parent` / `GET by child`. Cycle detection via BFS on the link graph; reject same-layer links (422).                                                                                                       | `model-studio-layer-links.routes.ts` (new) + `model-studio-layer-links.service.ts` (new) |
| S7-C3 | **D3 Layer crossfade animation** — when the user flips layers, entity cards fade out at 120ms, new layer's cards fade in at 180ms with a 40ms stagger. Respects `prefers-reduced-motion`.                                                                                | `ModelStudioCanvas.tsx` (animation variants), CSS keyframes in `index.css`               |
| S7-C4 | **Linked-objects nav panel** — when an entity is selected, a side panel lists its projections on other layers with a "Jump to" action. Empty state: "No projection on Logical. [+ Link existing entity…]"                                                                | `LinkedObjectsPanel.tsx` (new)                                                           |
| S7-C5 | **Default traversal direction from `originDirection`** — new models with `origin_direction='greenfield'` start on conceptual; `existing_system` starts on physical. Jump-buttons in the linked-objects panel default their sort (greenfield: down, existing_system: up). | `ModelStudioDetailPage.tsx` + `LinkedObjectsPanel.tsx`                                   |
| S7-C6 | **Layer coverage badges on entity cards** — small chips on each entity showing which layers have a linked projection (e.g., `C · L · –` = has conceptual + logical, no physical). Click a chip → linked-objects panel with that layer focused.                           | `EntityNode.tsx` additions                                                               |
| S7-C7 | **Autosave active layer on switch** — `data_models.active_layer` persists immediately so reload returns to the same layer.                                                                                                                                               | `useCanvasState` (patch flow)                                                            |

### Delights

- **D3 — Layer crossfade.** 120ms out / 180ms in with 40ms stagger; tangent to S7-C3. Measurement: zero jank on a 30-entity canvas at 60fps.

### Also shipping (free follow-ups unlocked)

- **Unwire `AttributePropertyEditor`'s "Layer Links" tab stub.** Today it renders `<StubTab shipsIn="Step 7" />` at [AttributePropertyEditor.tsx:385-390](../packages/client/src/components/model-studio/AttributePropertyEditor.tsx#L385-L390). Step 7 activates it **read-only** (shows the linked attr on the other layer if one exists via `data_model_attribute_links`); full attribute-link CRUD defers to **Step 7.5 or Step 8** so the scope stays focused.
- **`originDirection` visible in the model header** — one-word badge (`greenfield` / `existing_system`) next to the model name so users understand why the default layer is set the way it is.

### NOT shipping (explicitly deferred)

- **Attribute-level link CRUD UI.** `data_model_attribute_links` table exists ([schema.ts:2183](../packages/server/src/db/schema.ts#L2183)) but the management UI is deferred. Read-only surface on the Layer Links tab (above) is the only touch-point.
- **Auto-projection** (clone a conceptual entity to logical/physical with one click). Users manually create the projection entity on each layer, then link them. Auto-projection is a Step 8+ convenience.
- **Bulk link-by-name** (link all matching-name entities across layers in one action). Deferred.
- **Link annotations / notes** on the link itself. `linkType` stays `'layer_projection'` for MVP.
- **Drag-and-drop linking** (drag entity onto another-layer entity). Right-click → "Link to…" modal only.

---

## Technical design

### Schema — no changes needed

[`data_model_layer_links`](../packages/server/src/db/schema.ts#L2084) is ready:

```
id, parentId (FK→entities), childId (FK→entities),
linkType default 'layer_projection', createdAt,
unique(parentId, childId),
indexes on parentId + childId
```

Layer is inferred from `entities.layer` on both ends — the service enforces that parent and child are on **different** layers. `[`attribute_links`]` ([schema.ts:2183](../packages/server/src/db/schema.ts#L2183)) is parallel at the column level; Step 7 touches only the entity-level table.

### Server — 4 routes + cycle-guard

```
POST   /api/model-studio/models/:id/layer-links         { parentId, childId }
DELETE /api/model-studio/models/:id/layer-links/:linkId
GET    /api/model-studio/models/:id/layer-links?parentId=…  → child projections
GET    /api/model-studio/models/:id/layer-links?childId=…   → parent projections
```

`model-studio-layer-links.service.ts` (new):

- `createLink({ parentId, childId, userId })` → validates both entities exist in the same `modelId`, are on different layers, and adding this link wouldn't create a cycle (BFS from `childId` looking for `parentId` via existing links). Reject same-layer with 422.
- `deleteLink(linkId, userId)` → soft ownership check, cascade nothing (link row only).
- `listByParent(parentId)` / `listByChild(childId)` → returns the linked entity rows with their layer so UI can group.

No changes to existing relationship / attribute / entity services.

### Client — 3 new components + 1 hook

- **`LayerSwitcher.tsx`** — segmented control (`Conceptual | Logical | Physical`). Pill-style, Infection-Virus amber selection glow. On click: `canvasState.update({ activeLayer: next })`; trigger crossfade variant; navigate to `?layer=next` so URL stays shareable.
- **`LinkedObjectsPanel.tsx`** — floating card on the right side (200px wide) when an entity is selected. Lists the three layers; each slot is either a linked entity (name + "Jump to") or an empty state with "Link existing entity…" button. Right-click a linked entity → "Unlink."
- **`useLayerLinks.ts`** — matches `useRelationships` shape (`loadByEntity`, `create`, `delete`). Keyed on `entityId`.
- **`ModelStudioCanvas.tsx`** patches:
  - Detect `activeLayer` prop change; fire crossfade variant via Framer Motion (already a transitive dep via `@dnd-kit`) OR hand-rolled CSS keyframes — pick whichever is lighter.
  - Respect `prefers-reduced-motion`: no animation, immediate swap.

### Effort

- Server: ~0.5 day (routes + service + cycle guard + integration tests)
- Client: ~1.5 days (LayerSwitcher + LinkedObjectsPanel + crossfade + badges)
- Tests: ~0.5 day (3 unit + 2 integration already enumerated; 4 E2E per test plan)
- Polish + lint-fixes: ~0.5 day

**Total: ~3 days CC-paced.** Budget slippage if the crossfade animation needs iteration to feel right on dense canvases.

---

## Dependencies & ordering

- **Nothing blocks this step.** `origin_direction` is already on the model row (Step 4.5), `active_layer` is already a writable column (Step 3 scaffolded it as a JSON field on `data_model_canvas_states`, moved to `data_models` in a later migration — verify before touching).
- **Unblocks Step 8** (semantic layer bridge) — once layers can be linked, the semantic bridge has rows to bind on.
- **Unblocks Step 9** (DDL export) — physical-layer DDL needs the layer_links to know which logical attrs feed which physical columns (via attribute_links, future step).

---

## Test plan — cross-ref

Test rows are already enumerated in [test-plan-model-studio.md](test-plan-model-studio.md) lines 362–387. Summary:

| ID      | Phase       | Case                                                              | Priority |
| ------- | ----------- | ----------------------------------------------------------------- | -------- |
| S7-U1   | Unit        | Cycle detection rejects self-referencing chain                    | P1       |
| S7-U2   | Unit        | Same-layer link rejected with 422                                 | P1       |
| S7-U3   | Unit        | Filter helper returns projections grouped by layer                | P2       |
| S7-I1   | Integration | `POST /layer-links` happy path                                    | P1       |
| S7-I2   | Integration | `POST /layer-links` cycle returns 422                             | P1       |
| S7-E1   | E2E         | Layer crossfade animation runs on switch                          | P1       |
| S7-E2   | E2E         | Linked-objects nav panel "Jump to" navigates correctly            | P1       |
| S7-E2.5 | E2E         | "Link existing entity…" modal creates link + refreshes panel      | P1 (add) |
| S7-E3   | E2E         | `active_layer` autosaves on switch (reload returns to same layer) | P1       |
| S7-E4   | E2E         | Entity cards show correct layer-coverage badges                   | P2       |

**Add during implementation:**

- Unit: `defaultTraversalDirection(originDirection)` → conceptual-first for greenfield, physical-first for existing_system.
- Integration: `DELETE /layer-links/:id` returns 204 + removes the row.
- E2E: delete a linked entity → link row cascades away (or is orphaned and reported in the panel — decide).

---

## Risks & unresolved decisions

1. **Crossfade library choice.** Framer Motion is ~60KB gzipped; hand-rolled CSS is free but has less control over stagger timing. If the canvas is already feeling heavy at 30+ entities, the extra JS might hurt. **Propose:** hand-rolled first; upgrade to Framer Motion only if hand-rolled looks janky.
2. **Orphan handling on entity delete.** If entity A is linked to B and A is cascade-deleted, should the `layer_links` row go too (FK cascade already does this) **and** B gain an "orphan projection" flag? Simplest: FK cascade removes the row, B looks "unlinked" on next render. No flag.
3. **`activeLayer` location.** The Explore report says it's on `data_models` (line 2004 of schema.ts). Earlier Step-3 work may have scaffolded it on `data_model_canvas_states.node_positions` as a JSON field. Verify before PATCH — one or the other.
4. **Linked-objects panel placement.** Side panel (current convention — RelationshipPanel, EntityEditor) vs inline chip on the entity itself. Side panel is more information-dense but takes canvas space. **Propose:** side panel, toggleable from a small chip on the entity header.
5. **URL param vs model column as source of truth for active layer.** URL wins on sharability (paste a link to a specific layer); model column wins on "resume where I left off." **Propose:** URL param is the source of truth in-session; writes to the model column on every switch (autosave) so a fresh load has a sensible default.

---

## Open follow-ups after Step 7 ships

- **Attribute-level link CRUD** (the other half of the Layer Links tab, full write UI). **SUPERSEDED:** folded into Step 7 via CEO review 2026-04-24 as EXP-4.
- **Bulk "project this entity to next layer" action** — creates the projection entity + the link in one move. **SUPERSEDED:** single-entity auto-projection folded into Step 7 as EXP-1; bulk sweep defers to `tasks/todo.md` under "Step 7 follow-ups."
- **Breadcrumb: show projection chain in the header** when navigating across layers ("Customer → Customer → dim_customer"). **SUPERSEDED:** folded into Step 7 as EXP-2.
- **"Find unlinked entities" audit** — surface entities that have no projection on expected layers given the model's origin_direction. **SUPERSEDED:** folded into Step 7 as EXP-6 (unlinked glow nudge on canvas).

---

## CEO review — 2026-04-24 addendum

This plan was reviewed via `/plan-ceo-review` on 2026-04-24 under **SCOPE EXPANSION** mode. The review expanded scope from the original S7-C1 through S7-C7 to a full cathedral:

**New expansions folded in:**

- EXP-1: Auto-projection (`POST /entities/:entityId/project`)
- EXP-2: Projection chain breadcrumb + `resolveProjectionChain()` server helper
- EXP-3: Name-match auto-link suggester
- EXP-4: Attribute-link CRUD (write UI in Layer Links tab)
- EXP-5: Cross-layer overlay mode (⌘L) with side-by-side columns layout
- EXP-6: Unlinked-entity glow nudge on canvas
- EXP-7: ⌘↑/⌘↓ projection navigation (Alt+1/2/3 for layer switch — NOT ⌘1/⌘2/⌘3 due to browser collision)
- EXP-8: CDMP-auditor full-model PDF provenance export

**Defects fixed from the plan as originally written:**

1. Framer Motion is NOT a transitive dep via `@dnd-kit`. Hand-rolled CSS keyframes path becomes primary.
2. `activeLayer` semantics conflict resolved: it IS view state (schema comment correct); `EditModelDialog` comment must be corrected to lock only `originDirection`.
3. Crossfade timing gates on canvas-state GET resolution, not a fixed timer (fetch-gated fade-in).
4. Same-layer link rejection status code aligned to **400** (per lesson L29), not 422.
5. DMBOK reframe of EXP-1: conceptual has no attributes by convention; auto-project scaffolds, does not clone.

**Mandatory follow-up:** Playwright visual verification per every feature and delight (standing rule, `feedback_playwright_step7.md`). Every E2E in the expanded test table produces a screenshot at the key interaction.

**See:** `~/.gstack/projects/robertangeles-cc-spresso-data-studio/ceo-plans/2026-04-24-step7-layer-linking.md` for full CEO plan with scope decisions, architectural resolutions, error map, test expansion, observability plan.

---

## Eng review — 2026-04-24 addendum

Eng review completed after CEO review. Four outside-voice tensions resolved with plan revisions:

1. **PDF runtime: server-side Node route, not Web Worker.** `POST /api/model-studio/models/:id/export-pdf` runs `@react-pdf/renderer` natively in Node. Avoids Worker shimming + Chromium deploy pain.
2. **Layer shortcut: Shift+Alt+C/L/P, not Alt+1/2/3.** Alt+1/2/3 collides with Firefox tab-switch on Linux/Windows + Windows menu mnemonics.
3. **Cascade refresh: `Promise.all` parallel, not sequential.** `wrapCascading<T,S>` extended with refresh-callbacks array + Promise.all — 3 GETs fire in parallel.
4. **PDF content: structured text + canvas raster embed.** Cover + provenance matrix + per-entity chains + a single-page React Flow `toPng()` canvas snapshot.

Additional eng-review actions:

- `entity.layer` locked immutable at service layer post-create (closes cycle-guard-on-UPDATE gap).
- EDGE-1 autosave-on-layer-switch: on PATCH failure, BLOCK switch + inline validation error.
- EXP-1 build order: EXP-4 attribute-link service ships before EXP-1; EXP-1 auto-creates attribute_links for scaffolded business-key attrs.
- New route `GET /api/model-studio/models/:id/layer-coverage` returns `{[entityId]: {c,l,p}}` matrix. Shared by S7-C6 + EXP-5 + EXP-6 — eliminates N+1 across those features.
- `resolveProjectionChain()` returns full tree (multi-parent AND multi-child). Breadcrumb picks oldest-createdAt at each fork (generalizes ARCH-2 from multi-parent to multi-child DAG).
- Cycle-detection uses SERIALIZABLE with 3x retry on 40001. Advisory-lock optimization deferred to Step 7.5.

Parallelization strategy: 8 lanes. Lane 1 (server core) must ship first. Lanes 2-6 parallel after Lane 1 merges. Lane 7 (overlay + PDF) + Lane 8 (sync + suggester) sequential last. E2E suite final.

**See:** `~/.gstack/projects/robertangeles-cc-spresso-data-studio/ceo-plans/2026-04-24-step7-layer-linking.md` for the full revised plan.

---

## Design review — 2026-04-24 addendum

Design review ran after eng review. Initial rating 7/10 → final 9.5/10 after 7 passes. Mockups were skipped (OpenAI API key not configured for gstack designer) — text-based specs substitute at sufficient depth.

**Design decisions added to plan:**

1. **Overlay column sort order** (Pass 1): primary by projection-coverage desc (fully-linked entities first), secondary by createdAt asc. Unlinked entities sink to the bottom of each column, making gaps self-evident. Alt-click column header cycles sort order.
2. **Overlay loading state** (Pass 2): three column skeletons with shimmer animation in layer tints render immediately; replaced by real content when fetch resolves; 40ms stagger by column (conceptual → logical → physical).
3. **Glow stacking priority** (Pass 2): selection wins; unlinked-glow suppresses while selected. Focus ring (a11y outline) always renders and is visually distinct from halos.
4. **Amber glow hierarchy** (Pass 4): amber reserved for active/selected state + keyboard focus + unlinked nudge + primary-CTA gradient. NOT used on breadcrumb segments, coverage badges, linked-panel header, or modal header. Amber = signal, not decoration.
5. **Layer palette** (Pass 5): Conceptual = amber (brand), Logical = cool-blue (#3B82F6), Physical = emerald (#10B981). Every layer reference pairs color with text label for color-blind accessibility. Palette propagates to Step 8 semantic bridge + Step 9 DDL export.
6. **Responsive specs** (Pass 6): desktop full experience; tablet (768-1023px) stacks overlay vertically + LinkedObjectsPanel slides over; mobile (<768px) overlay unavailable with "view on desktop" tooltip, LinkedObjectsPanel becomes bottom sheet.
7. **A11y specs** (Pass 6): full ARIA landmarks + keyboard nav + screen-reader labels specified for every new surface. Touch targets ≥44px. Text contrast ≥4.5:1. PDF exports use @react-pdf/renderer's Document tagging for accessible structure.
8. **Modal viewport-edge overflow** (Pass 7): smart-reposition — compute modal rect at click coord; if clip detected, flip to opposite quadrant so modal opens toward viewport center. Pattern reusable for Cmd+K palette in Step 11.
9. **CDMP PDF layout order** (Pass 7): cover → canvas raster → provenance matrix → per-entity chain pages. Auditor opens → sees the whole model → scans gaps → dives into specifics.

**User journey arcs added:**

- Golden path A (first-time greenfield projection): 9-step emotional arc from "clean slate" through "it DID it for me" to "mastery."
- Golden path B (CDMP audit workflow): 6-step arc ending in "done, ship it" via Export PDF.

**3 design TODOs captured** in tasks/todo.md: DESIGN.md extraction (Step 11), mobile overlay support (deferred), color-blind Playwright test (during build).

---

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status | Findings                                                                                                                                                                                        |
| ------------- | --------------------- | ------------------------------- | ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 1    | CLEAR  | SCOPE_EXPANSION; 8 proposals + 8 delights accepted; 5 arch decisions resolved; 20 spec-reviewer issues addressed (18 resolved); 0 unresolved                                                    |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 0    | —      | —                                                                                                                                                                                               |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | CLEAR  | 12 issues found (4 arch, 5 quality, 3 perf); 4 outside-voice tensions resolved (3 reversed earlier decisions); 8 lanes parallelization strategy; 0 critical gaps in failure modes; 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 1    | CLEAR  | Score 7→9.5/10; 9 design decisions added to plan; 2 design TODOs captured; 0 unresolved; mockups deferred (gstack designer API key unconfigured)                                                |
| DX Review     | `/plan-devex-review`  | Developer experience gaps       | 0    | —      | N/A — internal feature, no external DX surface                                                                                                                                                  |

- **CROSS-MODEL:** CEO spec-review + eng outside-voice both ran; 4 outside-voice findings overturned earlier decisions (PDF runtime, keyboard shortcut, cascade refresh, PDF content). Cross-model pressure caught real defects; user approved each reversal.
- **UNRESOLVED:** 0 across all three reviews
- **VERDICT:** CEO + ENG + DESIGN ALL CLEARED — cleared to implement. Recommended build order per eng-review parallelization strategy: Lane 1 (server core) first, then Lanes 2-6 parallel worktrees, then Lanes 7-8 sequential, then full E2E suite. All Playwright E2E screenshots per `feedback_playwright_step7.md` standing rule.
