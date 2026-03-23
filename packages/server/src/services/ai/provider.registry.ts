import { ProviderType } from '@cc/shared';
import type { AIModelConfig, AICompletionRequest, AICompletionResponse } from '@cc/shared';
import type { IAIProvider } from './provider.interface.js';
import { AppError } from '../../utils/errors.js';
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { OpenRouterProvider } from './providers/openrouter.provider.js';
import { logger } from '../../config/logger.js';

export class ProviderRegistry {
  private providers = new Map<ProviderType, IAIProvider>();

  register(provider: IAIProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: ProviderType): IAIProvider | undefined {
    return this.providers.get(type);
  }

  listProviders(): IAIProvider[] {
    return Array.from(this.providers.values());
  }

  listAllModels(): Array<AIModelConfig & { provider: ProviderType }> {
    const models: Array<AIModelConfig & { provider: ProviderType }> = [];
    for (const provider of this.providers.values()) {
      for (const model of provider.listModels()) {
        models.push({ ...model, provider: provider.type });
      }
    }
    return models;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    // Find the provider that owns the requested model
    for (const provider of this.providers.values()) {
      const models = provider.listModels();
      if (models.some((m) => m.modelId === request.model)) {
        return provider.complete(request);
      }
    }

    // Fall back to OpenRouter — it can route any model
    const openRouter = this.providers.get(ProviderType.OPENROUTER);
    if (openRouter) {
      return openRouter.complete(request);
    }

    throw new AppError(400, `No provider found for model: ${request.model}`);
  }

  async loadFromDatabase(): Promise<void> {
    const providers = await db.query.aiProviders.findMany({
      where: eq(schema.aiProviders.isEnabled, true),
    });

    for (const p of providers) {
      const cfg = p.config as { apiKey?: string; models?: string[] };
      if (!cfg.apiKey) continue;

      try {
        switch (p.providerType) {
          case 'anthropic': {
            this.register(new AnthropicProvider(cfg.apiKey));
            logger.info({ provider: p.name }, 'Registered AI provider');
            break;
          }
          case 'openrouter': {
            this.register(new OpenRouterProvider(cfg.apiKey, cfg.models ?? []));
            logger.info({ provider: p.name }, 'Registered AI provider');
            break;
          }
          default:
            logger.warn({ provider: p.name, type: p.providerType }, 'Unknown provider type, skipping');
        }
      } catch (err) {
        logger.error({ err, provider: p.name }, 'Failed to register AI provider');
      }
    }

    logger.info({ count: this.providers.size }, 'AI providers loaded');
  }
}

// Singleton registry
export const providerRegistry = new ProviderRegistry();
