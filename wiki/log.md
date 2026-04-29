# Wiki Session Log

Append-only log of wiki changes. New entries on top.

---

## 2026-04-29 (later same day) — Deleted migrated source originals

Deleted the 11 source files whose content now lives in `wiki/`:
`docs/architecture/collaboration-vision.md`, `docs/architecture/step7-layer-linking-api.md`, `docs/model-studio/feature-flags.md`, `docs/model-studio/relationships.md`, `tasks/plan-copilot-workspace.md`, `tasks/alignment-model-studio.md`, `tasks/alignment-step6.md`, `tasks/alignment-step6-direction-a.md`, `tasks/alignment-step6-patch.md`, `tasks/alignment-step7.md`, `tasks/lessons.md`. `docs/architecture/` and `docs/model-studio/` are now empty. `tasks/` keeps `todo.md` + the empty `qa-reports/` directory. `CLAUDE.md` and `tasks/todo.md` remain in place as live sources of truth.

---

## 2026-04-29 — Wiki initialisation from existing MD files

**What was done**

Initial wiki bootstrap. Audited 17 markdown files across `docs/`, `tasks/`, `tasks/qa-reports/`, and root. Migrated 12 of them into structured wiki pages (entities / concepts / decisions / synthesis); copied 4 test-plan / QA-report artifacts into `raw/` and deleted the originals; left `CLAUDE.md` and `tasks/todo.md` in place as live, auto-loaded sources of truth.

**Pages created**

- `wiki/entities/spresso-data-studio.md` — fresh canonical entity page for the platform
- `wiki/entities/layer-linking-api.md` — migrated from `docs/architecture/step7-layer-linking-api.md`
- `wiki/entities/feature-flag-system.md` — migrated from `docs/model-studio/feature-flags.md`
- `wiki/entities/relationships-feature.md` — migrated from `docs/model-studio/relationships.md`
- `wiki/concepts/collaboration-vision.md` — migrated from `docs/architecture/collaboration-vision.md`
- `wiki/decisions/copilot-workspace-plan.md` — migrated from `tasks/plan-copilot-workspace.md`
- `wiki/decisions/step6-decision.md` — migrated from `tasks/alignment-step6.md`
- `wiki/decisions/step6-direction-a-decision.md` — migrated from `tasks/alignment-step6-direction-a.md`
- `wiki/decisions/step6-patch-decision.md` — migrated from `tasks/alignment-step6-patch.md`
- `wiki/decisions/step7-decision.md` — migrated from `tasks/alignment-step7.md`
- `wiki/synthesis/alignment-model-studio.md` — migrated from `tasks/alignment-model-studio.md`
- `wiki/synthesis/lessons.md` — migrated from `tasks/lessons.md`
- `wiki/synthesis/project-status.md` — fresh snapshot derived from `tasks/todo.md`
- `wiki/index.md` — master catalog
- `wiki/log.md` — this file

**Raw files copied (originals deleted)**

- `raw/test-plan-model-studio.md`
- `raw/test-plan-prompt-auto-send.md`
- `raw/test-plan-skill-marketplace.md`
- `raw/qa-report-model-studio-step1-2026-04-19.md`

**Files left in place**

- `CLAUDE.md` (auto-loaded project instructions)
- `tasks/todo.md` (backlog source of truth — `synthesis/project-status.md` is a derived snapshot, not a replacement)
- All other migrated originals in `docs/` and `tasks/` per Rob's instruction to wait for confirmation before deleting.

**Decisions made during this run**

- Project canonical entity is `Spresso Data Studio`, not "Sparq" (Sparq was a placeholder example in the bootstrap prompt).
- `alignment-model-studio.md` placed under `synthesis/` (not `decisions/`) because it bundles mindset + standards + decisions + build order as cross-cutting agent calibration.
- `feature-flags.md` placed under `entities/` as a single page covering both "what the system is" and "how to flip it"; could split entity vs reference later if it grows.
- Migrated wiki pages preserve source body verbatim with a YAML frontmatter block + a one-line summary prepended. No content was rewritten.
- For the 4 raw artifacts, originals were copied into `raw/` then deleted (per explicit user authorisation).

**Gaps / questions identified**

1. **`docs/architecture/model-studio-layer-linking.md` does not yet exist.** Mandatory per CLAUDE.md §Verification Before Done. Needs to cover cycle-detection BFS invariants, multi-parent tree-shape contract for `resolveProjectionChain`, DMBOK framing, action-verb naming. Should be written alongside Step 7 close-out and then mirrored into `wiki/entities/`.
2. **`docs/architecture/DESIGN.md` does not exist.** Infection Virus design standard lives inline in CLAUDE.md. Targeted at Step 11 polish; would become a `wiki/concepts/design-system.md` once extracted.
3. **No wiki page for `project-standards`.** CLAUDE.md is loaded automatically each session, so a wiki copy would duplicate. Forward-referenced as `[[project-standards]]` in Spresso entity + lessons synthesis. Decide later whether to materialise.
4. **No wiki coverage for the Skills Marketplace, Content Builder runtime, RAG / embedding pipeline, or the orchestration system.** All exist in the codebase but have no markdown source documents to migrate. Recommended next pages — see Step 7 final report.
5. **No wiki coverage for the rollout posture (Render auto-deploy, Husky hooks, CI pipeline).** Lives in CLAUDE.md only.
6. **`tasks/qa-reports/` directory now empty.** Left in place — likely to be reused for future reports.
