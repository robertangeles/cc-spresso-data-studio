# Test Plan: Model Studio MVP

**Feature:** Data modelling studio with ERD canvas, three layers (conceptual/logical/physical), two notations (IE/IDEF1X), DDL export (Snowflake/SQL Server/Postgres), semantic-layer bridge, AI chat with RAG, and 10 committed delights (D1-D10).

**Branch:** `feature/model-studio-mvp`
**Date:** 2026-04-19
**Status:** Pre-implementation — test plan is a deliverable per lesson 25.
**Alignment doc:** [alignment-model-studio.md](alignment-model-studio.md) — read before executing any test.

---

## Architecture Decisions (from CEO Review)

- In-monorepo build (Express + Drizzle + Vite + React Flow v12)
- AI context: RAG-first + opt-in "Deep analyze"
- Embeddings: debounced 3s + batched via `embedding_jobs` table
- Org scoping: `org_id` + `owner_id` on `models` from day one
- Feature flag: `enable_model_studio` (default OFF)
- All 10 delights D1-D10 in MVP
- Terminology: "synthetic data", not "fake data"

---

## Test categories

| Priority | Meaning                                     |
| -------- | ------------------------------------------- |
| P1       | MUST pass before step is marked done        |
| P2       | SHOULD pass; may defer to post-merge polish |
| P3       | Nice-to-have; track in todo                 |

---

## STEP 1 — Scaffold, schema, feature flag

### Unit — Zod schemas (shared/src/schemas/model-studio)

| ID     | Test                                                    | Input                                          | Expected           | Priority |
| ------ | ------------------------------------------------------- | ---------------------------------------------- | ------------------ | -------- |
| S1-U1  | `modelCreateSchema` accepts valid body                  | `{ name:"Customer Domain", orgId:<uuid> }`     | parses OK          | P1       |
| S1-U2  | Rejects empty name                                      | `{ name:"", orgId:<uuid> }`                    | ZodError on `name` | P1       |
| S1-U3  | Rejects whitespace-only name                            | `{ name:"   ", orgId:<uuid> }`                 | ZodError           | P1       |
| S1-U4  | Rejects name > 200 chars                                | 201-char name                                  | ZodError           | P1       |
| S1-U5  | Rejects description > 10k chars                         | 10001-char description                         | ZodError           | P1       |
| S1-U6  | Rejects non-uuid orgId                                  | `{ name:"x", orgId:"not-a-uuid" }`             | ZodError           | P1       |
| S1-U7  | `entityCreateSchema` enforces physical-layer name regex | layer=physical, name="1abc"                    | ZodError           | P1       |
| S1-U8  | Allows free-form name for conceptual layer              | layer=conceptual, name="Customer Entity (VIP)" | parses OK          | P1       |
| S1-U9  | `layer` enum                                            | layer="nonsense"                               | ZodError           | P1       |
| S1-U10 | `notation` enum                                         | notation="crows"                               | ZodError           | P1       |

### Unit — New AppError subclasses

| ID     | Test                                                                                       | Expected                                                     | Priority |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------- |
| S1-U11 | `ProviderTimeoutError` has statusCode 504                                                  | `new ProviderTimeoutError('voyage')` → `.statusCode === 504` | P1       |
| S1-U12 | `ProviderUnavailableError` has statusCode 503                                              | 503                                                          | P1       |
| S1-U13 | `NetworkError` has statusCode 502                                                          | 502                                                          | P1       |
| S1-U14 | `AIRefusalError` has statusCode 200 (assistant message still shown) + `refusalReason` prop | 200, `refusalReason === 'safety'`                            | P1       |
| S1-U15 | `InvalidAIResponseError` has statusCode 502 + raw response excerpt                         | 502 with `rawExcerpt`                                        | P1       |
| S1-U16 | `ContextTooLargeError` has statusCode 413                                                  | 413                                                          | P1       |
| S1-U17 | `DBError` has statusCode 500 + `supportCode` short random string                           | 500, `supportCode.length === 8`                              | P1       |
| S1-U18 | `InternalError` has statusCode 500 + `supportCode`                                         | 500                                                          | P1       |
| S1-U19 | `ProviderResponseError` has statusCode 502 + `providerName`                                | 502                                                          | P1       |

### Unit — `zod-validate` middleware

| ID     | Test                                               | Setup                                                  | Expected                                                                           | Priority |
| ------ | -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------- |
| S1-U20 | Valid body passes through                          | mock req body matching schema                          | `next()` called with no args                                                       | P1       |
| S1-U21 | Invalid body throws `ValidationError` with details | mock req body missing required field                   | `next(err)` where `err instanceof ValidationError`, `err.details` has field errors | P1       |
| S1-U22 | `params` validator rejects non-UUID `:modelId`     | `req.params.modelId = "xyz"`                           | `ValidationError`                                                                  | P1       |
| S1-U23 | `query` validator rejects unknown params           | `req.query.foo = "bar"` with schema disallowing extras | `ValidationError` (strict)                                                         | P2       |
| S1-U24 | Nested body validation surfaces path               | `{ entity: { name: "" } }`                             | `details.['entity.name']` populated                                                | P2       |

### Integration — Schema migration

| ID    | Test                                                         | Setup                                        | Expected                                                                                                                                                                                                   | Priority |
| ----- | ------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S1-I1 | pgvector extension enabled                                   | Run `CREATE EXTENSION IF NOT EXISTS vector;` | `SELECT extname FROM pg_extension` includes `vector`                                                                                                                                                       | P1       |
| S1-I2 | All 12 new tables exist after migration                      | Run migration                                | `information_schema.tables` has each: models, entities, layer_links, attributes, attribute_links, relationships, canvas_states, semantic_mappings, model_chat_logs, embeddings, change_log, embedding_jobs | P1       |
| S1-I3 | Every FK has an index                                        | Query `pg_indexes`                           | Every FK column in Model Studio tables has a matching index (CLAUDE.md mandate)                                                                                                                            | P1       |
| S1-I4 | `models` table has composite unique (org_id, owner_id, name) | Query `pg_constraint`                        | Unique constraint present                                                                                                                                                                                  | P1       |
| S1-I5 | `canvas_states` unique on (model_id, user_id, layer)         | Query `pg_constraint`                        | Unique present                                                                                                                                                                                             | P1       |
| S1-I6 | `embeddings` has ivfflat index with cosine ops               | `pg_indexes`                                 | Index exists with `USING ivfflat ... vector_cosine_ops`                                                                                                                                                    | P1       |
| S1-I7 | Cascade delete: delete model → deletes entities              | Insert model + entity, delete model          | Entity gone                                                                                                                                                                                                | P1       |
| S1-I8 | Cascade delete: delete entity → deletes attributes           | Insert entity + attrs, delete entity         | Attrs gone                                                                                                                                                                                                 | P1       |
| S1-I9 | `metadata` defaults to `{}`, `tags` defaults to `[]`         | Insert without those fields                  | Both populated with defaults                                                                                                                                                                               | P1       |

### Integration — Feature flag

| ID     | Test                                                               | Setup                               | Expected                     | Priority |
| ------ | ------------------------------------------------------------------ | ----------------------------------- | ---------------------------- | -------- |
| S1-I10 | `enable_model_studio` key exists in site_settings, default `false` | Query site_settings after migration | Row exists, value is `false` | P1       |
| S1-I11 | `GET /api/site-settings` returns flag value                        | Call endpoint                       | `enable_model_studio: false` | P1       |
| S1-I12 | Admin can toggle flag via existing UI pattern                      | PATCH the flag                      | Next GET returns new value   | P2       |

### Integration — API surface placeholder routes

| ID     | Test                                                              | Setup                       | Expected                            | Priority |
| ------ | ----------------------------------------------------------------- | --------------------------- | ----------------------------------- | -------- |
| S1-I13 | `GET /api/models` returns 404 when flag OFF                       | Flag OFF, authenticated     | 404 (hide existence)                | P1       |
| S1-I14 | `GET /api/models` returns 401 without token                       | Flag ON, no token           | 401                                 | P1       |
| S1-I15 | `GET /api/models` returns 200 with empty array when no models     | Flag ON, auth'd             | `{ models: [] }`                    | P1       |
| S1-I16 | Placeholder routes all respond with correct status codes per spec | See Model Studio routes doc | Each returns 404 or 200 as designed | P1       |

### E2E — Step 1 scaffold

| ID    | Test                                                                                    | Flow                                           | Expected                                         | Priority |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ | -------- |
| S1-E1 | Flag OFF: `/model-studio` shows "Coming soon" stub                                      | Visit page as authenticated user with flag OFF | Stub page renders; no nav entry visible          | P1       |
| S1-E2 | Flag ON: `/model-studio` shows empty-state list page                                    | Toggle flag ON, reload                         | Empty-state list page renders; nav entry visible | P1       |
| S1-E3 | Empty state matches Infection Virus (glow, gradient, inspiring copy, quick-start cards) | Visual check                                   | Matches design standard                          | P1       |
| S1-E4 | tsc clean across all three packages                                                     | `pnpm tsc`                                     | Exit 0                                           | P1       |

---

## STEP 2 — Model CRUD + authorisation

### Unit — `canAccessModel(userId, modelId, role)` helper

| ID    | Test                                              | Setup                                    | Expected                                                       | Priority |
| ----- | ------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- | -------- |
| S2-U1 | Returns true for owner                            | owner calls with role='viewer'           | true                                                           | P1       |
| S2-U2 | Returns true for org member with sufficient role  | non-owner in same org, role >= required  | true                                                           | P1       |
| S2-U3 | Throws ForbiddenError for non-member              | user not in org                          | throws                                                         | P1       |
| S2-U4 | Throws NotFoundError when model doesn't exist     | invalid modelId                          | throws (hide existence — via NotFoundError NOT ForbiddenError) | P1       |
| S2-U5 | Respects role hierarchy (viewer < editor < admin) | viewer calls with role='editor' required | throws                                                         | P1       |

### Unit — `modelService`

| ID     | Test                                                                                         | Setup               | Expected                                                    | Priority |
| ------ | -------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- | -------- |
| S2-U6  | `create` writes row + change_log entry                                                       | call create         | model row exists, change_log has `action='create'`          | P1       |
| S2-U7  | `create` with duplicate (org_id, owner_id, name) throws ConflictError                        | two calls same args | second throws                                               | P1       |
| S2-U8  | `update` increments updated_at, writes change_log with before/after                          | call update         | updated_at newer, change_log has before_state + after_state | P1       |
| S2-U9  | `delete` cascades entities/attrs/rels and writes single change_log entry with cascade marker | model with children | all children gone, one change_log row                       | P1       |
| S2-U10 | `list` scopes to user's orgs + owned                                                         | user in 2 orgs      | returns models from those orgs + owned by user              | P1       |

### Integration — Routes

| ID     | Route                                                | Case                            | Expected                       | Priority |
| ------ | ---------------------------------------------------- | ------------------------------- | ------------------------------ | -------- |
| S2-I1  | `POST /api/models`                                   | Valid body                      | 201 + model payload            | P1       |
| S2-I2  | `POST /api/models`                                   | No auth                         | 401                            | P1       |
| S2-I3  | `POST /api/models`                                   | Invalid body                    | 422 with field errors          | P1       |
| S2-I4  | `POST /api/models`                                   | User not in org                 | 403                            | P1       |
| S2-I5  | `GET /api/models`                                    | Empty                           | 200 `{ models: [] }`           | P1       |
| S2-I6  | `GET /api/models/:id`                                | Valid owner                     | 200 with model                 | P1       |
| S2-I7  | `GET /api/models/:id`                                | Other org's model               | 404 (NOT 403 — hide existence) | P1       |
| S2-I8  | `PATCH /api/models/:id`                              | Valid owner, valid body         | 200 with updated model         | P1       |
| S2-I9  | `DELETE /api/models/:id`                             | Valid owner, model has children | 200 + children gone            | P1       |
| S2-I10 | IDOR test: swap another org's model id in PATCH body | Valid user, other org's id      | 404                            | P1       |

### E2E

| ID    | Flow                                                 | Expected              | Priority          |
| ----- | ---------------------------------------------------- | --------------------- | ----------------- | --- |
| S2-E1 | Create model → appears in list → click → detail page | Full flow             | Works end-to-end  | P1  |
| S2-E2 | Try to access another org's model via direct URL     | Manually edit URL     | 404 page, not 403 | P1  |
| S2-E3 | Delete model with confirmation                       | Click delete, confirm | Removed from list | P1  |

---

## STEP 3 — Canvas + minimap (D7) + canvas_states

### Unit

| ID    | Test                                         | Input                               | Expected         | Priority |
| ----- | -------------------------------------------- | ----------------------------------- | ---------------- | -------- |
| S3-U1 | `canvasStateSchema` rejects NaN in positions | `{ nodeId: { x: NaN, y: 0 } }`      | ZodError         | P1       |
| S3-U2 | `canvasStateSchema` rejects Infinity         | `{ nodeId: { x: Infinity, y: 0 } }` | ZodError         | P1       |
| S3-U3 | Clamps excessive values                      | x=2e6                               | rejected (> 1e6) | P1       |
| S3-U4 | Viewport zoom clamped 0.1-3                  | zoom=5                              | rejected         | P1       |

### Integration

| ID    | Test                                                      | Setup                             | Expected           | Priority |
| ----- | --------------------------------------------------------- | --------------------------------- | ------------------ | -------- |
| S3-I1 | Upsert canvas state persists positions per user per layer | Two users, same model, same layer | Two rows           | P1       |
| S3-I2 | Optimistic lock: write with stale updated_at returns 409  | Two simultaneous writes           | Second returns 409 | P1       |
| S3-I3 | JSONB size >1MB rejected with 413                         | Payload > 1MB                     | 413                | P1       |

### E2E

| ID    | Flow                                                                               | Expected              | Priority                                     |
| ----- | ---------------------------------------------------------------------------------- | --------------------- | -------------------------------------------- | --- |
| S3-E1 | Drag entity → reload page → position restored                                      | Drag, reload          | Position persisted                           | P1  |
| S3-E2 | Minimap renders, click navigates viewport                                          | Interact with minimap | Viewport updates                             | P1  |
| S3-E3 | Minimap colours match layer badges                                                 | Visual check          | Colours aligned with Infection Virus palette | P1  |
| S3-E4 | Two tabs open same model → drag in tab A → tab B shows conflict toast on next edit | Two-tab test          | Conflict toast appears in tab B              | P1  |

---

## STEP 4 — Entity CRUD + detail panel + D5 auto-describe + D6 lint groundwork

### Unit

| ID    | Test                                                                                  | Input             | Expected                                            | Priority |
| ----- | ------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------- | -------- |
| S4-U1 | Naming lint: `customerID` flagged as non-snake_case                                   | physical layer    | violation with fix suggestion `customer_id`         | P1       |
| S4-U2 | Naming lint: `Customer` entity PASSES on conceptual layer                             | conceptual        | no violation                                        | P1       |
| S4-U3 | Naming lint: reserved SQL word (`order`, `user`) flagged with warning                 | any layer         | warning                                             | P2       |
| S4-U4 | Auto-describe: mock Claude returns description, service stores it + triggers re-embed | call autoDescribe | entity.description updated, embedding_jobs enqueued | P1       |
| S4-U5 | Auto-describe: Claude refusal returns AIRefusalError, description unchanged           | mock refusal      | error thrown, entity unchanged                      | P1       |

### Integration

| ID    | Route                                              | Case                                           | Expected                                              | Priority |
| ----- | -------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- | -------- |
| S4-I1 | `POST /api/models/:id/entities` happy              | Valid body                                     | 201 + entity                                          | P1       |
| S4-I2 | Cross-org IDOR attempt                             | User from org B, model from org A              | 404                                                   | P1       |
| S4-I3 | Delete entity with dependent relationships         | entity referenced by rel                       | 409 with dependent list                               | P1       |
| S4-I4 | Delete entity with confirm=cascade                 | same, with confirm flag                        | 200, rels gone, single change_log with cascade marker | P1       |
| S4-I5 | `POST /api/models/:id/entities/:eid/auto-describe` | Happy                                          | 200 with description, entity updated                  | P1       |
| S4-I6 | Auto-describe on Claude timeout                    | Mock timeout                                   | 504 with ProviderTimeoutError                         | P1       |
| S4-I7 | SQL injection in entity name                       | physical layer name = `"; DROP TABLE users;--` | 422 via regex validation                              | P1       |

### E2E

| ID    | Flow                                                                           | Expected                             | Priority                   |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------ | -------------------------- | --- |
| S4-E1 | Double-click canvas → entity created at cursor                                 | Interaction                          | Entity appears             | P1  |
| S4-E2 | Entity detail panel slides in, glass morphism, amber focus ring                | Visual                               | Matches Infection Virus    | P1  |
| S4-E3 | Click "Auto-describe" → loading shimmer → description populates + fade-in      | Click + wait                         | Animated populate          | P1  |
| S4-E4 | Naming violation on entity name shows amber underline + hover tooltip with fix | Enter `customerID` in physical layer | Underline + fix suggestion | P1  |
| S4-E5 | Click fix → name updated to `customer_id`                                      | Click suggestion                     | Name corrected             | P1  |
| S4-E6 | Delete entity with rels → confirmation dialog lists rels                       | Click delete                         | Modal with list            | P1  |

---

## STEP 5 — Attribute CRUD + D9 synthetic data

### Unit

| ID    | Test                                                                       | Input                           | Expected                        | Priority |
| ----- | -------------------------------------------------------------------------- | ------------------------------- | ------------------------------- | -------- |
| S5-U1 | `attributeCreateSchema` validates data_type per platform                   | physical + data_type=`VARCHAR`  | OK                              | P1       |
| S5-U2 | Reorder service re-computes ordinal_positions densely (1,2,3 not 1,3,5)    | reorder of 3 attrs              | positions 1,2,3                 | P1       |
| S5-U3 | PK toggle on attribute cascades to is_foreign_key = false if contradictory | set PK on existing FK           | FK cleared                      | P1       |
| S5-U4 | Synthetic data: service returns exactly 10 rows matching declared types    | call with entity having 5 attrs | 10 rows × 5 cols                | P1       |
| S5-U5 | Synthetic data: Claude refusal returns AIRefusalError, no rows shown       | mock refusal                    | error, drawer shows error state | P1       |

### Integration

| ID    | Route                                                 | Case                         | Expected                 | Priority |
| ----- | ----------------------------------------------------- | ---------------------------- | ------------------------ | -------- |
| S5-I1 | `POST /api/models/:id/entities/:eid/attributes`       | Valid                        | 201                      | P1       |
| S5-I2 | Duplicate attribute name within entity                | Second insert with same name | 409 ConflictError        | P1       |
| S5-I3 | `POST /api/models/:id/entities/:eid/synthetic-data`   | Happy                        | 200 with 10 rows         | P1       |
| S5-I4 | Synthetic data labelled `synthetic: true` in response | Happy                        | Response includes marker | P1       |

### E2E

| ID    | Flow                                                                          | Expected    | Priority                                |
| ----- | ----------------------------------------------------------------------------- | ----------- | --------------------------------------- | --- |
| S5-E1 | Add attribute inline → appears in entity node                                 | Add         | Appears immediately                     | P1  |
| S5-E2 | Drag-reorder attributes in panel → saved                                      | Drag        | Persisted                               | P1  |
| S5-E3 | PK attributes rendered above the line on canvas node                          | Visual      | Above divider                           | P1  |
| S5-E4 | Click "Synthetic data" → drawer opens below canvas with 10 rows + clear label | Interaction | Shown with "SYNTHETIC — NOT REAL" badge | P1  |
| S5-E5 | Synthetic data drawer: close button, copy-to-clipboard, regenerate button     | Interact    | All work                                | P2  |

---

## STEP 6 — Relationships + notations

### Unit

| ID    | Test                                                                         | Input             | Expected            | Priority |
| ----- | ---------------------------------------------------------------------------- | ----------------- | ------------------- | -------- |
| S6-U1 | IE renderer: one-to-many → bar + crow's foot                                 | cardinalities     | correct SVG symbols | P1       |
| S6-U2 | IE renderer: zero-or-one → open circle + bar                                 | cardinalities     | correct             | P1       |
| S6-U3 | IDEF1X renderer: one-to-many → bar + filled circle                           | cardinalities     | correct             | P1       |
| S6-U4 | Identifying rel renders solid line                                           | identifying=true  | solid               | P1       |
| S6-U5 | Non-identifying renders dashed line                                          | identifying=false | dashed              | P1       |
| S6-U6 | Relationship service rejects cross-layer rel (source.layer !== target.layer) | different layers  | ValidationError     | P1       |
| S6-U7 | Rejects cross-model rel                                                      | different models  | ValidationError     | P1       |

### Integration

| ID    | Route                                      | Case  | Expected | Priority |
| ----- | ------------------------------------------ | ----- | -------- | -------- |
| S6-I1 | `POST /api/models/:id/relationships` happy | Valid | 201      | P1       |
| S6-I2 | Delete relationship                        | Happy | 200      | P1       |

### E2E

| ID    | Flow                                                         | Expected       | Priority                    |
| ----- | ------------------------------------------------------------ | -------------- | --------------------------- | --- |
| S6-E1 | Drag handle from entity A to entity B → relationship created | Interaction    | Edge appears                | P1  |
| S6-E2 | Switch IE → IDEF1X → all edges re-render correctly           | Toggle         | Visual change, no data loss | P1  |
| S6-E3 | Draw rel to empty canvas → cancels                           | Drag+release   | No-op                       | P1  |
| S6-E4 | Draw duplicate rel → opens existing rel's panel              | Second attempt | Existing panel              | P2  |

---

## STEP 7 — Layer switching + D3 crossfade + layer_links

### Unit

| ID    | Test                                                                        | Input                        | Expected         | Priority |
| ----- | --------------------------------------------------------------------------- | ---------------------------- | ---------------- | -------- |
| S7-U1 | Layer link cycle detection: A(conceptual)→B(logical)→C(conceptual) rejected | build cycle                  | ValidationError  | P1       |
| S7-U2 | Cannot link same-layer entities                                             | parent.layer === child.layer | ValidationError  | P1       |
| S7-U3 | Layer filter returns only entities of current layer                         | mixed model, filter          | returns filtered | P1       |

### Integration

| ID    | Route                                    | Case        | Expected | Priority |
| ----- | ---------------------------------------- | ----------- | -------- | -------- |
| S7-I1 | `POST /api/models/:id/layer-links` happy | Valid       | 201      | P1       |
| S7-I2 | Cycle in link graph                      | build cycle | 422      | P1       |

### E2E

| ID    | Flow                                                     | Expected            | Priority                          |
| ----- | -------------------------------------------------------- | ------------------- | --------------------------------- | --- |
| S7-E1 | Switch layer → attributes crossfade smoothly (not cut)   | Toggle layer        | Animation present                 | P1  |
| S7-E2 | Navigation panel shows linked counterparts across layers | Click linked entity | Navigate across layers            | P1  |
| S7-E3 | Switch layer mid-edit → autosave before switch           | Edit + switch       | Saved + switched                  | P1  |
| S7-E4 | Entity indicator shows which layers it exists in         | Visual badges       | Multiple layer badges when linked | P2  |

---

## STEP 8 — Semantic layer + CSV export

### Unit

| ID    | Test                                                                         | Input                 | Expected        | Priority |
| ----- | ---------------------------------------------------------------------------- | --------------------- | --------------- | -------- |
| S8-U1 | Reject mapping if physical_attr.layer !== 'physical'                         | wrong layer           | ValidationError | P1       |
| S8-U2 | CSV escape: value starting with `=` → prefixed with single quote OR rejected | CSV injection payload | Safe output     | P1       |
| S8-U3 | CSV escape: `+`, `-`, `@` prefixes                                           | Various               | Safe            | P1       |

### Integration

| ID    | Route                                                     | Case                               | Expected | Priority |
| ----- | --------------------------------------------------------- | ---------------------------------- | -------- | -------- |
| S8-I1 | `POST /api/models/:id/semantic-mappings` happy            | Valid                              | 201      | P1       |
| S8-I2 | `GET /api/models/:id/semantic-mappings/export?format=csv` | Auth'd owner                       | 200 CSV  | P1       |
| S8-I3 | CSV contains no cells executable as formulas              | Entity desc = `=HYPERLINK("evil")` | Escaped  | P1       |

### E2E

| ID    | Flow                                                                             | Expected        | Priority |
| ----- | -------------------------------------------------------------------------------- | --------------- | -------- | --- |
| S8-E1 | Map physical col → logical attr → conceptual term, navigate back through mapping | Full loop       | Works    | P1  |
| S8-E2 | Export CSV, open in Excel, no formulas execute                                   | Download + open | Safe     | P1  |

---

## STEP 9 — DDL export + D4 live pane

### Unit — DDL generators (one suite per dialect)

| ID    | Test                                                    | Input                                                                     | Expected             | Priority |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------- | -------- |
| S9-U1 | Postgres: `customer_id INTEGER NOT NULL PRIMARY KEY`    | entity+PK                                                                 | exact string match   | P1       |
| S9-U2 | Snowflake: UPPER_SNAKE_CASE + VARCHAR type              | same                                                                      | expected SQL         | P1       |
| S9-U3 | SQL Server: NVARCHAR + dbo schema prefix                | same                                                                      | expected SQL         | P1       |
| S9-U4 | Identifier containing double-quote: escaped per dialect | name=`bad"name` (physical would reject but test with rogue data)          | escaped              | P1       |
| S9-U5 | Identifier is SQL keyword (e.g., `order`)               | name=`order`                                                              | quoted per dialect   | P1       |
| S9-U6 | Composite PK                                            | two PK attrs                                                              | `PRIMARY KEY (a, b)` | P1       |
| S9-U7 | FK with identifying rel                                 | identifying                                                               | part of PK           | P1       |
| S9-U8 | Postgres parser round-trip via `pg-query-parser`        | generated SQL                                                             | parses without error | P1       |
| S9-U9 | Round-trip detects injection                            | rogue input (should be caught at validation earlier; this is belt+braces) | parser flags         | P2       |

### Integration

| ID    | Route                                                   | Case                 | Expected             | Priority |
| ----- | ------------------------------------------------------- | -------------------- | -------------------- | -------- |
| S9-I1 | `GET /api/models/:id/export/ddl?dialect=postgres` happy | Auth'd               | 200 .sql             | P1       |
| S9-I2 | Invalid dialect                                         | `?dialect=mysql`     | 422                  | P1       |
| S9-I3 | Empty physical model                                    | No physical entities | 400 w/ clear message | P1       |

### E2E

| ID    | Flow                                                                                              | Expected     | Priority          |
| ----- | ------------------------------------------------------------------------------------------------- | ------------ | ----------------- | --- |
| S9-E1 | Export each of 3 dialects → download a .sql file → execute against real Postgres (for PG dialect) | Full loop    | No errors         | P1  |
| S9-E2 | Live DDL pane shows SQL for selected entity                                                       | Click entity | Pane updates live | P1  |
| S9-E3 | Edit attribute → pane re-renders within 500ms                                                     | Edit         | Debounced refresh | P1  |
| S9-E4 | Pane collapse/expand keyboard shortcut                                                            | Keyboard     | Works             | P2  |

---

## STEP 10 — AI chat + RAG + D1 explain + D8 paste-SQL

### Unit

| ID     | Test                                                                        | Input                                                       | Expected                                               | Priority |
| ------ | --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ | -------- |
| S10-U1 | Embedding service dedupe: same content_digest in queue → one voyage call    | 5 rapid enqueues same digest                                | 1 call                                                 | P1       |
| S10-U2 | Embedding worker retries voyage 429 with jitter backoff                     | mock 429                                                    | retry                                                  | P1       |
| S10-U3 | RAG service: top-5 retrieval by cosine similarity, filtered by model_id     | query                                                       | 5 results, all from same model                         | P1       |
| S10-U4 | RAG service: respects cross-model isolation                                 | query as user in model A, different model's chunks in DB    | returns only model A chunks                            | P1       |
| S10-U5 | Prompt builder wraps user content in `<user_model>...</user_model>` markers | build prompt                                                | delimited correctly                                    | P1       |
| S10-U6 | Paste-SQL parser: simple SELECT → suggested tables/columns                  | `SELECT name, email FROM customers`                         | suggests `customers` entity with `name`, `email` attrs | P1       |
| S10-U7 | Paste-SQL parser: handles joins                                             | `SELECT c.name, o.id FROM customers c JOIN orders o ON ...` | two entities + FK                                      | P2       |
| S10-U8 | Explain-model: uses DB-backed system_prompt template (NOT hardcoded)        | call                                                        | reads from system_prompts table with slug              | P1       |

### Integration

| ID     | Route                                                                     | Case                        | Expected                                                              | Priority |
| ------ | ------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------- | -------- |
| S10-I1 | `POST /api/models/:id/chat` (SSE) happy                                   | Valid                       | SSE stream with `data:` events + final `done` event                   | P1       |
| S10-I2 | Chat log persisted with model_context + retrieved_chunks                  | After turn                  | chat_logs row exists                                                  | P1       |
| S10-I3 | Client disconnect mid-stream                                              | Abort connection            | Stream closes cleanly; chat_log still persisted with partial response | P1       |
| S10-I4 | Prompt-injection case: model name contains "IGNORE PREVIOUS INSTRUCTIONS" | AI asked "what tables?"     | Response stays in-role, does NOT follow injected instruction          | P1       |
| S10-I5 | Claude refusal surfaces as assistant message with clear indicator         | Trigger refusal             | Message shown, NOT silently swallowed                                 | P1       |
| S10-I6 | Context-too-large with 500-entity model and full-context turn             | Deep-analyze button hit cap | Degrades to RAG-only + toast                                          | P1       |
| S10-I7 | "Deep analyze" opt-in: default is RAG-first                               | Normal message              | top-5 retrieved only                                                  | P1       |
| S10-I8 | "Explain this model" button returns 2-paragraph summary                   | Click                       | Summary referencing real entities                                     | P1       |
| S10-I9 | Paste-SQL: `POST /api/models/:id/chat/parse-sql`                          | Paste `SELECT ... FROM ...` | Returns draft entities + attributes                                   | P1       |

### E2E

| ID     | Flow                                                                               | Expected                 | Priority                   |
| ------ | ---------------------------------------------------------------------------------- | ------------------------ | -------------------------- | --- |
| S10-E1 | Open chat → ask about entity → streaming response → referenced entity name is real | Full flow                | Accurate answer            | P1  |
| S10-E2 | Click "Explain this model" → modal with 2-paragraph summary                        | Click                    | Summary shown              | P1  |
| S10-E3 | Paste SQL into chat → draft nodes appear on canvas with "accept" affordances       | Paste + click accept     | Nodes created              | P1  |
| S10-E4 | Stream interrupted (network blip) → auto-reconnect resumes message                 | Simulate blip            | Resumes                    | P1  |
| S10-E5 | Chat history persists on reload                                                    | Reload                   | Previous messages shown    | P1  |
| S10-E6 | Eval suite baseline: 3 canned prompts return grounded answers                      | `pnpm eval:model-studio` | Pass rate matches baseline | P1  |

---

## STEP 11 — Polish: D2 Cmd+K + D10 whiteboard + onboarding

### Unit

| ID     | Test                                                                                    | Input          | Expected                 | Priority |
| ------ | --------------------------------------------------------------------------------------- | -------------- | ------------------------ | -------- |
| S11-U1 | Cmd+K fuzzy search: "cust" matches "Customer", "customer_id"                            | Index of items | Correct ranking          | P1       |
| S11-U2 | Cmd+K ignores case                                                                      | "CUST"         | Matches                  | P1       |
| S11-U3 | Cmd+K matches across entity/attribute/action types                                      | Mixed index    | All types surface        | P1       |
| S11-U4 | Whiteboard upload: image-size cap 10MB                                                  | 15MB file      | Rejected                 | P1       |
| S11-U5 | Whiteboard upload: mime type validated                                                  | .pdf           | Rejected                 | P1       |
| S11-U6 | Whiteboard→model conversion: mock Claude vision response, assert draft entities created | mock response  | Draft entities on canvas | P1       |

### Integration

| ID     | Route                                            | Case               | Expected                                      | Priority |
| ------ | ------------------------------------------------ | ------------------ | --------------------------------------------- | -------- |
| S11-I1 | `POST /api/models/:id/whiteboard-to-model` happy | Upload valid image | 201 + draft model                             | P1       |
| S11-I2 | Invalid image                                    | Corrupt file       | 422                                           | P1       |
| S11-I3 | Vision refusal                                   | Model refuses      | 200 with clear message, no partial state left | P1       |

### E2E

| ID     | Flow                                                                                                     | Expected                       | Priority                 |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------ | --- |
| S11-E1 | Cmd+K anywhere in Model Studio → palette opens (glass morphism, amber focus ring)                        | Key shortcut                   | Opens                    | P1  |
| S11-E2 | Cmd+K rendered via React portal (not clipped by containers per lesson 24)                                | Open inside overflow container | Renders above everything | P1  |
| S11-E3 | Type entity name → press enter → viewport pans to it                                                     | Interaction                    | Pans + selects           | P1  |
| S11-E4 | Empty Model Studio → drop a whiteboard photo → loading shimmer → draft model appears with refine prompts | Full flow                      | End-to-end works         | P1  |
| S11-E5 | Empty state NOT clinical — glow, gradient text, 3 quick-start cards                                      | Visual                         | Matches Infection Virus  | P1  |
| S11-E6 | Keyboard shortcuts: delete selected, Cmd+K, arrow keys, escape to close panels                           | Test each                      | All work                 | P1  |
| S11-E7 | Responsive: works at 1280px wide min                                                                     | Resize                         | No broken layout         | P1  |
| S11-E8 | Error boundary: force a component error → friendly error card, not white screen                          | Throw in render                | Boundary catches         | P1  |

---

## Cross-cutting tests (run after EVERY step)

### Security

| ID   | Test                                                                                                          | Priority |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------- |
| X-S1 | IDOR across orgs on EVERY Model Studio route — user from org B manipulates URL to hit org A's resources → 404 | P1       |
| X-S2 | Prompt injection test corpus (10+ payloads) run against chat endpoint                                         | P1       |
| X-S3 | SQL injection in every string input: entity name, attribute name, description, tags                           | P1       |
| X-S4 | Max-length enforcement on every string field                                                                  | P1       |
| X-S5 | No hardcoded model IDs or prompts in Model Studio code (grep)                                                 | P1       |
| X-S6 | No API keys committed (grep .env patterns in diff)                                                            | P1       |

### Regression (per lesson 23)

| ID   | Test                                                                  | Priority |
| ---- | --------------------------------------------------------------------- | -------- |
| X-R1 | Chat feature (existing) still works after Model Studio chat additions | P1       |
| X-R2 | Projects page (existing) still works                                  | P1       |
| X-R3 | Organisation invites still work                                       | P1       |
| X-R4 | Login/logout/refresh unaffected                                       | P1       |
| X-R5 | Nav manifest with flag OFF matches pre-Model-Studio nav               | P1       |
| X-R6 | `pnpm tsc` clean on all 3 packages                                    | P1       |
| X-R7 | `pnpm lint` clean                                                     | P1       |
| X-R8 | No new `any` types introduced                                         | P1       |

### Performance (run at end of each major step)

| ID   | Test                                                  | Target | Priority |
| ---- | ----------------------------------------------------- | ------ | -------- |
| X-P1 | Load 200-entity model in < 300ms (p99)                | 300ms  | P1       |
| X-P2 | Entity mutate < 100ms                                 | 100ms  | P1       |
| X-P3 | Chat first-token < 2.5s                               | 2500ms | P1       |
| X-P4 | DDL export for 200 entities < 500ms                   | 500ms  | P1       |
| X-P5 | Canvas render at 500 entities without dropping frames | 60fps  | P2       |

### Observability smoke

| ID   | Test                                                                    | Priority |
| ---- | ----------------------------------------------------------------------- | -------- |
| X-O1 | Every new route emits structured log with requestId, userId, action     | P1       |
| X-O2 | AppError logs include full context (userId, modelId, action, requestId) | P1       |
| X-O3 | Embedding failure logs distinguish timeout vs 5xx vs network            | P1       |

---

## Deployment smoke (post-merge)

| ID  | Test                                                                                                                                          | Priority |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D-1 | Render build succeeds (`npm i -g pnpm@9 && NODE_ENV=development pnpm install && rm -f packages/shared/tsconfig.tsbuildinfo && pnpm -r build`) | P1       |
| D-2 | `DATABASE_URL` on Render includes `?sslmode=require` (lesson 13)                                                                              | P1       |
| D-3 | Migration applied on deploy (Render's pre-start step)                                                                                         | P1       |
| D-4 | Feature flag defaults OFF on production                                                                                                       | P1       |
| D-5 | Manual smoke: toggle flag ON → full UI loads → create model → export DDL → download works                                                     | P1       |
| D-6 | Rollback rehearsal: flip flag OFF → stub returns within 1 min                                                                                 | P1       |

---

## Test plan maintenance

- Every test case checked off when it passes. Do not delete cases — keep the history of what's been tested.
- If a case is replaced, mark it `REPLACED BY S#-##`.
- When a bug is discovered in production, add a regression test case here with the bug's incident number.
- At the end of each step, append a "Step N summary" line: total passed / total in step / any P1 skipped with justification.

---

## Standing exit criteria (before Model Studio merges to main)

- ✅ All P1 cases across all steps pass
- ✅ `pnpm test` + `pnpm test:integration` + `pnpm tsc` all clean
- ✅ LLM eval baseline captured and passing (S10-E6)
- ✅ Security suite (X-S1..X-S6) green
- ✅ Regression suite (X-R1..X-R8) green
- ✅ Performance targets (X-P1..X-P4) met
- ✅ Every new/touched API route curl-verified per lesson 7
- ✅ Test data cleaned up per lesson 8
- ✅ CI passes
- ✅ Explicit user confirmation for `git push` (lessons never bent)
