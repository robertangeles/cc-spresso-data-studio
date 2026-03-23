import Anthropic from '@anthropic-ai/sdk';
import { ProviderType } from '@cc/shared';
import type { AIModelConfig, AICompletionRequest, AICompletionResponse } from '@cc/shared';
import type { IAIProvider } from '../provider.interface.js';
import { logger } from '../../../config/logger.js';

const ANTHROPIC_MODELS: AIModelConfig[] = [
  { modelId: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6', maxTokens: 8192, supportsStreaming: true, supportsVision: true },
  { modelId: 'claude-opus-4-6', displayName: 'Opus 4.6', maxTokens: 8192, supportsStreaming: true, supportsVision: true },
  { modelId: 'claude-haiku-4-5', displayName: 'Haiku 4.5', maxTokens: 8192, supportsStreaming: true, supportsVision: true },
  { modelId: 'claude-opus-4-5', displayName: 'Opus 4.5', maxTokens: 8192, supportsStreaming: true, supportsVision: true },
  { modelId: 'claude-sonnet-4-5', displayName: 'Sonnet 4.5', maxTokens: 8192, supportsStreaming: true, supportsVision: true },
];

export class AnthropicProvider implements IAIProvider {
  readonly type = ProviderType.ANTHROPIC;
  readonly name = 'Anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  listModels(): AIModelConfig[] {
    return ANTHROPIC_MODELS;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const userMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    logger.info({ model: request.model, messageCount: userMessages.length }, 'Anthropic API call');

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature,
      system: systemMessage?.content,
      messages: userMessages,
    });

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return {
      id: response.id,
      content: textContent,
      model: response.model,
      provider: ProviderType.ANTHROPIC,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      finishReason: response.stop_reason === 'end_turn' ? 'stop' : 'stop',
    };
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
