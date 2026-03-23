import { ProviderType } from '@cc/shared';
import type { AIModelConfig, AICompletionRequest, AICompletionResponse } from '@cc/shared';
import type { IAIProvider } from '../provider.interface.js';
import { logger } from '../../../config/logger.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements IAIProvider {
  readonly type = ProviderType.OPENROUTER;
  readonly name = 'OpenRouter';
  private apiKey: string;
  private models: AIModelConfig[];

  constructor(apiKey: string, models: (string | { id: string; name: string; description?: string })[]) {
    this.apiKey = apiKey;
    this.models = models.map((m) => {
      const modelId = typeof m === 'string' ? m : m.id;
      const displayName = typeof m === 'string' ? m.split('/').pop() ?? m : m.name;
      return {
        modelId,
        displayName,
        maxTokens: 4096,
        supportsStreaming: true,
        supportsVision: false,
      };
    });
  }

  listModels(): AIModelConfig[] {
    return this.models;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    logger.info({ model: request.model, messageCount: request.messages.length }, 'OpenRouter API call');

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://contentpilot.app',
        'X-Title': 'Content Pilot',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, 'OpenRouter API error');
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      id: string;
      model: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];

    return {
      id: data.id,
      content: choice?.message?.content ?? '',
      model: data.model,
      provider: ProviderType.OPENROUTER,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      finishReason: choice?.finish_reason === 'stop' ? 'stop' : 'length',
    };
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/auth/key`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
