import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../config/logger.js';

// --- Types ---

interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
  avgDurationMs: number;
}

interface UsageByModel {
  modelId: string;
  displayName: string;
  provider: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
  percentage: number;
}

interface UsageByFlow {
  flowId: string;
  flowName: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
}

interface UsageByUser {
  userId: string;
  userName: string;
  userEmail: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
}

interface UsageTimeseries {
  date: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  requestCount: number;
}

interface CostSuggestion {
  flowName: string;
  flowId: string;
  stepIndex: number;
  currentModel: string;
  currentCostPerM: number;
  suggestedModel: string;
  suggestedCostPerM: number;
  savingsPercent: number;
}

// --- Aggregation ---

/**
 * Aggregate execution_logs into fact_usage.
 * Scans all execution_logs, joins dim_models for cost, upserts into fact_usage.
 */
export async function aggregate(): Promise<{ rowsProcessed: number; factRowsUpserted: number }> {
  logger.info('Starting usage aggregation');

  // Load model pricing map
  const models = await db.query.dimModels.findMany();
  const modelPricing = new Map<string, { id: string; inputCostPerM: number; outputCostPerM: number }>();
  for (const m of models) {
    modelPricing.set(m.modelId, { id: m.id, inputCostPerM: m.inputCostPerM, outputCostPerM: m.outputCostPerM });
  }

  // Aggregate execution_logs by (userId, model, flowId, date)
  const logs = await db.query.executionLogs.findMany();
  const buckets = new Map<string, {
    userId: string;
    dimModelId: string;
    flowId: string | null;
    usageDate: string;
    source: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    requestCount: number;
    durationMs: number;
  }>();

  let rowsProcessed = 0;

  for (const log of logs) {
    const pricing = modelPricing.get(log.model);
    if (!pricing) {
      // Try without provider prefix
      const shortModel = log.model.split('/').pop() ?? log.model;
      const fallback = [...modelPricing.entries()].find(([k]) => k.endsWith(shortModel));
      if (!fallback) {
        logger.warn({ model: log.model }, 'No pricing found for model — skipping');
        continue;
      }
    }

    const p = pricing ?? [...modelPricing.entries()].find(([k]) => k.endsWith(log.model.split('/').pop() ?? ''))?.[1];
    if (!p) continue;

    const dateStr = new Date(log.createdAt).toISOString().split('T')[0];
    const key = `${log.userId}|${p.id}|${log.flowId}|${dateStr}|orchestration`;

    const bucket = buckets.get(key) ?? {
      userId: log.userId,
      dimModelId: p.id,
      flowId: log.flowId,
      usageDate: dateStr,
      source: 'orchestration',
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      requestCount: 0,
      durationMs: 0,
    };

    bucket.inputTokens += log.inputTokens;
    bucket.outputTokens += log.outputTokens;
    bucket.cost += (log.inputTokens / 1_000_000) * p.inputCostPerM + (log.outputTokens / 1_000_000) * p.outputCostPerM;
    bucket.requestCount += 1;
    bucket.durationMs += log.duration;
    buckets.set(key, bucket);
    rowsProcessed++;
  }

  // Upsert into fact_usage
  let factRowsUpserted = 0;
  for (const bucket of buckets.values()) {
    // Check if row exists for this grain
    const existing = await db.query.factUsage.findFirst({
      where: and(
        eq(schema.factUsage.userId, bucket.userId),
        eq(schema.factUsage.modelId, bucket.dimModelId),
        eq(schema.factUsage.usageDate, bucket.usageDate),
        eq(schema.factUsage.source, bucket.source),
        bucket.flowId
          ? eq(schema.factUsage.flowId, bucket.flowId)
          : sql`${schema.factUsage.flowId} IS NULL`,
      ),
    });

    if (existing) {
      await db.update(schema.factUsage)
        .set({
          totalInputTokens: bucket.inputTokens,
          totalOutputTokens: bucket.outputTokens,
          totalCost: bucket.cost,
          requestCount: bucket.requestCount,
          totalDurationMs: bucket.durationMs,
          updatedAt: new Date(),
        })
        .where(eq(schema.factUsage.id, existing.id));
    } else {
      await db.insert(schema.factUsage).values({
        userId: bucket.userId,
        modelId: bucket.dimModelId,
        flowId: bucket.flowId,
        usageDate: bucket.usageDate,
        source: bucket.source,
        totalInputTokens: bucket.inputTokens,
        totalOutputTokens: bucket.outputTokens,
        totalCost: bucket.cost,
        requestCount: bucket.requestCount,
        totalDurationMs: bucket.durationMs,
      });
    }
    factRowsUpserted++;
  }

  logger.info({ rowsProcessed, factRowsUpserted }, 'Usage aggregation complete');
  return { rowsProcessed, factRowsUpserted };
}

// --- Query Methods ---

function dateFilters(from?: string, to?: string) {
  const conditions = [];
  if (from) conditions.push(gte(schema.factUsage.usageDate, from));
  if (to) conditions.push(lte(schema.factUsage.usageDate, to));
  return conditions;
}

export async function getSummary(from?: string, to?: string): Promise<UsageSummary> {
  const conditions = dateFilters(from, to);

  const result = await db
    .select({
      totalInputTokens: sql<number>`COALESCE(SUM(${schema.factUsage.totalInputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${schema.factUsage.totalOutputTokens}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${schema.factUsage.totalCost}), 0)`,
      requestCount: sql<number>`COALESCE(SUM(${schema.factUsage.requestCount}), 0)`,
      avgDurationMs: sql<number>`COALESCE(AVG(${schema.factUsage.totalDurationMs}), 0)`,
    })
    .from(schema.factUsage)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const row = result[0];
  return {
    totalInputTokens: Number(row.totalInputTokens),
    totalOutputTokens: Number(row.totalOutputTokens),
    totalCost: Number(row.totalCost),
    requestCount: Number(row.requestCount),
    avgDurationMs: Math.round(Number(row.avgDurationMs)),
  };
}

export async function getByModel(from?: string, to?: string): Promise<UsageByModel[]> {
  const conditions = dateFilters(from, to);

  const rows = await db
    .select({
      modelId: schema.dimModels.modelId,
      displayName: schema.dimModels.displayName,
      provider: schema.dimModels.provider,
      totalInputTokens: sql<number>`SUM(${schema.factUsage.totalInputTokens})`,
      totalOutputTokens: sql<number>`SUM(${schema.factUsage.totalOutputTokens})`,
      totalCost: sql<number>`SUM(${schema.factUsage.totalCost})`,
      requestCount: sql<number>`SUM(${schema.factUsage.requestCount})`,
    })
    .from(schema.factUsage)
    .innerJoin(schema.dimModels, eq(schema.factUsage.modelId, schema.dimModels.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(schema.dimModels.modelId, schema.dimModels.displayName, schema.dimModels.provider)
    .orderBy(desc(sql`SUM(${schema.factUsage.totalCost})`));

  const totalCost = rows.reduce((sum, r) => sum + Number(r.totalCost), 0);

  return rows.map((r) => ({
    modelId: r.modelId,
    displayName: r.displayName,
    provider: r.provider,
    totalInputTokens: Number(r.totalInputTokens),
    totalOutputTokens: Number(r.totalOutputTokens),
    totalCost: Number(r.totalCost),
    requestCount: Number(r.requestCount),
    percentage: totalCost > 0 ? Math.round((Number(r.totalCost) / totalCost) * 100) : 0,
  }));
}

export async function getByFlow(from?: string, to?: string): Promise<UsageByFlow[]> {
  const conditions = [
    ...dateFilters(from, to),
    sql`${schema.factUsage.flowId} IS NOT NULL`,
  ];

  const rows = await db
    .select({
      flowId: schema.flows.id,
      flowName: schema.flows.name,
      totalInputTokens: sql<number>`SUM(${schema.factUsage.totalInputTokens})`,
      totalOutputTokens: sql<number>`SUM(${schema.factUsage.totalOutputTokens})`,
      totalCost: sql<number>`SUM(${schema.factUsage.totalCost})`,
      requestCount: sql<number>`SUM(${schema.factUsage.requestCount})`,
    })
    .from(schema.factUsage)
    .innerJoin(schema.flows, eq(schema.factUsage.flowId, schema.flows.id))
    .where(and(...conditions))
    .groupBy(schema.flows.id, schema.flows.name)
    .orderBy(desc(sql`SUM(${schema.factUsage.totalCost})`));

  return rows.map((r) => ({
    flowId: r.flowId,
    flowName: r.flowName,
    totalInputTokens: Number(r.totalInputTokens),
    totalOutputTokens: Number(r.totalOutputTokens),
    totalCost: Number(r.totalCost),
    requestCount: Number(r.requestCount),
  }));
}

export async function getByUser(from?: string, to?: string): Promise<UsageByUser[]> {
  const conditions = dateFilters(from, to);

  const rows = await db
    .select({
      userId: schema.users.id,
      userName: schema.users.name,
      userEmail: schema.users.email,
      totalInputTokens: sql<number>`SUM(${schema.factUsage.totalInputTokens})`,
      totalOutputTokens: sql<number>`SUM(${schema.factUsage.totalOutputTokens})`,
      totalCost: sql<number>`SUM(${schema.factUsage.totalCost})`,
      requestCount: sql<number>`SUM(${schema.factUsage.requestCount})`,
    })
    .from(schema.factUsage)
    .innerJoin(schema.users, eq(schema.factUsage.userId, schema.users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(schema.users.id, schema.users.name, schema.users.email)
    .orderBy(desc(sql`SUM(${schema.factUsage.totalCost})`));

  return rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    totalInputTokens: Number(r.totalInputTokens),
    totalOutputTokens: Number(r.totalOutputTokens),
    totalCost: Number(r.totalCost),
    requestCount: Number(r.requestCount),
  }));
}

export async function getTimeseries(from?: string, to?: string): Promise<UsageTimeseries[]> {
  const conditions = dateFilters(from, to);

  const rows = await db
    .select({
      date: schema.factUsage.usageDate,
      totalInputTokens: sql<number>`SUM(${schema.factUsage.totalInputTokens})`,
      totalOutputTokens: sql<number>`SUM(${schema.factUsage.totalOutputTokens})`,
      totalCost: sql<number>`SUM(${schema.factUsage.totalCost})`,
      requestCount: sql<number>`SUM(${schema.factUsage.requestCount})`,
    })
    .from(schema.factUsage)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(schema.factUsage.usageDate)
    .orderBy(schema.factUsage.usageDate);

  return rows.map((r) => ({
    date: r.date,
    totalInputTokens: Number(r.totalInputTokens),
    totalOutputTokens: Number(r.totalOutputTokens),
    totalCost: Number(r.totalCost),
    requestCount: Number(r.requestCount),
  }));
}

export async function getCostSuggestions(): Promise<CostSuggestion[]> {
  // Find the cheapest model per provider capability tier
  const models = await db.query.dimModels.findMany({
    where: eq(schema.dimModels.isActive, true),
  });

  // Get recent execution patterns: which models are used in which flows
  const recentLogs = await db
    .select({
      flowId: schema.executionLogs.flowId,
      model: schema.executionLogs.model,
      stepIndex: schema.executionLogs.stepIndex,
      avgInputTokens: sql<number>`AVG(${schema.executionLogs.inputTokens})`,
      avgOutputTokens: sql<number>`AVG(${schema.executionLogs.outputTokens})`,
    })
    .from(schema.executionLogs)
    .groupBy(schema.executionLogs.flowId, schema.executionLogs.model, schema.executionLogs.stepIndex);

  const suggestions: CostSuggestion[] = [];

  for (const log of recentLogs) {
    const currentModel = models.find((m) => m.modelId === log.model || log.model.endsWith(m.modelId.split('/').pop() ?? ''));
    if (!currentModel) continue;

    const currentAvgCost = currentModel.inputCostPerM + currentModel.outputCostPerM;

    // Find cheaper alternatives (at least 50% cheaper)
    const cheaper = models
      .filter((m) => m.modelId !== currentModel.modelId)
      .filter((m) => (m.inputCostPerM + m.outputCostPerM) < currentAvgCost * 0.5)
      .sort((a, b) => (a.inputCostPerM + a.outputCostPerM) - (b.inputCostPerM + b.outputCostPerM));

    if (cheaper.length === 0) continue;

    const best = cheaper[0];
    const bestAvgCost = best.inputCostPerM + best.outputCostPerM;
    const savingsPercent = Math.round((1 - bestAvgCost / currentAvgCost) * 100);

    // Get flow name
    const flow = await db.query.flows.findFirst({
      where: eq(schema.flows.id, log.flowId),
    });

    suggestions.push({
      flowName: flow?.name ?? 'Unknown Flow',
      flowId: log.flowId,
      stepIndex: log.stepIndex,
      currentModel: currentModel.displayName,
      currentCostPerM: currentAvgCost,
      suggestedModel: best.displayName,
      suggestedCostPerM: bestAvgCost,
      savingsPercent,
    });
  }

  // Deduplicate by flow+step, keep highest savings
  const deduped = new Map<string, CostSuggestion>();
  for (const s of suggestions) {
    const key = `${s.flowId}|${s.stepIndex}`;
    const existing = deduped.get(key);
    if (!existing || s.savingsPercent > existing.savingsPercent) {
      deduped.set(key, s);
    }
  }

  return [...deduped.values()].sort((a, b) => b.savingsPercent - a.savingsPercent).slice(0, 10);
}

// --- Model pricing CRUD ---

export async function listDimModels() {
  return db.query.dimModels.findMany({
    orderBy: [schema.dimModels.provider, schema.dimModels.displayName],
  });
}

export async function updateDimModel(id: string, data: { inputCostPerM?: number; outputCostPerM?: number; displayName?: string; isActive?: boolean }) {
  const [updated] = await db.update(schema.dimModels)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.dimModels.id, id))
    .returning();

  // Invalidate pricing cache
  pricingCache = null;

  return updated;
}

// --- Model pricing cache for real-time cost lookup ---

let pricingCache: Map<string, { inputCostPerM: number; outputCostPerM: number }> | null = null;
let pricingCacheTime = 0;
const PRICING_CACHE_TTL = 300_000; // 5 minutes

export async function getModelPricing(): Promise<Map<string, { inputCostPerM: number; outputCostPerM: number }>> {
  if (pricingCache && Date.now() - pricingCacheTime < PRICING_CACHE_TTL) {
    return pricingCache;
  }

  const models = await db.query.dimModels.findMany({
    where: eq(schema.dimModels.isActive, true),
  });

  pricingCache = new Map();
  for (const m of models) {
    pricingCache.set(m.modelId, { inputCostPerM: m.inputCostPerM, outputCostPerM: m.outputCostPerM });
  }
  pricingCacheTime = Date.now();

  return pricingCache;
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  pricing: Map<string, { inputCostPerM: number; outputCostPerM: number }>,
): number | null {
  const p = pricing.get(model);
  if (!p) {
    // Try matching without provider prefix
    const short = model.split('/').pop() ?? model;
    const fallback = [...pricing.entries()].find(([k]) => k.endsWith(short));
    if (!fallback) return null;
    const [, fp] = fallback;
    return (inputTokens / 1_000_000) * fp.inputCostPerM + (outputTokens / 1_000_000) * fp.outputCostPerM;
  }
  return (inputTokens / 1_000_000) * p.inputCostPerM + (outputTokens / 1_000_000) * p.outputCostPerM;
}
