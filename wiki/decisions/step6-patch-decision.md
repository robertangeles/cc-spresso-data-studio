---
title: Step 6 Post-Ship Patch (undo/redo + 7 fixes)
category: decision
created: 2026-04-29
updated: 2026-04-29
related: [[step6-decision]], [[relationships-feature]]
---

Locked decisions for the Step 6 post-ship patch round: full undo/redo (cathedral scope, not deferred) plus 7 fixes (notation pill removal, smooth-step rel paths, scroll bouncing fix, validation toast, flag default-on, self-ref arc visibility, showcase seed model).

# Step 6 post-ship patch — undo/redo + 7 fixes (alignment addendum)

> **Every agent working on this round MUST read this file AND
> `tasks/alignment-step6.md` before writing code.**
> This is the addendum lock-ledger for Rob's 7 post-ship findings plus
> the CEO-level scope expansion to full undo/redo.

**Branch:** `feature/model-studio-step6-relationships` (already
`push`-queued).
**Mode:** cathedral / EXPANSION. Undo/redo is in scope **now**, not a
TODO defer.
**Scope:** one commit (or one merged sequence of commits) shipping
undo/redo + the 7 fixes. Must not regress the 464 existing tests.

---

## 1. 7 fixes (each has a locked decision)

| #   | Problem                                                                       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                        | Files touched                                                                                     |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Duplicate "IE NOTATION" header pill redundant with in-canvas NotationSwitcher | Delete `<InertSelect label={model.notation...} />` line at `packages/client/src/pages/ModelStudioDetailPage.tsx:101`. Keep the PHYSICAL/LOGICAL/CONCEPTUAL layer selector next to it.                                                                                                                                                                                                                                           | `ModelStudioDetailPage.tsx`                                                                       |
| 2   | Relationship lines use bezier + glyphs not visible on canvas                  | Swap to `getSmoothStepPath` (orthogonal L-shapes). Investigate glyph positioning — likely glyphs render behind the entity card because endpoint coords sit on the entity border. Fix via glyph offset along tangent direction OR explicit z-index layering.                                                                                                                                                                     | `RelationshipEdge.tsx`, maybe `ModelStudioCanvas.tsx`                                             |
| 3   | Scroll / pan bouncing introduced by `7801bc5` `useNodesState` sync effect     | Split the `canonicalNodes` useMemo into two: (a) **structural** memo keyed on entity ids + attr shapes + selection + orphan pref (no positions), (b) **positions** derived from `canvas.state.nodePositions`. `setNodes` effect re-seeds identity only on structural changes. Position updates flow through React Flow's internal state via `onNodesChangeInternal` only.                                                       | `ModelStudioCanvas.tsx`                                                                           |
| 4   | "Validation failed" toast on IE↔IDEF1X flip                                   | Add `notation: NOTATION.optional()` to `canvasStatePutSchema` in `packages/shared/src/utils/model-studio.schemas.ts`. The hook PUTs `{layer, notation, nodePositions, viewport}` — strict schema rejects `notation`.                                                                                                                                                                                                            | `model-studio.schemas.ts`                                                                         |
| 5   | Feature flag `MODEL_STUDIO_RELATIONSHIPS_ENABLED`                             | Flip default to `true` in `.env` + `.env.example` + `docs/model-studio/feature-flags.md`. Keep `relationshipsEnabledGate` middleware as a production kill switch. No behaviour change at runtime unless flag is explicitly set to `false`.                                                                                                                                                                                      | `.env`, `.env.example`, `docs/model-studio/feature-flags.md`                                      |
| 6   | Self-ref arc invisible on canvas                                              | `isSelfRef: r.sourceEntityId === r.targetEntityId` IS set correctly at `ModelStudioCanvas.tsx:229`. `selfRefPath` exists in `RelationshipEdge.tsx`. Diagnose rendering: likely the arc path is drawn at `(sourceX, sourceY)` which is INSIDE the entity bounding box, so the arc renders behind the card. Fix: translate the arc origin OUTSIDE the card edge (offset along the top-right corner) OR render above node z-index. | `RelationshipEdge.tsx`, `ModelStudioCanvas.tsx`                                                   |
| 7   | New sample model showcasing all Step 6 features                               | NEW script: `packages/server/src/scripts/seed-step6-showcase.ts`. Mirrors the `seed-e2e-user.ts` pattern. Uses `runOnce('seed-step6-showcase', ...)` guard. Creates ONE new model under the existing `e2e-test@test.com` user → "Just Another Client" project OR creates its own project.                                                                                                                                       | `packages/server/src/scripts/seed-step6-showcase.ts`, `packages/server/package.json` (npm script) |

### Showcase model specification (#7)

The seed MUST exercise every Step 6 feature a QA tester needs to verify:

- **Entities** (6 total on logical layer):
  - `customer` (PK: `customer_id` uuid, `email` varchar NN UQ, `display_name` varchar NN)
  - `order` (PK: `order_id` uuid, `customer_id` uuid FK→customer, `placed_at` timestamp NN)
  - `order_line` (composite PK: `order_id` + `line_number`; FK `order_id`→order; `product_id` uuid FK→product; `quantity` int NN)
  - `product` (PK: `product_id` uuid, `sku` varchar UQ NN, `name` varchar NN)
  - `employee` (PK: `employee_id` uuid, `manager_id` uuid NULLable FK→employee) — self-ref
  - `address` (PK: `address_id` uuid, `street` varchar NN)
- **Relationships**:
  1. `customer` 1:many `order` — non-identifying (`one` : `one_or_many`)
  2. `order` 1:many `order_line` — **identifying** (so composite PK propagation fires visibly)
  3. `product` 1:many `order_line` — non-identifying (`one` : `zero_or_many`)
  4. `employee` self-ref `manager_id` — non-identifying (`zero_or_one` : `zero_or_many`) — exercises self-ref arc
  5. `customer` 0..1:1 `address` — one-to-one optional (`zero_or_one` : `one`) — exercises optional bar+circle
- Model name: **"Step 6 Showcase"**, description explaining what to test
- Seeded positions on the canvas: spread across a 1000×600 grid (so no stacking at 0,0)

---

## 2. Undo/redo core (scope-expanded, cathedral)

### Goal

`⌘Z` / `⌘⇧Z` stack that reverses **all** model-studio mutations: rel
CRUD, attribute CRUD + reorder, entity CRUD, identifying-flag toggle
(with propagation/unwind), notation flip.

### Architecture

```
                             ┌─────────────────────┐
  UI (canvas, panels) ──────▶│ useUndoStack()       │──PUSH command─▶
                             │ - undoStack: []      │
                             │ - redoStack: []      │
                             │ - execute(fwd, inv)  │
                             │ - undo()             │
                             │ - redo()             │
                             └─────────────────────┘
                                       │
                                       ▼
                             ┌─────────────────────┐
                             │ Command             │
                             │ - id: string         │
                             │ - label: string      │
                             │ - forward: () => P   │
                             │ - inverse: () => P   │
                             └─────────────────────┘

   Existing hooks (useRelationships, useEntities, useAttributes,
   useNotation) DO NOT call the server directly for the mutations
   below. Instead, they return { fn, undoCommand } — the caller
   pushes the command on the shared stack.

   Wait — simpler: keep existing hook APIs unchanged. The canvas /
   panel callers wrap them:

     const undo = useUndoStack();
     await undo.execute({
       label: 'Create relationship',
       forward: () => rels.create(input),
       inverse: (created) => rels.remove(created.id),
     });
```

### Command inventory (every mutation needs a forward+inverse pair)

| Mutation                      | Forward                                     | Inverse                                      | Notes                                                             |
| ----------------------------- | ------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Create rel                    | `rels.create(input)`                        | `rels.remove(created.id)`                    | Simple                                                            |
| Delete rel                    | `rels.remove(id)`                           | `rels.create(capturedPayload)`               | Capture full rel DTO before delete; new ID on recreate acceptable |
| Update rel                    | `rels.update(id, patch, v)`                 | `rels.update(id, inversePatch, v+1)`         | Snapshot current DTO; inverse is full field revert                |
| Toggle identifying true→false | `rels.update(id, {isIdentifying:false}, v)` | `rels.update(id, {isIdentifying:true}, v+1)` | Server handles propagate/unwind symmetrically                     |
| Create attribute              | `attrs.create(e, input)`                    | `attrs.remove(e, attrId)`                    | Simple                                                            |
| Delete attribute              | `attrs.remove(e, id)`                       | `attrs.create(e, capturedPayload)`           | Capture full DTO before delete                                    |
| Update attribute              | `attrs.update(e, id, patch)`                | `attrs.update(e, id, inversePatch)`          | Snapshot current                                                  |
| Reorder attributes            | `attrs.reorder(e, newOrder)`                | `attrs.reorder(e, previousOrder)`            | Capture old order                                                 |
| Create entity                 | `ent.create(input)`                         | `ent.remove(created.id, {cascade: true})`    | Simple                                                            |
| Delete entity (cascade)       | `ent.remove(id, {cascade:true})`            | ⚠️ **NOT UNDOABLE in MVP** — see §3          | Too many side effects to replay                                   |
| Update entity                 | `ent.update(id, patch)`                     | `ent.update(id, inversePatch)`               | Snapshot current                                                  |
| Flip notation                 | `notation.set(next)`                        | `notation.set(previous)`                     | Trivial                                                           |
| Move node (drag)              | `canvas.save({positions:new})`              | `canvas.save({positions:previous})`          | Capture previous positions before drag end                        |

### §3 — entity delete NOT undoable in MVP

Entity delete cascades to attributes, relationships, layer_links,
canvas positions, audit rows. Replay would require either (a)
soft-delete (tombstones) across the whole schema, or (b) a restore-
from-snapshot endpoint that re-creates all dependents with original
IDs. Both are multi-night investments.

**MVP behaviour:** entity delete BYPASSES the undo stack. Users get
the existing `CascadeDeleteDialog` as their confirmation. Record a
TODO to land soft-delete + undo in a dedicated post-Step-6 patch.
Document the limitation in `docs/model-studio/relationships.md` under
"Known limitations".

### Keyboard + UI affordances

- `⌘Z` (Mac) / `Ctrl+Z` (Windows) — undo
- `⌘⇧Z` / `Ctrl+Shift+Z` — redo
- Canvas header buttons: `↶ Undo` (disabled when stack empty) +
  `↷ Redo` (disabled when redo stack empty). Tooltip shows the
  label of the next action ("Undo: Create relationship").
- Visual feedback: when an action undoes/redoes, briefly flash the
  affected node/edge with the amber shimmer (reuse D-R1 effect).

### Stack size + eviction

- Cap stack at 50 entries. Oldest commands drop silently when over.
- Navigating away from a model clears both stacks (no cross-model undo).

### Error handling

- If a forward throws (server 500, 409, validation), **do NOT push
  onto the stack**. Surface the error as normal.
- If an inverse throws during undo (e.g. server state drift), show
  toast "Undo failed — server state changed" + **clear the undo
  stack** (can't guarantee subsequent undos are valid).

### File inventory

- **NEW** `packages/client/src/hooks/useUndoStack.ts` — the stack
  hook. Singleton per-model via context.
- **NEW** `packages/client/src/components/model-studio/UndoRedoButtons.tsx`
  — canvas-header buttons + keyboard handler.
- **NEW** `packages/client/src/hooks/__tests__/useUndoStack.test.ts`
  — push/undo/redo/clear + capacity + failure rollback.
- **EXT** `packages/client/src/components/model-studio/ModelStudioCanvas.tsx`
  — wrap `rels.create/update/remove`, `ent.create/update`, `attrs.*`,
  `canvas.save` (drag-end), `notation.set` through `undo.execute(...)`.
  Mount `<UndoRedoButtons />` in the header alongside NotationSwitcher
  / Tidy / Orphan dots / Infer rels.
- **EXT** `packages/client/src/components/model-studio/EntityEditor.tsx`
  — `onUpdate`, `onAttributeCreate/Update/Delete/Reorder` all flow
  through the shared undo stack (via a provider `useUndoStack` in the
  tree).
- **NEW TODO in `tasks/todo.md`** — "Step 6.1: entity-delete undo via
  soft-delete/restore". Post-Step-6 patch.

### Tests (lock-in)

- 5 unit tests on `useUndoStack`: push + undo, undo + redo, cap at 50,
  inverse-throws clears stack, clear-on-model-change.
- 3 integration hooks: `useRelationships.create` via undo wrapper →
  undo → rel gone; `useAttributes.reorder` via undo wrapper → undo →
  original order; identifying-toggle → undo → propagated attrs gone.
- Playwright E2E (adds to the 3C agreement for #7 test scope):
  create rel → ⌘Z → rel removed; flip notation → ⌘Z → back to original.

---

## 3. Agent dispatch plan (parallel where file-conflict-safe)

Canvas-touching work serialises: **D → C → A**. Everything else runs
in parallel.

```
Wave 1 (fully parallel):
├── Agent B  — trivial fixes (#1, #4, #5)
│              ModelStudioDetailPage.tsx, shared schemas,
│              .env, docs/, routes.ts kill-switch check
├── Agent E  — seed-step6-showcase script (#7)
│              packages/server/src/scripts/,
│              packages/server/package.json (scripts.db:seed-…)
└── Agent F  — Playwright isolatedTest fixture rescue + drag/flip
               + cardinality-symbol E2E cases
               packages/client/tests/e2e/

Wave 2 (serial on ModelStudioCanvas.tsx):
└── Agent D  — split canonicalNodes into structural+positional (#3)
   └── Agent C — getSmoothStepPath + glyph positioning (#2) +
                 self-ref arc visibility (#6)
       └── Agent A — undo/redo core + integration
```

All agents:

- Read this addendum AND `tasks/alignment-step6.md` before any edit.
- No `catch (e: any)`. No `console.log`. No new npm deps (all existing).
- Every new function → unit test. Every new UI surface → at least a
  smoke test + a Playwright visual.
- Match existing style (indentation, import order, zod schema
  layout, pino logging).
- Report ≤250 words per agent when done.

---

## 4. Verification gate before commit

```
pnpm -C packages/shared build
pnpm -C packages/shared test
pnpm -C packages/server build
pnpm -C packages/server test
pnpm -C packages/client build
pnpm -C packages/client test            # expect snapshots updated if #2/#6 changed glyphs
pnpm -C packages/client exec playwright test tests/e2e/model-studio-relationships.spec.ts
# Manual Playwright visual sanity check — glyphs visible, self-ref arc visible,
# drag persists, pan smooth, notation flip works without toast.
```

All must pass.

---

_Addendum locked 2026-04-21._
