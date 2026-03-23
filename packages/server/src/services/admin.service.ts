import { eq } from 'drizzle-orm';
import type { DatabaseStatus, TableInfo, QueryResult } from '@cc/shared';
import { db, pool, schema } from '../db/index.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

// --- AI Provider definitions ---

interface ModelDef {
  id: string;
  name: string;
  description?: string;
}

interface ProviderDef {
  name: string;
  providerType: string;
  icon: string;
  models: ModelDef[];
}

const DEFAULT_PROVIDERS: ProviderDef[] = [
  {
    name: 'OpenRouter',
    providerType: 'openrouter',
    icon: '🌐',
    models: [
      { id: 'openrouter/auto', name: 'Auto (best available)', description: 'OpenRouter picks the best model' },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Via OpenRouter' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'Via OpenRouter' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Via OpenRouter' },
      { id: 'meta-llama/llama-3.1-405b', name: 'Llama 3.1 405B', description: 'Via OpenRouter' },
      { id: 'perplexity/sonar-pro', name: 'Perplexity Sonar Pro', description: 'Web search built-in — best for research' },
      { id: 'perplexity/sonar', name: 'Perplexity Sonar', description: 'Web search built-in — fast research' },
      { id: 'perplexity/sonar-deep-research', name: 'Perplexity Deep Research', description: 'Web search — thorough multi-step research' },
      { id: 'qwen/qwen3.5-122b-a10b', name: 'Qwen 3.5 122B', description: 'Large MoE model — strong reasoning and multilingual' },
      { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', description: 'Fast next-gen Gemini' },
      { id: 'google/gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview', description: 'Lightweight and fast' },
      { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', description: 'Most capable Gemini — strong reasoning' },
      { id: 'google/gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image', description: 'Image generation via Gemini' },
      { id: 'google/gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', description: 'High quality image generation' },
      { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', description: 'Latest DeepSeek — strong reasoning and coding' },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', description: 'Reasoning model — deep chain-of-thought' },
      { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek V3.1', description: 'Fast and capable general model' },
      { id: 'mistralai/mistral-large-2512', name: 'Mistral Large', description: 'Best Mistral — creative writing + reasoning ($0.50/M)' },
      { id: 'mistralai/mistral-small-2603', name: 'Mistral Small', description: 'Fast structured output — great for editing ($0.15/M)' },
      { id: 'mistralai/mistral-medium-3.1', name: 'Mistral Medium 3.1', description: 'Balanced speed and quality ($0.40/M)' },
    ],
  },
  {
    name: 'Anthropic',
    providerType: 'anthropic',
    icon: '🤖',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', description: 'Most efficient for everyday tasks' },
      { id: 'claude-opus-4-6', name: 'Opus 4.6', description: 'Most powerful for complex tasks' },
      { id: 'claude-haiku-4-5', name: 'Haiku 4.5', description: 'Fastest and most affordable' },
      { id: 'claude-opus-4-5', name: 'Opus 4.5', description: 'Previous gen powerhouse' },
      { id: 'claude-sonnet-4-5', name: 'Sonnet 4.5', description: 'Previous gen balanced' },
    ],
  },
  {
    name: 'OpenAI',
    providerType: 'openai',
    icon: '💚',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o — Flagship model' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini — Fast & cheap' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'o3-mini', name: 'o3 Mini — Reasoning model' },
    ],
  },
  {
    name: 'xAI',
    providerType: 'xai',
    icon: '✖',
    models: [
      { id: 'grok-2', name: 'Grok 2 — Full power' },
      { id: 'grok-2-mini', name: 'Grok 2 Mini — Lightweight' },
    ],
  },
  {
    name: 'Google Gemini',
    providerType: 'gemini',
    icon: '💎',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro — Most capable' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash — Fast' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    ],
  },
  {
    name: 'Mistral',
    providerType: 'mistral',
    icon: '🌀',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large — Most capable' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium' },
      { id: 'mistral-small-latest', name: 'Mistral Small — Fast & efficient' },
    ],
  },
];

// --- Role seed ---

const DEFAULT_ROLES = [
  { name: 'administrator', description: 'Full system access — manage users, roles, settings, and all content', isSystem: true },
  { name: 'subscriber', description: 'Free tier — access to built-in skills and basic flows', isSystem: true },
  { name: 'paid_subscriber', description: 'Paid tier — custom skill creation, advanced flows, and priority execution', isSystem: true },
  { name: 'founder_member', description: 'Early adopter — full access with lifetime benefits', isSystem: true },
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
  for (const prov of DEFAULT_PROVIDERS) {
    const existing = await db.query.aiProviders.findFirst({
      where: eq(schema.aiProviders.providerType, prov.providerType),
    });

    if (!existing) {
      await db.insert(schema.aiProviders).values({
        name: prov.name,
        providerType: prov.providerType,
        isEnabled: false,
        config: { icon: prov.icon, models: prov.models, apiKey: '' },
      });
      logger.info({ provider: prov.name }, 'AI provider seeded');
    } else {
      // Update models and icon while preserving the user's API key
      const existingCfg = existing.config as { apiKey?: string };
      await db
        .update(schema.aiProviders)
        .set({
          name: prov.name,
          config: { icon: prov.icon, models: prov.models, apiKey: existingCfg.apiKey ?? '' },
        })
        .where(eq(schema.aiProviders.id, existing.id));
    }
  }
}

export async function getAIProviders() {
  const providers = await db.query.aiProviders.findMany({
    orderBy: schema.aiProviders.name,
  });

  return providers.map((p) => {
    const cfg = p.config as { icon?: string; models?: ModelDef[] | string[]; apiKey?: string };
    const hasKey = !!cfg.apiKey;
    const models = (cfg.models ?? []).map((m) =>
      typeof m === 'string' ? { id: m, name: m } : m,
    );
    return {
      id: p.id,
      name: p.name,
      providerType: p.providerType,
      icon: cfg.icon ?? '',
      models,
      isConfigured: hasKey,
      maskedKey: hasKey ? `****${cfg.apiKey!.slice(-4)}` : '',
      isEnabled: p.isEnabled,
    };
  });
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
  const providers = await db.query.aiProviders.findMany({
    where: eq(schema.aiProviders.isEnabled, true),
  });

  return providers.flatMap((p) => {
    const cfg = p.config as { icon?: string; models?: ModelDef[] | string[]; apiKey?: string };
    if (!cfg.apiKey) return [];
    return (cfg.models ?? []).map((m) => {
      const model = typeof m === 'string' ? { id: m, name: m } : m;
      return {
        model: model.id,
        displayName: model.name,
        description: (model as ModelDef).description ?? '',
        provider: p.name,
        providerType: p.providerType,
        icon: cfg.icon ?? '',
      };
    });
  });
}

const DDL_BLOCKLIST = /\b(DROP\s+(DATABASE|TABLE|SCHEMA|INDEX)|ALTER\s+TABLE|TRUNCATE|CREATE\s+(DATABASE|SCHEMA))\b/i;
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

  const [created] = await db
    .insert(schema.settings)
    .values({ key, value, isSecret })
    .returning();
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
    const result = await client.query(`
      SELECT
        t.relname AS name,
        COALESCE(t.n_live_tup, 0)::int AS row_count,
        pg_total_relation_size(c.oid)::bigint AS size_bytes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS size_pretty,
        (SELECT count(*)::int FROM information_schema.columns col WHERE col.table_name = t.relname AND col.table_schema = 'public') AS column_count
      FROM pg_stat_user_tables t
      JOIN pg_class c ON c.relname = t.relname
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      ORDER BY t.relname
    `);

    return result.rows.map((row) => ({
      name: row.name,
      rowCount: row.row_count,
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
    throw new Error('DDL statements are not allowed (DROP, ALTER TABLE, TRUNCATE, CREATE DATABASE/SCHEMA)');
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
