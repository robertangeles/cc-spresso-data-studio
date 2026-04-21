import { eq, sql } from 'drizzle-orm';
import type { DatabaseStatus, TableInfo, QueryResult } from '@cc/shared';
import { db, pool, schema } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { runOnce } from '../db/migration-runner.js';
import {
  addCanvasStatesNotationColumn,
  addRelationshipsVersionAndIndexes,
} from '../db/migrations/step6-relationships.js';
import {
  addAttributesAltKeyGroupColumn,
  addEntitiesDisplayIdColumn,
  addRelationshipsInverseNameColumn,
} from '../db/migrations/step6-direction-a.js';
import { addEntitiesAltKeyLabelsColumn } from '../db/migrations/step6-alt-key-labels.js';

// --- AI Provider: OpenRouter is the single gateway ---

// --- Role seed ---

const DEFAULT_ROLES = [
  {
    name: 'Administrator',
    description: 'Full system access — manage users, roles, settings, and all content',
    isSystem: true,
  },
  {
    name: 'Subscriber',
    description: 'Free tier — access to built-in skills and basic flows',
    isSystem: true,
  },
  {
    name: 'Paid Subscriber',
    description: 'Paid tier — custom skill creation, advanced flows, and priority execution',
    isSystem: true,
  },
  {
    name: 'Founder Member',
    description: 'Early adopter — full access with lifetime benefits',
    isSystem: true,
  },
];

export async function seedRoles(): Promise<void> {
  for (const role of DEFAULT_ROLES) {
    const existing = await db.query.roles.findFirst({
      where: eq(schema.roles.name, role.name),
    });
    if (!existing) {
      await db.insert(schema.roles).values({
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: [],
      });
      logger.info({ role: role.name }, 'Role seeded');
    }
  }
}

export async function seedAIProviders(): Promise<void> {
  // Ensure single OpenRouter provider row exists
  const existing = await db.query.aiProviders.findFirst({
    where: eq(schema.aiProviders.providerType, 'openrouter'),
  });

  if (!existing) {
    // Check if there's an old Anthropic provider with an API key we should note
    await db.insert(schema.aiProviders).values({
      name: 'OpenRouter',
      providerType: 'openrouter',
      isEnabled: false,
      config: { icon: '🌐', apiKey: '' },
    });
    logger.info('OpenRouter AI provider seeded');
  }

  // Disable any non-OpenRouter providers (legacy cleanup)
  await db
    .update(schema.aiProviders)
    .set({ isEnabled: false })
    .where(sql`${schema.aiProviders.providerType} != 'openrouter'`);

  // --- Data migration: convert old model IDs to OpenRouter format ---
  // Guarded by `applied_migrations.name = 'migrate-model-id-prefixes'`
  // so the ~100 UPDATE statements below only run on the first boot of
  // a fresh environment, not on every server restart.
  await runOnce('migrate-model-id-prefixes', migrateModelIds);

  // Step 6 — Relationships + IE/IDEF1X notation schema adapters.
  // Each ALTER is itself idempotent (`IF NOT EXISTS`), so the runOnce
  // guard here is primarily to silence the boot-time log spam and keep
  // the applied_migrations audit trail accurate.
  await runOnce('add-canvas-states-notation-column', addCanvasStatesNotationColumn);
  await runOnce('add-relationships-version-and-indexes', addRelationshipsVersionAndIndexes);

  // Step 6 Direction A — BK/AK groups, inverse verb phrases, display IDs.
  // Column ADDs are idempotent (`IF NOT EXISTS`); the display_id backfill
  // is scoped to `WHERE display_id IS NULL` so re-runs are harmless.
  await runOnce('add-attributes-alt-key-group', addAttributesAltKeyGroupColumn);
  await runOnce('add-relationships-inverse-name', addRelationshipsInverseNameColumn);
  await runOnce('add-entities-display-id', addEntitiesDisplayIdColumn);

  // Step 6 Direction A follow-up — per-AK-group descriptive labels on
  // entities. Idempotent (`ADD COLUMN IF NOT EXISTS`); no backfill.
  await runOnce('add-entities-alt-key-labels', addEntitiesAltKeyLabelsColumn);
}

/** One-time idempotent migration: convert short model IDs to OpenRouter format */
async function migrateModelIds(): Promise<void> {
  const aliasMap: Record<string, string> = {
    // Anthropic direct SDK format → OpenRouter format
    'claude-sonnet-4-6': 'anthropic/claude-sonnet-4-6',
    'claude-opus-4-6': 'anthropic/claude-opus-4-6',
    'claude-haiku-4-5': 'anthropic/claude-haiku-4-5',
    'claude-opus-4-5': 'anthropic/claude-opus-4-5',
    'claude-sonnet-4-5': 'anthropic/claude-sonnet-4-5',
    // OpenAI phantom provider
    'gpt-4o': 'openai/gpt-4o',
    'gpt-4o-mini': 'openai/gpt-4o-mini',
    'gpt-4-turbo': 'openai/gpt-4-turbo',
    'o3-mini': 'openai/o3-mini',
    // xAI phantom provider
    'grok-2': 'xai/grok-2',
    'grok-2-mini': 'xai/grok-2-mini',
    // Gemini phantom provider
    'gemini-2.5-pro': 'google/gemini-2.5-pro',
    'gemini-2.5-flash': 'google/gemini-2.5-flash',
    'gemini-2.0-flash': 'google/gemini-2.0-flash',
    // Mistral phantom provider
    'mistral-large-latest': 'mistralai/mistral-large-latest',
    'mistral-medium-latest': 'mistralai/mistral-medium-latest',
    'mistral-small-latest': 'mistralai/mistral-small-latest',
  };

  // Tables with a `model` column to migrate
  const modelColumnTables = ['conversations', 'flow_steps'];
  // Tables with `default_model` / `default_editor_model` columns
  const profileColumns = ['default_model', 'default_editor_model'];

  let totalUpdated = 0;

  for (const [oldId, newId] of Object.entries(aliasMap)) {
    // Conversations and flow_steps
    for (const table of modelColumnTables) {
      const result = await db.execute(
        sql`UPDATE ${sql.identifier(table)} SET model = ${newId} WHERE model = ${oldId}`,
      );
      totalUpdated += (result as unknown as { rowCount: number }).rowCount ?? 0;
    }

    // User profiles
    for (const col of profileColumns) {
      const result = await db.execute(
        sql`UPDATE user_profiles SET ${sql.identifier(col)} = ${newId} WHERE ${sql.identifier(col)} = ${oldId}`,
      );
      totalUpdated += (result as unknown as { rowCount: number }).rowCount ?? 0;
    }

    // Skills default_model
    const skillResult = await db.execute(
      sql`UPDATE skills SET default_model = ${newId} WHERE default_model = ${oldId}`,
    );
    totalUpdated += (skillResult as unknown as { rowCount: number }).rowCount ?? 0;

    // dimModels pricing table
    const dimResult = await db.execute(
      sql`UPDATE dim_models SET model_id = ${newId} WHERE model_id = ${oldId}`,
    );
    totalUpdated += (dimResult as unknown as { rowCount: number }).rowCount ?? 0;
  }

  if (totalUpdated > 0) {
    logger.info({ totalUpdated }, 'Model ID migration completed');
  }
}

export async function getAIProviders() {
  // Return only the OpenRouter provider
  const provider = await db.query.aiProviders.findFirst({
    where: eq(schema.aiProviders.providerType, 'openrouter'),
  });

  if (!provider) return [];

  const cfg = provider.config as { icon?: string; apiKey?: string };
  const hasKey = !!cfg.apiKey;

  return [
    {
      id: provider.id,
      name: provider.name,
      providerType: provider.providerType,
      icon: cfg.icon ?? '🌐',
      models: [], // Models now come from catalog, not provider config
      isConfigured: hasKey,
      maskedKey: hasKey ? `****${cfg.apiKey!.slice(-4)}` : '',
      isEnabled: provider.isEnabled,
    },
  ];
}

export async function getAIProviderRawKey(providerId: string) {
  const provider = await db.query.aiProviders.findFirst({
    where: eq(schema.aiProviders.id, providerId),
  });
  if (!provider) return null;
  const cfg = provider.config as { apiKey?: string };
  return cfg.apiKey ?? '';
}

export async function updateAIProviderKey(providerId: string, apiKey: string) {
  const provider = await db.query.aiProviders.findFirst({
    where: eq(schema.aiProviders.id, providerId),
  });
  if (!provider) throw new Error('Provider not found');

  const cfg = provider.config as Record<string, unknown>;
  const hasKey = apiKey.length > 0;

  await db
    .update(schema.aiProviders)
    .set({
      config: { ...cfg, apiKey },
      isEnabled: hasKey,
    })
    .where(eq(schema.aiProviders.id, providerId));

  return { success: true };
}

export async function getConfiguredModels() {
  // Read from catalog — enabled models only
  const models = await db.query.openrouterModelCatalog.findMany({
    where: eq(schema.openrouterModelCatalog.isEnabled, true),
    orderBy: [
      schema.openrouterModelCatalog.providerSlug,
      schema.openrouterModelCatalog.displayName,
    ],
  });

  return models.map((m) => ({
    model: m.modelId,
    displayName: m.displayName,
    description: m.description ?? '',
    provider: m.providerSlug,
    providerType: 'openrouter',
    providerSlug: m.providerSlug,
    icon: '🌐',
  }));
}

/** Get the raw OpenRouter API key for catalog sync */
export async function getOpenRouterApiKey(): Promise<string | null> {
  const provider = await db.query.aiProviders.findFirst({
    where: eq(schema.aiProviders.providerType, 'openrouter'),
  });
  if (!provider) return null;
  const cfg = provider.config as { apiKey?: string };
  return cfg.apiKey || null;
}

const DDL_BLOCKLIST =
  /\b(DROP\s+(DATABASE|TABLE|SCHEMA|INDEX)|ALTER\s+TABLE|TRUNCATE|CREATE\s+(DATABASE|SCHEMA))\b/i;
const DML_PATTERN = /\b(INSERT|UPDATE|DELETE)\b/i;
const MAX_ROWS = 500;
const STATEMENT_TIMEOUT_MS = 10_000;

function maskUrl(url: string): string {
  const last8 = url.slice(-8);
  return `****${last8}`;
}

export function getDatabaseUrl(): { raw: string; masked: string } {
  return {
    raw: config.database.url,
    masked: maskUrl(config.database.url),
  };
}

export async function getSetting(key: string) {
  const setting = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });
  return setting ?? null;
}

export async function updateSetting(key: string, value: string, isSecret = false) {
  const existing = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });

  if (existing) {
    const [updated] = await db
      .update(schema.settings)
      .set({ value, isSecret, updatedAt: new Date() })
      .where(eq(schema.settings.key, key))
      .returning();
    return updated;
  }

  const [created] = await db.insert(schema.settings).values({ key, value, isSecret }).returning();
  return created;
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const client = await pool.connect();
  try {
    const versionResult = await client.query('SELECT version()');
    const dbNameResult = await client.query('SELECT current_database()');
    const tableCountResult = await client.query(
      "SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );

    return {
      connected: true,
      version: versionResult.rows[0].version,
      dbName: dbNameResult.rows[0].current_database,
      maskedUrl: maskUrl(config.database.url),
      tableCount: tableCountResult.rows[0].count,
    };
  } catch {
    return {
      connected: false,
      version: 'unknown',
      dbName: 'unknown',
      maskedUrl: maskUrl(config.database.url),
      tableCount: 0,
    };
  } finally {
    client.release();
  }
}

export async function getTableInfo(): Promise<TableInfo[]> {
  const client = await pool.connect();
  try {
    // Size + column count come from catalog (instant). Row counts come from
    // a real COUNT(*) per table rather than pg_stat_user_tables.n_live_tup
    // (which is an autovacuum-updated estimate and can be minutes stale —
    // users clicked Refresh expecting accurate numbers).
    const meta = await client.query(`
      SELECT
        c.relname AS name,
        pg_total_relation_size(c.oid)::bigint AS size_bytes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS size_pretty,
        (SELECT count(*)::int FROM information_schema.columns col
          WHERE col.table_name = c.relname AND col.table_schema = 'public') AS column_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `);

    // Count rows per table, parallel. Each table name is a Postgres identifier,
    // so we validate with a regex before interpolating (no SQL injection).
    const safeName = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    const counts = await Promise.all(
      meta.rows.map(async (row) => {
        const name = row.name as string;
        if (!safeName.test(name)) return [name, 0] as const;
        try {
          const r = await client.query(`SELECT COUNT(*)::int AS n FROM "${name}"`);
          return [name, r.rows[0].n as number] as const;
        } catch {
          return [name, 0] as const;
        }
      }),
    );
    const byName = new Map(counts);

    return meta.rows.map((row) => ({
      name: row.name,
      rowCount: byName.get(row.name) ?? 0,
      sizeBytes: Number(row.size_bytes),
      sizePretty: row.size_pretty,
      columnCount: row.column_count,
    }));
  } finally {
    client.release();
  }
}

export async function executeQuery(
  sql: string,
  mode: 'read' | 'write',
  userId: string,
): Promise<QueryResult> {
  // Block DDL in all modes
  if (DDL_BLOCKLIST.test(sql)) {
    throw new Error(
      'DDL statements are not allowed (DROP, ALTER TABLE, TRUNCATE, CREATE DATABASE/SCHEMA)',
    );
  }

  // Block DML in read mode
  if (mode === 'read' && DML_PATTERN.test(sql)) {
    throw new Error('Write operations (INSERT, UPDATE, DELETE) are not allowed in read mode');
  }

  logger.info({ userId, mode, sql: sql.substring(0, 200) }, 'Query executed');

  const client = await pool.connect();
  const start = Date.now();

  try {
    await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}'`);

    if (mode === 'read') {
      await client.query('BEGIN READ ONLY');
    } else {
      await client.query('BEGIN');
    }

    // Append LIMIT if not present in read mode
    let execSql = sql.trim();
    if (mode === 'read' && !/\bLIMIT\b/i.test(execSql)) {
      execSql = execSql.replace(/;?\s*$/, '') + ` LIMIT ${MAX_ROWS}`;
    }

    const result = await client.query(execSql);

    if (mode === 'read') {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }

    const duration = Date.now() - start;
    const columns = result.fields?.map((f) => f.name) ?? [];
    const rows = result.rows ?? [];

    return {
      columns,
      rows: rows.slice(0, MAX_ROWS),
      rowCount: result.rowCount ?? 0,
      duration,
      command: result.command ?? 'UNKNOWN',
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.query('RESET statement_timeout').catch(() => {});
    client.release();
  }
}
