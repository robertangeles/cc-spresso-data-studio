import { eq, ilike, and, or, sql, count } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../utils/errors.js';
import type { OpenRouterCatalogModel } from '@cc/shared';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

// ------------------------------------------------------------------
// OpenRouter /api/v1/models response shape (subset we care about)
// ------------------------------------------------------------------
interface OpenRouterModelResponse {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  top_provider?: { max_completion_tokens?: number };
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string; tokenizer?: string };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Strip HTML tags from OpenRouter descriptions to prevent XSS */
function sanitizeHtml(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw.replace(/<[^>]*>/g, '').trim() || null;
}

/** Extract provider slug from model ID, e.g. "anthropic" from "anthropic/claude-sonnet-4" */
function extractProviderSlug(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash > 0 ? modelId.slice(0, slash) : 'unknown';
}

/** Detect vision support from architecture.modality */
function detectVision(modality: string | undefined): boolean {
  if (!modality) return false;
  return modality.includes('image') && modality.includes('text');
}

/** Detect image generation from architecture.modality */
function detectImageGen(modality: string | undefined): boolean {
  if (!modality) return false;
  // Models that output images have "image" in their output modality
  // OpenRouter format: "text+image->text" (vision) vs "text->text+image" (image gen)
  const parts = modality.split('->');
  if (parts.length === 2) {
    return parts[1].includes('image');
  }
  return false;
}

/** Parse pricing string (e.g. "0.000003") to cost per 1M tokens */
function parsePricing(raw: string | undefined): number {
  if (!raw) return 0;
  const perToken = parseFloat(raw);
  if (isNaN(perToken)) return 0;
  return perToken * 1_000_000;
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

export async function syncModelCatalog(
  apiKey: string,
): Promise<{ added: number; updated: number }> {
  const startTime = Date.now();
  let added = 0;
  let updated = 0;

  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new AppError(401, 'OpenRouter API key is invalid. Check Settings > Integrations.');
    }
    if (response.status === 429) {
      logger.warn('OpenRouter rate limited during catalog sync, skipping');
      return { added: 0, updated: 0 };
    }
    throw new AppError(502, `OpenRouter API returned ${response.status}: ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as { data?: OpenRouterModelResponse[] };
  const models = json.data;
  if (!Array.isArray(models) || models.length === 0) {
    logger.warn('OpenRouter returned empty model list, skipping sync');
    return { added: 0, updated: 0 };
  }

  const now = new Date();

  for (const m of models) {
    if (!m.id || !m.name) continue;

    const modality = m.architecture?.modality;
    const values = {
      modelId: m.id,
      displayName: m.name,
      description: sanitizeHtml(m.description),
      contextLength: m.context_length ?? 4096,
      maxOutputTokens: m.top_provider?.max_completion_tokens ?? null,
      inputCostPerM: parsePricing(m.pricing?.prompt),
      outputCostPerM: parsePricing(m.pricing?.completion),
      supportsVision: detectVision(modality),
      supportsStreaming: true,
      supportsImageGen: detectImageGen(modality),
      providerSlug: extractProviderSlug(m.id),
      lastSyncedAt: now,
      updatedAt: now,
    };

    const existing = await db.query.openrouterModelCatalog.findFirst({
      where: eq(schema.openrouterModelCatalog.modelId, m.id),
    });

    if (existing) {
      await db
        .update(schema.openrouterModelCatalog)
        .set(values)
        .where(eq(schema.openrouterModelCatalog.modelId, m.id));
      updated++;
    } else {
      await db.insert(schema.openrouterModelCatalog).values({
        ...values,
        isEnabled: false,
      });
      added++;
    }
  }

  // Also sync pricing to dimModels for usage tracking
  await syncDimModelsPricing();

  const durationMs = Date.now() - startTime;
  logger.info({ added, updated, total: models.length, durationMs }, 'OpenRouter catalog synced');

  return { added, updated };
}

export async function getEnabledModels(): Promise<OpenRouterCatalogModel[]> {
  const rows = await db.query.openrouterModelCatalog.findMany({
    where: eq(schema.openrouterModelCatalog.isEnabled, true),
    orderBy: [
      schema.openrouterModelCatalog.providerSlug,
      schema.openrouterModelCatalog.displayName,
    ],
  });
  return rows.map(mapToDto);
}

export async function getCatalog(
  search?: string,
  provider?: string,
): Promise<OpenRouterCatalogModel[]> {
  const conditions = [];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(schema.openrouterModelCatalog.displayName, pattern),
        ilike(schema.openrouterModelCatalog.modelId, pattern),
      ),
    );
  }

  if (provider) {
    conditions.push(eq(schema.openrouterModelCatalog.providerSlug, provider));
  }

  const rows = await db.query.openrouterModelCatalog.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [
      schema.openrouterModelCatalog.providerSlug,
      schema.openrouterModelCatalog.displayName,
    ],
  });

  return rows.map(mapToDto);
}

export async function toggleModelEnabled(
  modelId: string,
  enabled: boolean,
): Promise<OpenRouterCatalogModel> {
  // Enforce minimum 1 enabled model
  if (!enabled) {
    const [{ value: enabledCount }] = await db
      .select({ value: count() })
      .from(schema.openrouterModelCatalog)
      .where(eq(schema.openrouterModelCatalog.isEnabled, true));

    if (enabledCount <= 1) {
      throw new AppError(400, 'At least one model must remain enabled.');
    }
  }

  const [updated] = await db
    .update(schema.openrouterModelCatalog)
    .set({ isEnabled: enabled, updatedAt: new Date() })
    .where(eq(schema.openrouterModelCatalog.modelId, modelId))
    .returning();

  if (!updated) {
    throw new AppError(404, `Model not found: ${modelId}`);
  }

  logger.info({ modelId, enabled }, 'Model toggle updated');
  return mapToDto(updated);
}

export async function batchToggleModels(modelIds: string[], enabled: boolean): Promise<void> {
  if (modelIds.length === 0) return;

  // Enforce minimum 1 enabled model when disabling
  if (!enabled) {
    const [{ value: enabledCount }] = await db
      .select({ value: count() })
      .from(schema.openrouterModelCatalog)
      .where(eq(schema.openrouterModelCatalog.isEnabled, true));

    // Count how many of the targets are currently enabled
    const targetRows = await db.query.openrouterModelCatalog.findMany({
      where: and(
        eq(schema.openrouterModelCatalog.isEnabled, true),
        sql`${schema.openrouterModelCatalog.modelId} = ANY(${modelIds})`,
      ),
    });

    if (enabledCount - targetRows.length < 1) {
      throw new AppError(400, 'At least one model must remain enabled.');
    }
  }

  await db
    .update(schema.openrouterModelCatalog)
    .set({ isEnabled: enabled, updatedAt: new Date() })
    .where(sql`${schema.openrouterModelCatalog.modelId} = ANY(${modelIds})`);

  logger.info({ count: modelIds.length, enabled }, 'Batch model toggle');
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

function mapToDto(row: typeof schema.openrouterModelCatalog.$inferSelect): OpenRouterCatalogModel {
  return {
    id: row.id,
    modelId: row.modelId,
    displayName: row.displayName,
    description: row.description,
    contextLength: row.contextLength,
    maxOutputTokens: row.maxOutputTokens,
    inputCostPerM: row.inputCostPerM,
    outputCostPerM: row.outputCostPerM,
    supportsVision: row.supportsVision,
    supportsStreaming: row.supportsStreaming,
    supportsImageGen: row.supportsImageGen,
    providerSlug: row.providerSlug,
    isEnabled: row.isEnabled,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  };
}

/** Sync catalog pricing into dimModels for usage cost tracking */
async function syncDimModelsPricing(): Promise<void> {
  const enabledModels = await db.query.openrouterModelCatalog.findMany({
    where: eq(schema.openrouterModelCatalog.isEnabled, true),
  });

  for (const m of enabledModels) {
    const existing = await db.query.dimModels.findFirst({
      where: eq(schema.dimModels.modelId, m.modelId),
    });

    if (existing) {
      // Only update pricing if it was auto-synced (don't overwrite manual overrides)
      // We update displayName and provider always
      await db
        .update(schema.dimModels)
        .set({
          provider: m.providerSlug,
          displayName: m.displayName,
          updatedAt: new Date(),
        })
        .where(eq(schema.dimModels.id, existing.id));
    } else {
      await db.insert(schema.dimModels).values({
        modelId: m.modelId,
        provider: m.providerSlug,
        displayName: m.displayName,
        inputCostPerM: m.inputCostPerM,
        outputCostPerM: m.outputCostPerM,
        isActive: true,
      });
    }
  }
}
