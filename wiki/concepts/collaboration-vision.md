---
title: Collaboration Vision (Multi-User Model Studio)
category: concept
created: 2026-04-29
updated: 2026-04-29
related: [[spresso-data-studio]], [[relationships-feature]], [[layer-linking-api]]
---

Living vision doc for real-time collaborative data modelling: dual-layer state (semantic shared / cosmetic per-user), presence primitives, conflict-free cosmetic edits, attribution everywhere, and the anti-patterns we refuse.

# Collaboration Vision — Multi-User Model Studio

**Status:** draft / living document
**Owner:** Rob Angeles
**Last updated:** 2026-04-23

## Why this document exists

Spresso's eventual differentiator is **real-time collaborative data modelling**. A 20-entity model with 5 active modellers is the realistic scenario — multiple architects arguing about naming, one person wrangling the physical layer while another reverse-engineers an existing warehouse, a reviewer dropping governance tags, and so on.

This doc captures the product intent so each incremental change we ship from Step 6 onward is made with the collaborative endgame in mind — instead of shipping single-user patterns and retrofitting collaboration later.

It is **not** an implementation plan. It describes the user experience we intend and the architectural pillars required to deliver it. Actual implementation lands as discrete Steps (see `tasks/todo.md`).

## The canonical scenario

> **Tuesday, 10:14 AM.** A data architect opens the "Order Management" model. She sees Alex's avatar on the `customer` entity (he's editing an attribute) and Priya's avatar hovering over the `order → order_line` relationship (she's tweaking the cardinality). Jamie's cursor is gliding across the canvas — they're exploring, not editing. Down the activity feed: _"Sarah reclassified `customer.email` as PII, 4 min ago."_
>
> She drags `shipping_address` into a new position to group it with billing. Her change applies instantly. Nobody else sees her `shipping_address` jump in their viewport — that's her layout, not theirs. Later, she right-clicks and picks "Share layout" and the others have the option to adopt her arrangement.
>
> She opens the Key Columns panel for `order → customer`. Alex is idle now but his cursor's last position is subtly indicated near `customer.customer_id`. She drags the FK pair to reference `customer.customer_code` (the AK). Priya, still editing cardinality on a different relationship, doesn't see a single toast. Priya's PATCH and hers arrived in the correct order; both applied.

Three invariants the story relies on:

1. **Layout is personal by default.** One modeller's aesthetic choice (positions, waypoints, viewport zoom) must not disrupt another's reading of the diagram. Sharing is an explicit action.
2. **Structure is shared.** Entities, attributes, relationships, classifications, and every semantic artefact have one shared source of truth.
3. **Cosmetic edits never block semantic edits.** A position drag and an attribute rename should never produce a "Someone else edited" conflict.

## Architectural pillars

### Pillar 1 — Dual-layer state: semantic vs cosmetic

Every piece of model state belongs to exactly one of two layers.

| Semantic (shared)                   | Cosmetic (per-user OR shared-with-opt-in)                |
| ----------------------------------- | -------------------------------------------------------- |
| Entities, attributes, relationships | Node positions, viewport, zoom                           |
| Names, types, flags (PK/FK/NN/UQ)   | Relationship waypoints                                   |
| Classifications, tags               | Handle docking sides                                     |
| Cardinalities, identifying flag     | Notation preference (IE vs IDEF1X) — arguable, see below |
| Key Columns pairings                | Entity colour overrides                                  |

**Semantic state uses optimistic-locking version numbers we already have.** Conflict toasts here are intentional — two users trying to rename the same attribute _should_ resolve the conflict explicitly.

**Cosmetic state is per-user.** A user's canvas view is a snapshot they can edit freely. A "Sync layout from…" action copies another user's layout into yours. A "Publish layout" action (model owner only) sets the default layout new users see.

### Pillar 2 — Presence

Three presence primitives:

1. **Live cursors** — coloured pointer per user on the canvas. Movement broadcast via WebSocket (throttled to ~30Hz).
2. **Edit indicators** — avatar/initials badge on the entity or relationship the user is actively editing. Sticky until user moves focus or 30s timeout.
3. **Activity feed** — append-only log of semantic changes, scoped to the current model. Populated from `data_model_change_log` with real-time tail.

Presence channel is separate from persistence — losing presence never loses work.

### Pillar 3 — Conflict-free cosmetic edits

Cosmetic mutations should never 409. Two mechanisms:

1. **Per-user cosmetic tables.** `user_canvas_view (user_id, model_id, node_positions, viewport, waypoints_override)` — one row per user per model. No version lock; last-write-wins per-user.
2. **Silent recovery for in-flight semantic cosmetics.** Where cosmetic state _is_ shared (e.g., default waypoints the model owner published), PATCHes use `silentOnConflict: true` and the client silently refetches on 409. User sees no toast; the diagram reconciles.

The pattern is already in place for waypoint + handle PATCHes. Entity position drag is next.

### Pillar 4 — CRDT or OT for concurrent structural edits

For the minority of real collisions (two users editing the same attribute name simultaneously), optimistic locking forces one to retry. Acceptable at MVP. At scale — say 5+ concurrent users on one entity during a review session — we adopt a CRDT (Yjs / Automerge) for text fields and a custom OT for structural operations.

Decision point deferred until we have usage data. Specific triggers:

- Average session has ≥ 2 concurrent editors on the same entity more than 5× per week
- "Someone else edited" toast appears on >1% of PATCHes
- User research surfaces it as a top-5 pain point

### Pillar 5 — Attribution everywhere

Every row in `data_model_change_log` already has `changed_by` + `created_at`. The UX additions:

- Activity feed shows **who** did what, **when**, and a one-click "show me this change" that navigates + highlights
- Entity and attribute property sheets show a "last edited by [user] [date]" line
- Relationships show the same in the panel
- Git-style blame on any attribute row: hover to see "added by [user] [date], last edited by [user] [date]"

## What to build when

### Today (Step 6 finishing line — already in flight)

- `silentOnConflict` flag on cosmetic PATCHes ✅
- Optimistic visual updates on endpoint drag ✅
- `docs/architecture/collaboration-vision.md` (this doc) ✅

### Step 11 (UI polish milestone)

- Dual-layer state split — move node positions + waypoints to a new `user_canvas_views` table
- "Sync layout from…" and "Publish layout" actions
- Activity feed side-panel (reads from `data_model_change_log`)

### Step 12 (Collaboration milestone — new track, scoped after Step 10)

- WebSocket presence channel — cursors + edit indicators
- Attribution chips on entity/attribute/relationship property sheets
- Model-scoped activity feed with "jump to change" navigation

### Beyond (triggered by usage data)

- CRDT text editing on attribute names + descriptions
- OT for structural ops
- Playback / time-travel viewer for model history

## Anti-patterns we refuse

- **Locking entire entities for editing.** Freezes collaboration; modellers work around locks by switching to chat tools.
- **"View-only" rooms that users have to request edit for.** Same problem, different name.
- **Server-authoritative layout that overwrites user positions.** Breaks the personal-layout pillar.
- **Silent conflict resolution for semantic changes.** Two renames of the same attribute should produce a choice, not pick a winner.
- **Real-time over WebRTC peer-to-peer.** Ops, scaling, and permissions become intractable in 6 months. WebSocket through the server is slower but correct.

## Open questions

1. **Notation preference — per-user or model-scoped?** Currently model-scoped. Arguable — different reviewers might want IE while designers prefer IDEF1X. Decision deferred.
2. **Where does "comments on entities" live?** Probably semantic (shared) but scoped to their own feature.
3. **Do we need model-level freeze / publish workflow?** Erwin has this via models and reference models. Probably Step 13+ after core collaboration lands.
4. **Conflict resolution UX for simultaneous renames** — modal diff? First-writer-wins with toast to second? User research needed.

---

This doc is expected to evolve. Edits welcome — update the "Last updated" line when material changes land.
