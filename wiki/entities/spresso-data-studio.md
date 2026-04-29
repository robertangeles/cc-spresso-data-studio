---
title: Spresso Data Studio
category: entity
created: 2026-04-29
updated: 2026-04-29
related: [[layer-linking-api]], [[feature-flag-system]], [[relationships-feature]], [[collaboration-vision]], [[project-standards]]
---

The platform itself: a DMBOK-grounded data modelling and architecture tool for experienced practitioners.

## What it is

Spresso Data Studio is a data modelling and architecture platform built for data modellers and data architects. It is grounded in DMBOK and designed to close the gap between how data modelling is taught and how it gets done in practice.

Most data modelling work is still scattered. Models live in one tool, documentation lives somewhere else, governance decisions get buried in email threads, and business stakeholders never see the output in a form they understand. Spresso brings these things into a single, structured environment without forcing a new methodology on teams who already have one.

## Who it is for

Experienced practitioners. Not beginners. The product respects the user's expertise rather than simplifying their thinking. The CEO-review brief calls out the senior CDMP-practitioner evaluator (15+ years of Erwin / ER Studio / PowerDesigner) as the calibration target.

## What it covers

The platform supports the full modelling lifecycle:

- Conceptual, logical, and physical model layers.
- DMBOK knowledge area alignment.
- Documentation generation for technical and non-technical audiences.
- Naming standards, data lineage, metadata management, model governance.
- Reverse engineering of inherited models (the "messy middle" — most environments were never designed in one go).
- AI assistance via RAG over the model with optional "Deep analyze" passes.

## Subsystems and named features

- **Model Studio** — the ERD canvas + entity / attribute / relationship CRUD + layer linking. Built on React Flow v12. Feature-flag gated per slice.
- **[[relationships-feature]]** — Step 6 Relationships with IE / IDEF1X notation, identifying-rel PK propagation, FK ↔ rel sync, infer from FK graph.
- **[[layer-linking-api]]** — Step 7 cross-layer entity + attribute projection API (entity-link, attribute-link, auto-projection, projection-chain, layer-coverage, name-match suggestions).
- **[[feature-flag-system]]** — env-var based flag gating with default-on once stable + Render-side rollback path.
- **Content Builder** — separate workspace; Co-Pilot Workspace (chat + editor split) is the planned UI.
- **Skills Marketplace** — community sharing layer for skills (private / unlisted / public + forking + favorites + showPrompts toggle).

## Architectural posture

- pnpm monorepo: `packages/client` (Vite + React + Tailwind), `packages/server` (Express + Drizzle + PostgreSQL + pgvector), `packages/shared` (zod + types).
- Default AI model: `claude-sonnet-4-6`. AI prompts DB-backed via `system_prompts`, never hardcoded.
- Trunk-based development on `main`. Auto-deploy via Render. Husky + lint-staged.
- Frontend port `5176`, backend port `3006` — non-default to avoid conflicts.
- Custom hooks for state (NOT Zustand).
- Drizzle ORM (no `models/` folder). Migrations via `drizzle-kit`.

## Posture (the "Nobel Laureate" mindset)

Per [[alignment-model-studio]]: first-principles rigor, label inference vs fact, elegance as economy, synthesis across linguistics + pedagogy + UX + AI alignment, curiosity about the user's tacit knowledge.

The **Infection Virus Design Standard** in CLAUDE.md is treated as spec, not polish: glass morphism, amber glow on active / focused / selected, gradient accents, hover lift, spring easing, per-platform identity, no flat surfaces, keyboard-first power-user flow.

## Where to look

- Project rules and standards: `CLAUDE.md` (auto-loaded every session).
- Live backlog: `tasks/todo.md`.
- Lessons learned: see [[lessons]].
- Master Model Studio briefing: see [[alignment-model-studio]].
