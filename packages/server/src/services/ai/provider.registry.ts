import { ProviderType } from '@cc/shared';
import type { AIModelConfig, AICompletionRequest, AICompletionResponse } from '@cc/shared';
import type { IAIProvider } from './provider.interface.js';
import { AppError } from '../../utils/errors.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { OpenRouterProvider } from './providers/openrouter.provider.js';
import { logger } from '../../config/logger.js';
import { getEnabledModels } from './openrouter-catalog.service.js';

export class ProviderRegistry {
  private provider: OpenRouterProvider | null = null;

  /** Register the OpenRouter provider instance */
  register(p: IAIProvider): void {
    if (p.type === ProviderType.OPENROUTER) {
      this.provider = p as OpenRouterProvider;
    }
  }

  get(type: ProviderType): IAIProvider | undefined {
    if (type === ProviderType.OPENROUTER && this.provider) return this.provider;
    return undefined;
  }

  listProviders(): IAIProvider[] {
    return this.provider ? [this.provider] : [];
  }

  async listAllModels(): Promise<Array<AIModelConfig & { provider: ProviderType }>> {
    const catalogModels = await getEnabledModels();
    return catalogModels.map((m) => ({
      modelId: m.modelId,
      displayName: m.displayName,
      maxTokens: m.maxOutputTokens ?? 4096,
      supportsStreaming: m.supportsStreaming,
      supportsVision: m.supportsVision,
      provider: ProviderType.OPENROUTER,
    }));
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.provider) {
      throw new AppError(
        503,
        'No AI provider configured. Add an OpenRouter API key in Settings > Integrations.',
      );
    }

    return this.provider.complete(request);
  }

  async loadFromDatabase(): Promise<void> {
    const orProvider = await db.query.aiProviders.findFirst({
      where: eq(schema.aiProviders.providerType, 'openrouter'),
    });

    if (orProvider) {
      const cfg = orProvider.config as { apiKey?: string };
      if (cfg.apiKey) {
        this.provider = new OpenRouterProvider(cfg.apiKey);
        logger.info('OpenRouter AI provider registered');
      } else {
        logger.warn('OpenRouter provider exists but has no API key');
      }
    } else {
      logger.warn('No OpenRouter provider found in database');
    }

    logger.info({ hasProvider: !!this.provider }, 'AI provider load complete');
  }
}

// Singleton registry
export const providerRegistry = new ProviderRegistry();
