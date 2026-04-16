export enum ProviderType {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  OPENROUTER = 'openrouter',
  XAI = 'xai',
  GEMINI = 'gemini',
  MISTRAL = 'mistral',
}

export interface AIModelConfig {
  modelId: string;
  displayName: string;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  costPer1kInput?: number;
  costPer1kOutput?: number;
}

export type AIMessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: AIMessageContent;
}

export interface AICompletionRequest {
  model: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AICompletionResponse {
  id: string;
  content: string;
  contentType?: 'text' | 'image_url' | 'image_base64';
  imageUrl?: string;
  model: string;
  provider: ProviderType;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: 'stop' | 'length' | 'error';
}

export interface OpenRouterCatalogModel {
  id: string;
  modelId: string;
  displayName: string;
  description: string | null;
  contextLength: number;
  maxOutputTokens: number | null;
  inputCostPerM: number;
  outputCostPerM: number;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsImageGen: boolean;
  providerSlug: string;
  isEnabled: boolean;
  lastSyncedAt: string | null;
}
