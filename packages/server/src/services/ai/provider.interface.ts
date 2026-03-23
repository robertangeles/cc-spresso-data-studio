import type { ProviderType, AIModelConfig, AICompletionRequest, AICompletionResponse } from '@cc/shared';

export interface IAIProvider {
  readonly type: ProviderType;
  readonly name: string;

  /** List available models for this provider */
  listModels(): AIModelConfig[];

  /** Send a completion request */
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;

  /** Validate that the provider's API key is configured and working */
  validateConnection(): Promise<boolean>;
}
