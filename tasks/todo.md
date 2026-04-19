# Content Builder - Task Tracking

## Phase 1: Scaffold + Auth + Basic Flow UI

- [x] Monorepo scaffold
- [ ] Shared package (types, validation, constants)
- [ ] Server skeleton (Express, config, logger)
- [ ] Database (Drizzle schema, migrations)
- [ ] Auth system (backend)
- [ ] Flow CRUD (backend)
- [ ] Client scaffold + Auth UI
- [ ] Flow Builder UI skeleton

## Tech debt — data practices (Spresso eats its own dog food)

- [ ] **Stop running `migrateModelIds()` on every server boot.** Currently
      [packages/server/src/services/admin.service.ts:79](packages/server/src/services/admin.service.ts#L79) is invoked from
      `seedAIProviders()` ([line 75](packages/server/src/services/admin.service.ts#L75)) which is
      called by `start()` in [packages/server/src/index.ts:25](packages/server/src/index.ts#L25). The migration is
      idempotent at the row level (WHERE old = X), but the SQL still
      runs against `conversations`, `flow_steps`, `user_profiles`,
      `skills`, and `dim_models` for every alias on every boot — visible
      noise + wasted DB cycles. We're a data studio shipping
      anti-patterns: data migrations should run once, against a
      versioned migrations table, not on every process restart.

      **Proper fix:** introduce a lightweight `applied_migrations`
      table (id, name, applied_at). Wrap `migrateModelIds` in a guard
      that checks for its name, runs once, and inserts the row. Move
      ad-hoc backfills under `packages/server/src/db/migrations/` and
      run manually via `npx tsx`, mirroring the
      `seed-model-studio-prompts.ts` pattern.

      **Why it matters:** matches DMBOK governance principles, ends the
      log noise, and removes a real long-tail risk (an aliasMap edit
      + boot can corrupt rows without anyone noticing).
