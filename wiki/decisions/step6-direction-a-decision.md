---
title: Step 6 Direction A + BK/AK Alignment
category: decision
created: 2026-04-29
updated: 2026-04-29
related: [[step6-decision]], [[relationships-feature]]
---

Locked decisions for Step 6 Direction A visual shift (JetBrains Mono typography, dot canvas background, entity-card rework) + Business Key / Alt Key first-class feature (alt_key_group column, lint, normalizer).

# Step 6 — Direction A + Business Key/Alt Key alignment

> **Every agent on this wave MUST read this file AND
> `tasks/alignment-step6.md` AND `tasks/alignment-step6-patch.md`
> before writing code.** This is the source of truth for the
> Direction A visual shift + BK/AK first-class feature.

**Branch:** `feature/model-studio-step6-relationships` (4 commits
ahead of `main`).
**Mode:** cathedral / EXPANSION. Target: senior CDMP practitioner
evaluator who has lived in Erwin / ER Studio / PowerDesigner for 15+
years. See `user_target_market.md` memory.
**Goal:** a working demo that a senior data modeller takes seriously.

---

## 1. Locked decisions (from plan-eng-review)

### Schema (3 migrations, all via `runOnce`)

1. `add-attributes-alt-key-group` — `ALTER TABLE data_model_attributes
ADD COLUMN IF NOT EXISTS alt_key_group VARCHAR(10) NULL` +
   `CREATE INDEX` on `(data_model_id, alt_key_group)` partial where
   `alt_key_group IS NOT NULL`.
2. `add-relationships-inverse-name` — `ALTER TABLE
data_model_relationships ADD COLUMN IF NOT EXISTS inverse_name
VARCHAR(128) NULL`.
3. `add-entities-display-id` — `ALTER TABLE data_model_entities ADD
COLUMN IF NOT EXISTS display_id VARCHAR(20) NULL` + backfill
   existing rows per model via a monotonic `E001`, `E002`, `…`
   sequence.

### Normalizer + lint

- `normalizeAttributeFlags` extended: if `altKeyGroup` is set,
  coerce `isNn=true` + `isUq=true` (composite UQ is enforced at the
  service level — one UNIQUE constraint across columns sharing the
  same group). PK + BK coexistence is allowed (natural PK = natural
  BK, e.g. ISBN).
- `lintAttribute` / `lintEntity` — NEW warning when:
  - entity has a surrogate PK (`is_pk=true` on a UUID/integer column)
    AND zero attributes with `alt_key_group` set. Message: "Entity
    lacks a business key — the conceptual layer will have no
    human-recognisable identifier. Consider flagging at least one
    column as an alt key (AK1)."

### Client — Direction A visual

- **Typography:** Bundle **JetBrains Mono** woff2 (regular +
  medium + semibold) under `packages/client/public/fonts/` or via
  Vite asset import. `@font-face` rules in `src/index.css`. CSS
  custom property `--font-mono` exposed. Entity names: display
  semibold sans (keep Tailwind default or Inter — free fallback).
  Attribute names/types/flags: `font-mono` Tailwind class driven by
  the custom property.
- **Canvas background:** swap `<Background variant={BackgroundVariant.Lines}>`
  → `BackgroundVariant.Dots` in `ModelStudioCanvas`. Use dot colour
  matching the existing background with ~20% opacity.
- **Entity card rework (EntityHeader + AttributeFlagCell):**
  - Header: entity name in layer-appropriate casing (see
    `casingForLayer`), subtle display-id (`E001`) top-right in
    10px muted-grey monospace, **remove the "P" layer chip** AND
    **remove the "no business name" placeholder** (if
    `businessName` is empty, render nothing).
  - Attribute row grid: `| name | type | flags |` fixed columns.
    Mono font throughout.
  - Flag column shows text codes:
    - `PK` (amber)
    - `FK` (teal)
    - `AK1`, `AK2`, `…` (mustard — one per alt_key_group)
    - `NN` (muted)
    - `UQ` (muted)
      Codes appear in that order, separated by single space.
  - **Conceptual-layer branch:** on `layer === 'conceptual'`, the
    primary-identifier indicator is the BK (AK1 if present), NOT
    the surrogate PK. Surrogate PK rows (UUID / integer with no
    business meaning) can be hidden when BK exists. Show BK with
    🔑 icon instead of PK.

### Client — RelationshipEdge

- **Line stroke:** `strokeWidth: rel.isIdentifying ? 2.25 : 1.4`
  (was 1.25 for both).
- **Cardinality text labels:** `formatCardinalityText(card, notation)`
  text next to each endpoint glyph, 10px monospace muted.
  - IE notation: `1..1`, `0..1`, `1..*`, `0..*`, `1..1` (Erwin format).
  - IDEF1X notation: `Z` (zero-or-more), `P` (one-or-more),
    `M` (one-to-many), `1` (exactly one).
- **Verb phrases:** read `rel.name` (forward) + `rel.inverseName`
  (inverse). Render forward verb centre-source half of the line,
  inverse verb centre-target half. Fall back to a single centred
  label if only one is set.
- **Self-ref geometry:** **3-segment orthogonal loop on the right
  side of the entity** (Erwin convention):
  - Route source → `right-top`, target → `right-bottom` handles.
  - Requires splitting the current `right` handle into two:
    `right-top` (source) at y=top+40%, `right-bottom` (target) at
    y=top+60%. The existing `right` handle id is reused as
    `right-top` for source, and a new `right-bottom` handle is
    added as target.
  - Path: from (sourceX, sourceY) → straight right 30px → up/down
    connecting the two Y values with a step → back left 30px → end
    at (targetX, targetY). SVG path commands: `M`, `L`, `L`, `L`.
  - Glyphs at both ends on the right edge, pointing outward.
  - Label centred inside the loop (in the `bulge` corridor).

### Client — Attribute editor

- `AttributeGrid` gets a new column `AK` showing `AK1/AK2/…` or
  empty. Click opens an inline dropdown.
- `AttributePropertyEditor` General tab: new field "Alt Key Group"
  — a dropdown (`None`, `AK1`, `AK2`, `AK3`, `New group…`). New
  group increments to the next unused group in the entity.

### Audit formatter

- Extend phrases:
  - `"Flagged <attr.name> as AK1"` / `"Moved <attr.name> from AK1 to AK2"`
  - `"Cleared alt-key-group on <attr.name>"`
  - `"Set inverse verb phrase to 'is_managed_by'"`
  - `"Assigned display id E007 to <entity.name>"`

---

## 2. Shared utilities (new)

### `packages/shared/src/utils/layer-casing.ts`

```ts
export function casingForLayer(name: string | null | undefined, layer: Layer): string {
  if (!name) return '';
  const trimmed = name.trim();
  switch (layer) {
    case 'physical':
      return trimmed.toLowerCase(); // snake_case preserved
    case 'logical':
      return titleCase(trimmed);
    case 'conceptual':
      return sentenceCase(trimmed);
    default:
      return trimmed;
  }
}
```

Unit tests: 6+ cases covering all three layers and edge cases
(empty, null, already-cased, mixed).

### `packages/shared/src/utils/cardinality-text.ts`

```ts
export function formatCardinalityText(card: Cardinality, notation: Notation): string {
  if (notation === 'ie') {
    return IE_TEXT[card]; // '1..1', '0..1', '1..*', '0..*', '1..*'
  }
  // IDEF1X federal-standard letters
  return IDEF1X_TEXT[card]; // 'Z', 'P', 'M', '1'
}
```

Unit tests: 10 cases (5 cardinalities × 2 notations).

---

## 3. File inventory

| File                                                                      | Agent | Action                                                                                                     |
| ------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| `packages/server/src/db/schema.ts`                                        | α     | 3 column additions                                                                                         |
| `packages/server/src/db/migrations/step6-direction-a.ts`                  | α     | NEW — 3 migration fns                                                                                      |
| `packages/server/src/services/admin.service.ts`                           | α     | 3 new `runOnce` calls                                                                                      |
| `packages/server/src/services/model-studio-attribute-flags.ts`            | α     | BK normaliser extension                                                                                    |
| `packages/shared/src/utils/naming-lint.ts`                                | α     | New `lintEntityForBusinessKey` export                                                                      |
| `packages/server/src/services/model-studio-attribute.service.ts`          | α     | accept altKeyGroup on create/update                                                                        |
| `packages/server/src/services/model-studio-relationship.service.ts`       | α     | accept inverseName on create/update                                                                        |
| `packages/server/src/services/model-studio-entity.service.ts`             | α     | generate display_id on create                                                                              |
| `packages/shared/src/utils/model-studio.schemas.ts`                       | α     | add altKeyGroup, inverseName, displayId fields                                                             |
| `packages/client/public/fonts/JetBrainsMono-*.woff2`                      | β     | NEW — bundled fonts (Regular, Medium, SemiBold)                                                            |
| `packages/client/src/index.css`                                           | β     | `@font-face` + `--font-mono` variable                                                                      |
| `packages/client/tailwind.config.ts`                                      | β     | extend font family with mono var                                                                           |
| `packages/client/src/components/model-studio/ModelStudioCanvas.tsx`       | β + γ | β: dot-grid swap. γ: right-bottom handle routing for self-ref                                              |
| `packages/shared/src/utils/layer-casing.ts`                               | β     | NEW                                                                                                        |
| `packages/shared/src/utils/cardinality-text.ts`                           | β     | NEW                                                                                                        |
| `packages/shared/src/__tests__/layer-casing.test.ts`                      | β     | NEW                                                                                                        |
| `packages/shared/src/__tests__/cardinality-text.test.ts`                  | β     | NEW                                                                                                        |
| `packages/client/src/components/model-studio/RelationshipEdge.tsx`        | γ     | cardinality-text, verb phrases, thicker identifying, 3-segment self-ref                                    |
| `packages/client/src/components/model-studio/EntityNode.tsx`              | δ     | extract into composer; kill P chip + "no business name"; consume `casingForLayer`; add right-bottom handle |
| `packages/client/src/components/model-studio/EntityHeader.tsx`            | δ     | NEW — layer-cased name + display_id                                                                        |
| `packages/client/src/components/model-studio/AttributeFlagCell.tsx`       | δ     | NEW — PK / FK / AK1 / NN / UQ badges                                                                       |
| `packages/client/src/components/model-studio/AttributeGrid.tsx`           | δ     | new AK column                                                                                              |
| `packages/client/src/components/model-studio/AttributePropertyEditor.tsx` | δ     | AK picker in General tab                                                                                   |
| `packages/client/src/components/model-studio/RelationshipPanel.tsx`       | δ     | inverseName input next to name                                                                             |
| `packages/client/src/lib/auditFormatter.ts`                               | δ     | new phrases                                                                                                |

---

## 4. Non-negotiables for every agent

- **`tasks/lessons.md` #25, #30, #31** still apply.
- No `catch (e: any)`. No `console.log`.
- No new deps except bundled font files + tailwind config extension.
- Every new pure function → unit test. Every new UI → smoke test.
- Verify BUILD + TESTS green before reporting done.
- DO NOT commit — I (orchestrator) will commit at the end.
- **Playwright visual verification is MINE** — agents don't run
  Playwright; I will verify the combined result at the end.

---

## 5. Verification gate (orchestrator runs)

Before I commit:

```
pnpm -C packages/shared build + test      (expect 109 + N shared tests)
pnpm -C packages/server  build + test     (expect 220 + N server tests)
pnpm -C packages/client  build + test     (expect 128 + N client tests)
Playwright run                             (expect ≥ 9 green)
Playwright visual probe: entity card, rel edge, self-ref, dot-grid
```

All pass → ask Rob to push.

---

_Locked 2026-04-21. Execution: Wave 1 (α + β parallel), Wave 2 (γ + δ parallel after β)._
