# Model Studio feature flags

Model Studio ships in **step-gated slices**. Every slice has a feature
flag so we can ship + verify + flip safely. Flags are read from
`process.env` at request time — no server restart needed to flip on
Render (or flip them via the env UI + trigger a redeploy for safety).

All flags default to `false` / absent. The client also checks these
flags via `useModelStudioFlag(name)` and degrades gracefully when off.

---

## Current flags

| Flag                                 | Default | Purpose                                              | Step shipped | Sample of what it gates                                                                                                                         |
| ------------------------------------ | ------- | ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODEL_STUDIO_RELATIONSHIPS_ENABLED` | `false` | Step-6 relationships + IE/IDEF1X + notation switcher | Step 6       | `POST /models/:id/relationships`, canvas edges, RelationshipPanel, NotationSwitcher, InferRelationshipsPanel, Mermaid export, admin diagnostics |

Flags planned for future steps (not yet shipped):

| Flag                              | Target step | Purpose                                                        |
| --------------------------------- | ----------- | -------------------------------------------------------------- |
| `MODEL_STUDIO_LAYERS_ENABLED`     | Step 7      | Layer switching crossfade (D3) + `layer_links` CRUD            |
| `MODEL_STUDIO_SEMANTIC_ENABLED`   | Step 8      | Semantic-layer bridge + CSV export                             |
| `MODEL_STUDIO_DDL_EXPORT_ENABLED` | Step 9      | DDL export (Snowflake / SQL Server / Postgres) + live DDL pane |
| `MODEL_STUDIO_CHAT_ENABLED`       | Step 10     | SSE chat + RAG + "Explain model" (D1) + "Paste query" (D8)     |
| `MODEL_STUDIO_POLISH_ENABLED`     | Step 11     | Cmd+K palette (D2), whiteboard empty state (D10), etc.         |

---

## How to flip a flag

### Local dev

1. `echo "MODEL_STUDIO_RELATIONSHIPS_ENABLED=true" >> .env` (ensure
   **no UTF-16 encoding** — see lesson #28 for the gotcha).
2. `npx kill-port 3006`
3. `pnpm -C packages/server dev`
4. Verify: curl a flag-gated route with auth and confirm you get the
   expected response (not 404).

### Render (production)

1. Dashboard → service → Environment → Add
   `MODEL_STUDIO_RELATIONSHIPS_ENABLED=true`.
2. Render redeploys automatically.
3. Smoke-check via an authed curl against the public URL.

### Rollback

Set the flag to `false` or delete the env var. Affected routes return
404 on the next request. Client polls and re-gates UI within ~30 s.

---

## Testing flag-gated routes

Integration tests (`packages/server/src/**/*.integration.test.ts`) hit a
running dev server and **require the flag on** in the server's env.
Run them with the flag set BEFORE starting the server. Tests fail with
"404 when 201 expected" if the flag is off.

Unit tests (`packages/shared/**/*.test.ts`,
`packages/server/src/**/*.test.ts` non-integration) are flag-independent.

---

## Why env vars, not a DB-driven flag system

Keeps deploy flow simple — no new service, no DB table, no admin UI
surface to maintain. Step 6 doesn't need per-user or per-org flag
variance; when it does (phase 2 enterprise tenancy), we promote to a
DB-driven system and the env fallback stays for dev.
