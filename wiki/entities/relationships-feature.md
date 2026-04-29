---
title: Model Studio Relationships
category: entity
created: 2026-04-29
updated: 2026-04-29
related: [[spresso-data-studio]], [[feature-flag-system]], [[step6-decision]], [[step6-direction-a-decision]], [[step6-patch-decision]]
---

Step 6 Relationships feature: typed edges between entities with IE / IDEF1X notation, identifying-rel PK propagation, FK <-> rel sync, infer-from-FK-graph, cascade-delete, Mermaid export.

# Relationships (Step 6) — user guide + ops runbook

**Status:** shipped 2026-04-20 (Step 6, feature-flag gated).
**Feature flag:** `MODEL_STUDIO_RELATIONSHIPS_ENABLED` (see
[feature-flags.md](./feature-flags.md)).

This doc has two audiences: **data modellers** using the Model Studio
canvas, and **operators** running the backend.

---

## For data modellers

### What a relationship is

A relationship is a typed edge between two entities, carrying:

- **Source + target entities** (same model, same layer — no cross-layer
  edges; cross-layer linking happens through `layer_links` in Step 7).
- **Source + target cardinalities**, one each from
  `one | many | zero_or_one | zero_or_many | one_or_many`.
- **`isIdentifying`** boolean — see [Identifying rels](#identifying-rels) below.
- **Name** (optional, ≤ 128 chars, naming-lint hints apply on physical).
- **Metadata** (JSONB, ≤ 4 KB, no reserved keys).

Relationships render on the canvas in your chosen **notation**:

- **IE** (information engineering, default) — crow's feet, bars, open circles.
- **IDEF1X** — bars, filled circles, open circles.

### Drawing a relationship

1. Hover either entity — the handles appear on each side (top / bottom
   / left / right at entity level; additional per-attribute handles on
   FK and PK rows).
2. Click and drag from a source handle to a target handle.
3. The system auto-infers cardinality from Step 5 attribute flags:
   `UQ + NN` → `1`, nullable UQ → `0..1`, not-unique NN → `1..*`,
   not-unique nullable → `0..*`.
4. Open the **relationship panel** (click the edge) to adjust name,
   cardinalities, identifying flag, governance.
5. The audit tab shows a plain-English history of every change (e.g.
   "Changed cardinality from many → one", "Marked as identifying",
   "Propagated 2 composite PK attributes: customer_id, region_id").

### Identifying rels

Setting **`isIdentifying=true`** does the real DMBOK / Erwin thing — it
**propagates the source entity's PK attributes into the target as a
composite identifying FK**, inside a single database transaction.

- Unsetting `isIdentifying=true` unwinds those propagated attributes in
  the same transaction.
- If propagation would create a name collision on the target, the whole
  operation rolls back — no orphan state.
- Cyclic identifying paths (A→B→C→A) are rejected with a clear error.

### Self-referential rels

A rel with the same source and target entity (e.g.
`employee.manager_id → employee.id`) is supported and renders as a
**quarter-circle arc loop** in the top-right corner of the entity node.

### Notation switcher

The **IE / IDEF1X** toggle in the canvas header is **per-user** and
**per-model** — two users viewing the same model can choose different
notations. The preference persists in `data_model_canvas_states.notation`.

A `BroadcastChannel` keeps all canvas tabs in sync for the same user —
flip in tab A, tab B reflects it immediately.

### Cascade-delete

Deleting an entity that participates in `N` relationships opens a
**CascadeDeleteDialog** listing every affected rel. Confirming removes
the entity and the rels in a single transaction. The dialog re-queries
on confirm, so if another user added a rel while you were reading the
list, you get a delta message ("2 more rels since you opened this
dialog — review?").

### FK ↔ Rel sync

Marking an attribute as `isFk=true` in the attribute editor surfaces
a non-blocking amber toast:

> **"Create relationship to `<inferred target>`? ⌘↵"**

Press ⌘↵ to accept (creates the rel with inferred cardinality) or
dismiss to ignore. The system **never auto-writes** — you're always in
control.

Deleting a rel that was backed by an FK flag surfaces the inverse
toast: "Also clear FK flag on `orders.customer_id`? ⌘↵".

### Right-click edge menu

Right-click any edge for:

- **Rename** (inline input)
- **Flip direction**
- **Toggle identifying**
- **Copy cardinality** (clipboard, formula-injection-safe via
  `escapeClipboardCell`)
- **Delete**

### "Infer from FK graph"

The **Infer rels** canvas-header button opens a review panel that walks
every attribute flagged `isFk=true` in the model and proposes a
relationship with auto-inferred cardinality and confidence. Accept
per-proposal or bulk-accept. On models with >2000 attributes the call
runs as a background job — the panel polls every 2 s until done.

### Delights

- **Shimmer on create** — new edges pulse amber for 1.5 s.
- **Hover pulse** — hovering an edge highlights both endpoint entities.
- **Viewport preserve** — flipping notation does NOT reset zoom/pan.
- **Orphan badge** — entities with 0 rels get an amber dot. Toggle via
  the canvas header checkbox (per-user preference, synced across tabs).
- **Tidy** — the `⌘⇧T` / Tidy button runs `@dagrejs/dagre` LR layout
  and cleanly reroutes all edges. Non-destructive (only positions change).

---

## For operators

### Feature flag

`MODEL_STUDIO_RELATIONSHIPS_ENABLED=true` enables:

- 5 CRUD routes: `POST / GET / PATCH / DELETE /api/model-studio/models/:id/relationships(/:relId)`
- `POST /api/model-studio/models/:id/relationships/infer`
- `GET /api/model-studio/models/:id/entities/:entityId/impact`
- `GET /api/model-studio/admin/model-studio/models/:id/relationships/diagnostics` (org-admin only)
- `GET /api/model-studio/admin/model-studio/models/:id/relationships/explain` (Mermaid ER, org-admin only)

Off (or unset): all of the above return 404 — existence hidden from
unauthorised callers.

### Rollout order

1. Migrate DB (two additive `runOnce` migrations — `add-canvas-states-notation-column`
   and `add-relationships-version-and-indexes` — apply on server boot,
   idempotent, `IF NOT EXISTS` defense-in-depth).
2. Deploy server + client with flag = `false`.
3. Smoke-test unrelated routes to confirm nothing regressed.
4. Flip flag = `true` in the Render env.
5. Watch metrics — `model_studio_rels_tx_rollbacks_total` should stay
   near zero; spike => investigate via diagnostics endpoint.

### Rollback

- **Fast rollback (< 2 min):** flip `MODEL_STUDIO_RELATIONSHIPS_ENABLED=false`
  in Render env, client + server re-gate within the next poll. Existing
  rel rows remain in DB (no data loss).
- **Full code rollback (< 15 min):** `git revert <merge-commit>`, push.
  Migrations are additive (new column, new indexes) and NOT reverted —
  next ship can re-enable.

### Diagnostics endpoint

```
GET /api/model-studio/admin/model-studio/models/:id/relationships/diagnostics
```

Returns:

```json
{
  "success": true,
  "data": {
    "orphans": [
      {
        "attributeId": "...",
        "attributeName": "customer_id",
        "propagatedFromRelId": "<rel-id-that-no-longer-exists>"
      }
    ]
  }
}
```

An **orphan propagated attribute** is a row in `data_model_attributes`
whose `metadata.propagated_from_rel_id` points at a rel that no longer
exists. This indicates a past transactional bug in identifying-rel
unwind. Expected count: **0** under normal operation. Non-zero =
investigate.

### Mermaid ER export

```
GET /api/model-studio/admin/model-studio/models/:id/relationships/explain
```

Returns a `{ mermaid: string }` payload with the full model as a Mermaid
`erDiagram`. Paste into docs / runbooks / Slack.

### Observability

Structured pino logs on every mutation:

- `relationship.create` — `modelId`, `userId`, `sourceId`, `targetId`, `identifying`, `durationMs`
- `relationship.update` — diff + old/new version
- `relationship.delete` — `wasIdentifying`, `propagatedAttrsRemoved`
- `relationship.propagate` — `attrsAdded[]`
- `relationship.cycleReject` — `path=A→B→C→A`
- `relationship.txRollback` — `reason`, `conflictAttrName`

Key metrics (even if they live only in-process for MVP):

- `model_studio_rels_created_total{identifying}`
- `model_studio_rels_deleted_total`
- `model_studio_rels_version_conflicts_total`
- `model_studio_rels_tx_rollbacks_total{reason}`
- `model_studio_rels_propagation_count` (histogram)

### Runbook

| Symptom                                         | Likely cause                             | Action                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Users see "Relationship already exists"         | Unique-triple index firing (expected)    | No action — this is the 409 on duplicate contract (S6-E4 flow).                                                           |
| 409 `VERSION_CONFLICT` spike                    | Two users editing the same rel           | Informational. Slack if sustained > 20/min.                                                                               |
| `tx_rollbacks_total` spike                      | Propagation failure mid-TX               | Check logs for `relationship.txRollback` reason. Inspect diagnostics.                                                     |
| Orphan propagated attrs reported by diagnostics | Past propagation bug                     | Manual cleanup via SQL: `DELETE FROM data_model_attributes WHERE metadata->>'propagated_from_rel_id' = :id`. Post-mortem. |
| Canvas slow on models > 3k rels                 | No viewport culling yet (Step 11 polish) | Tracked in `tasks/todo.md` — ship viewport-cull in polish phase.                                                          |
| `/infer` times out on large models              | Synchronous path only for ≤ 2000 attrs   | Expected — server returns 202 + jobId for larger models.                                                                  |

### Known limitations (Step 6 only)

- **No SSE / WebSocket live updates.** MVP polls. Two users editing the
  same model see each other's changes on refresh / mutation response.
- **No viewport culling.** React Flow renders every edge; models > 3k
  rels may lag.
- **Playwright E2E suite is mostly `.fixme`.** Unit + integration
  coverage is comprehensive (449 tests); E2E is a follow-up — see
  `tasks/todo.md`.
- **No ⌘R keyboard-draw handler yet.** Canvas drawing is mouse-only in
  Step 6. Keyboard handler ships in a follow-up.

---

## Related

- [feature-flags.md](./feature-flags.md) — all Model Studio feature flags
- [../../tasks/alignment-step6.md](../../tasks/alignment-step6.md) — full
  decision ledger for this Step
- [../../tasks/test-plan-model-studio.md](../../tasks/test-plan-model-studio.md#step-6--relationships--notations) —
  37 Step-6 test cases
