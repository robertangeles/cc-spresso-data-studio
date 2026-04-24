# Step 7 — Layer Linking API Reference

New HTTP surface added under `/api/model-studio/*` for cross-layer entity
projections, attribute-level projections, auto-projection scaffold, chain
resolution, coverage matrix, and name-match suggestions.

All routes:

- Gated by the existing `enable_model_studio` feature flag (`featureFlagGate`)
- Authenticated via `authenticate` middleware
- Authorised via `assertCanAccessModel(userId, modelId)` inside each service
- Bodies + query params validated by `zod` schemas in
  [`packages/shared/src/utils/model-studio.schemas.ts`](../../packages/shared/src/utils/model-studio.schemas.ts),
  all `.strict()` per [lesson L26](../../tasks/lessons.md)
- Errors mapped to HTTP by the shared `errorHandler`; every service throws
  an `AppError` subclass carrying its own status code
- Audit rows written to `data_model_change_log` on every mutation

## Layer links (entity level)

| Method | Path                                                                             | Purpose                                    | Status |
| ------ | -------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| GET    | `/api/model-studio/models/:id/layer-links?parentId=...` OR `?childId=...`        | List projections from or to a given entity | 200    |
| GET    | `/api/model-studio/models/:id/layer-links/suggestions?fromLayer=...&toLayer=...` | EXP-3 name-match auto-link candidates      | 200    |
| POST   | `/api/model-studio/models/:id/layer-links`                                       | Create a new layer link                    | 201    |
| DELETE | `/api/model-studio/models/:id/layer-links/:linkId`                               | Remove a layer link                        | 204    |

**Invariants:**

- `parent` and `child` must belong to the same model.
- `parent.layer` must differ from `child.layer`.
- Adding the edge must not create a cycle (BFS via
  [`link-graph.utils.ts`](../../packages/server/src/utils/link-graph.utils.ts)).
- Unique on `(parentId, childId)`.
- Cycle check + insert run inside a `SERIALIZABLE` transaction with 3x retry
  on `40001` — see
  [`serializable-tx.ts`](../../packages/server/src/utils/serializable-tx.ts).

**Error codes:**

- `400` — self-loop, same-layer, cross-model, cycle
- `404` — entity or link not found
- `409` — unique-violation, or retries exhausted ("please retry")
- `500` — unexpected DB failure

## Attribute links (column level)

Mirror of the layer-link routes at the attribute grain.

| Method | Path                                                                          | Purpose |
| ------ | ----------------------------------------------------------------------------- | ------- |
| GET    | `/api/model-studio/models/:id/attribute-links?parentId=...` OR `?childId=...` | List    |
| POST   | `/api/model-studio/models/:id/attribute-links`                                | Create  |
| DELETE | `/api/model-studio/models/:id/attribute-links/:linkId`                        | Remove  |

**Extra invariant:** the two attributes' owning entities must be on different
layers (attribute layer is inherited from its entity). Otherwise identical
error matrix to layer-links.

## Projection

| Method | Path                                                               | Purpose                               | Status |
| ------ | ------------------------------------------------------------------ | ------------------------------------- | ------ |
| POST   | `/api/model-studio/models/:id/entities/:entityId/project`          | Scaffold a projection on target layer | 201    |
| GET    | `/api/model-studio/models/:id/entities/:entityId/projection-chain` | Resolve the full connected component  | 200    |

**Scaffold request body:** `{ toLayer: 'conceptual' | 'logical' | 'physical', nameOverride?: string }`

**DMBOK-aligned transformation:**

- **Conceptual → Logical:** scaffold entity shell + carry ONLY business-key
  attributes (non-null `altKeyGroup`). `dataType` is cleared for the user to
  fill in. `attribute_links` auto-created for carried attrs.
- **Logical → Physical:** full clone of entity + all attributes preserving
  types, flags, classification, `altKeyGroup`, default values, ordinal
  position. `attribute_links` auto-created for every cloned attr.
- **Conceptual → Physical:** rejected with `400` — two-hop projection is
  not supported. Users project conceptual→logical, then logical→physical.
- **Any reverse direction (e.g. physical → logical):** rejected with `400`.
  For reverse-engineering, users link existing entities manually via
  `POST /layer-links`.

The entire flow runs in ONE `SERIALIZABLE` transaction. Any failure rolls
back the new entity, cloned attrs, layer_link, and attribute_links. Audit
rows are written after commit, one per inserted row.

**Chain response shape (adjacency list):**

```json
{
  "rootId": "uuid",
  "nodes": [
    {
      "entityId": "uuid",
      "entityName": "Customer",
      "layer": "conceptual",
      "parentIds": [],
      "childIds": ["uuid"]
    }
  ]
}
```

Walks BOTH directions (up via parents, down via children), capped at
`maxDepth=3` for the three-layer model. Defensive against cycles —
terminates even if a cycle somehow slipped past the write-time guard.
Multi-parent and multi-child DAGs are legitimate shapes (one logical
entity projected from two conceptual parents, or projected to two
physical children for a partitioned fact table).

## Layer coverage matrix

| Method | Path                                          | Purpose                     |
| ------ | --------------------------------------------- | --------------------------- |
| GET    | `/api/model-studio/models/:id/layer-coverage` | Per-entity `{c,l,p}` matrix |

Single endpoint consumed by:

- **S7-C6** — coverage badges on entity cards
- **EXP-5** — overlay-mode column sort (sort by projection-coverage desc)
- **EXP-6** — unlinked-entity amber glow decorator

Closes the N+1 gap — without this route each feature would round-trip per
entity to compute coverage.

**Semantics:** direct (one-hop) coverage, not transitive. For each entity E:

- `coverage[E.id][E.layer] = true` (self)
- For every link where E is parent or child: mark the neighbour's layer
  `true` on E's cell

**Response:**

```json
{
  "coverage": {
    "uuid-of-entity-A": {
      "conceptual": true,
      "logical": true,
      "physical": false
    }
  }
}
```

## Related files

| File                                                                                                                                                 | Purpose                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`packages/server/src/services/model-studio-layer-links.service.ts`](../../packages/server/src/services/model-studio-layer-links.service.ts)         | layer-link CRUD + cycle-guard                                |
| [`packages/server/src/services/model-studio-attribute-links.service.ts`](../../packages/server/src/services/model-studio-attribute-links.service.ts) | attr-link CRUD + cycle-guard                                 |
| [`packages/server/src/services/model-studio-projection.service.ts`](../../packages/server/src/services/model-studio-projection.service.ts)           | auto-project orchestrator (scaffold + clone + link)          |
| [`packages/server/src/services/model-studio-layer-overview.service.ts`](../../packages/server/src/services/model-studio-layer-overview.service.ts)   | coverage matrix + name-match suggestions                     |
| [`packages/server/src/utils/link-graph.utils.ts`](../../packages/server/src/utils/link-graph.utils.ts)                                               | pure `detectCycle` BFS + `resolveChain` adjacency walk       |
| [`packages/server/src/utils/serializable-tx.ts`](../../packages/server/src/utils/serializable-tx.ts)                                                 | `runSerializable(db, fn)` — SERIALIZABLE + 3x retry on 40001 |
| [`packages/shared/src/utils/model-studio.schemas.ts`](../../packages/shared/src/utils/model-studio.schemas.ts)                                       | zod schemas for every request body + response shape          |
| [`tasks/alignment-step7.md`](../../tasks/alignment-step7.md)                                                                                         | Step 7 development brief with review addenda                 |
