---
title: Project Status (Snapshot)
category: synthesis
created: 2026-04-29
updated: 2026-04-29
related: [[spresso-data-studio]], [[step7-decision]], [[alignment-model-studio]]
---

Point-in-time summary of where Model Studio is in the build. **Live source of truth is `tasks/todo.md`** — this page is a snapshot, not a tracker. Update on material milestones, not every commit.

## Where the build sits (2026-04-29)

### Model Studio MVP — 11-step build order

| Step                                                                                                  | Status    | Notes                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| 1. Scaffold (flag gate, zod-validate, error subclasses, 12-table Drizzle migration, pgvector)         | shipped   | QA report archived in `raw/`                                                                                |
| 2. Model CRUD + list page + `canAccessModel` authz                                                    | shipped   |                                                                                                             |
| 3. Canvas foundation (React Flow v12) + minimap (D7) + canvas_states persistence                      | shipped   |                                                                                                             |
| 4. Entity CRUD + detail panel + auto-describe (D5) + naming-lint groundwork (D6)                      | shipped   | `fd110b4`, 2026-04-19                                                                                       |
| 4.5. Origin-direction choice at model creation (greenfield vs existing-system)                        | shipped   | Same merge as Step 4                                                                                        |
| 5. Attribute CRUD + D9 synthetic data + governance classification + Erwin-style editor + audit        | shipped   | Merged via `c14b2a0`, 2026-04-20                                                                            |
| 6. Relationships + IE/IDEF1X notation + identifying-rel PK propagation + 6 delights                   | shipped   | See [[relationships-feature]], [[step6-decision]], [[step6-direction-a-decision]], [[step6-patch-decision]] |
| 7. Layer switching + crossfade + layer_links CRUD + linked-objects nav (FULL CATHEDRAL: EXP-1..EXP-8) | in flight | 6 of 8 lanes complete on `feature/model-studio-step7-layer-linking`                                         |
| 8. Semantic layer bridge + CSV export                                                                 | pending   |                                                                                                             |
| 9. DDL export (Snowflake / SQL Server / Postgres) + live DDL pane (D4)                                | pending   |                                                                                                             |
| 10. AI chat (SSE streaming) + RAG (pgvector + voyage-3 + embedding_jobs worker) + D1 + D8             | pending   |                                                                                                             |
| 11. Polish: Cmd+K palette (D2), whiteboard empty state (D10), onboarding, error boundaries            | pending   | Plus the canvas-state fetch race (Option C)                                                                 |

### Step 7 lane status

Branch: `feature/model-studio-step7-layer-linking` — local only, not pushed.

- Lane 1 — Backend CRUD + cycle guard (`f65b005`) — done.
- Lane 2 — Client hooks (`0586b54`) — done.
- Lane 3 — Layer switcher + origin badge + crossfade + Shift+Alt+C/L/P + URL `?layer=` (`4d972dc`) — done. Includes lesson L34 fix.
- Lane 4 — Entity-card decorations + LinkedObjectsPanel + ProjectToModal + breadcrumb (`6bc9dc0`) — done.
- Lane 5 — Name-match auto-link suggester (EXP-3) (`6f44196`) — done.
- Lane 6 — Attribute layer-links editor (EXP-4) (`8224618`) — done.
- Lane 7 — Cross-layer overlay mode (EXP-5, ~Cmd+L) — pending. ~2 days CC-paced.
- Lane 8 — CDMP-style PDF export (EXP-8) — pending. ~2 days CC-paced.

## Open architectural follow-ups

- **Canvas-state fetch race on page load.** Entities flash at `{0,0}` for 100-300ms before saved positions land. Fix is Option C: fold canvas-state into the entity-list response. Targeted at Step 11 polish. User decision: 2026-04-24.
- **`docs/architecture/model-studio-layer-linking.md`** — mandatory architecture doc per CLAUDE.md, covering cycle-detection BFS invariants, multi-parent tree-shape contract, DMBOK framing, action-verb naming. Write alongside Step 7 close-out.
- **Composite-PK partial attribute-link** — Step 9 DDL generator concern: how to emit constraint when only some FK columns are linked. Options: emit linked only / fail loudly / auto-propose missing link.
- **Extract Infection Virus design standard into `docs/architecture/DESIGN.md`.** Currently inline in CLAUDE.md.

## Known unblocked tech debt

- Mobile overlay-mode viewer (<768px) — desktop-only for now.
- Color-blind verification Playwright test for Step 7 overlay (Conceptual=amber / Logical=blue / Physical=green; deuteranopia risk).
- Drag-and-drop entity linking — deferred. "Project to..." modal is the single MVP entry point.
- Bulk "project this layer" sweep — deferred until users surface the workflow.
- Entity position drift on reload (Step-4-era) — coord-system mismatch between `screenToFlowPosition` and saved positions.
- Suite-mode flakiness on S4-E3/E4/E6 Playwright tests — `.fixme`. Coincides with a flaky 500 from `/api/settings/site/public`.
- React Flow v12 drag-to-connect Playwright automation (S6-E1/E3/E4) — `.fixme`. Requires custom PointerEvent dispatch or test-only keyboard command.
- BroadcastChannel two-tab E2E (S6-E9) — `.fixme`. BroadcastChannel does not cross Playwright `BrowserContext` process boundaries.
- `Cmd+R` keyboard-draw flow (S6-E10) — handler not yet implemented.
- Candidate-key-referenced FKs (alt-key FK targets) — schema + propagate + DDL changes. ~2-3hrs.
- EntityEditor tabbed property sheet (Erwin convention) — Direction A collapsible Definition shipped as quick win. Full tabbed refactor deferred.

## Where to look for live state

- `tasks/todo.md` — backlog source of truth.
- `git log` / `git status` — current branch state.
- [[lessons]] — applied lessons.
- [[alignment-model-studio]] — agent calibration.
