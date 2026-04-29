# Wiki Index

Master catalog of every wiki page. Read me at the start of every session before doing any work.

Each entry: page name — one-sentence summary — link — date created.

## Entities (named things)

- **Spresso Data Studio** — the platform itself: DMBOK-grounded data modelling tool for senior practitioners — [entities/spresso-data-studio.md](entities/spresso-data-studio.md) — 2026-04-29
- **Layer Linking API** — Step 7 HTTP surface for cross-layer projections, attribute links, projection chain, coverage, name-match suggestions — [entities/layer-linking-api.md](entities/layer-linking-api.md) — 2026-04-29
- **Model Studio Feature Flag System** — env-var based slice gating with default-on once stable + Render rollback path — [entities/feature-flag-system.md](entities/feature-flag-system.md) — 2026-04-29
- **Model Studio Relationships** — Step 6 typed-edge feature with IE/IDEF1X notation, identifying-rel propagation, infer-from-FK, Mermaid export — [entities/relationships-feature.md](entities/relationships-feature.md) — 2026-04-29

## Concepts (patterns and ideas)

- **Collaboration Vision (Multi-User Model Studio)** — dual-layer state, presence primitives, conflict-free cosmetic edits, attribution, anti-patterns — [concepts/collaboration-vision.md](concepts/collaboration-vision.md) — 2026-04-29

## Decisions (locked architectural choices with rationale)

- **Co-Pilot Workspace Plan** — locked CEO-review decisions for the Content Builder centre column (chat + editor split, unified sendMessage) — [decisions/copilot-workspace-plan.md](decisions/copilot-workspace-plan.md) — 2026-04-29
- **Step 6 Build Brief** — locked decisions for Relationships + IE/IDEF1X + 6 delights + admin diagnostics — [decisions/step6-decision.md](decisions/step6-decision.md) — 2026-04-29
- **Step 6 Direction A + BK/AK Alignment** — JetBrains Mono typography, dot canvas, BK/AK first-class, alt_key_group lint — [decisions/step6-direction-a-decision.md](decisions/step6-direction-a-decision.md) — 2026-04-29
- **Step 6 Post-Ship Patch** — full undo/redo + 7 fixes (notation pill, smooth-step paths, scroll bouncing, validation toast, flag default-on, self-ref arc, showcase seed) — [decisions/step6-patch-decision.md](decisions/step6-patch-decision.md) — 2026-04-29
- **Step 7 Build Brief** — writable layer switcher, layer_links CRUD, D3 crossfade, linked-objects nav, coverage badges, autosave layer — [decisions/step7-decision.md](decisions/step7-decision.md) — 2026-04-29

## Synthesis (cross-cutting analysis, lessons, status)

- **Model Studio Agent Alignment Briefing** — Nobel-Laureate mindset, debugging protocol, testing standards, stack conventions, 11-step build order, applicable lessons — [synthesis/alignment-model-studio.md](synthesis/alignment-model-studio.md) — 2026-04-29
- **Lessons Learned** — Problem / Fix / Rule notes accumulated across the project — [synthesis/lessons.md](synthesis/lessons.md) — 2026-04-29
- **Project Status (Snapshot)** — 11-step build progress + Step 7 lane status + open architectural follow-ups — [synthesis/project-status.md](synthesis/project-status.md) — 2026-04-29

## Raw (immutable source documents — never modify)

- **Test Plan: Model Studio MVP** — master test plan covering all 11 build steps — [../raw/test-plan-model-studio.md](../raw/test-plan-model-studio.md) — 2026-04-19
- **Test Plan: Prompt Auto-Send & Editor Population** — 49 test cases for the prompt auto-send feature — [../raw/test-plan-prompt-auto-send.md](../raw/test-plan-prompt-auto-send.md) — 2026-03-31
- **Test Plan: Skill Marketplace** — 280 test cases for privacy / sharing / forking / favorites — [../raw/test-plan-skill-marketplace.md](../raw/test-plan-skill-marketplace.md) — 2026-04-05
- **QA Report: Model Studio Step 1 Scaffold** — point-in-time QA snapshot (health 88/100, route matrix, findings) — [../raw/qa-report-model-studio-step1-2026-04-19.md](../raw/qa-report-model-studio-step1-2026-04-19.md) — 2026-04-19

## Stays in place (loaded automatically each session, not in wiki)

- **CLAUDE.md** — master project instructions (behavioural rules, debugging protocol, architecture standards, security, git workflow, ports). Auto-loaded on every session.
- **tasks/todo.md** — backlog source of truth. Read for "what's our backlog" / "what's next".

## Forward references (pages that don't exist yet, surfaced as gaps)

- `[[project-standards]]` — would extract CLAUDE.md's Architecture / Security / Git Workflow / Database Design rules into a dedicated wiki entity. Currently only referenced; not created.
