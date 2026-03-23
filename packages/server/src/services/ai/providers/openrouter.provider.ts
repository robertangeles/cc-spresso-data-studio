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

    const rawJson = await response.json();

    // Log raw response for image models to debug format
    const isImageModel = request.model.includes('image');
    if (isImageModel) {
      logger.info({ model: request.model, rawResponse: JSON.stringify(rawJson).slice(0, 2000) }, 'Image model raw response');
    }

    const data = rawJson as {
      id: string;
      model: string;
      choices: Array<{
        message: {
          content: string | null | Array<{
            type: string;
            text?: string;
            image_url?: { url: string };
            inline_data?: { mime_type: string; data: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const rawContent = choice?.message?.content;

    // Handle multimodal responses (image models return array of content parts)
    let content = '';
    let contentType: 'text' | 'image_url' | 'image_base64' | undefined;
    let imageUrl: string | undefined;

    if (Array.isArray(rawContent)) {
      // Multimodal response — extract text and images
      const textParts: string[] = [];
      for (const part of rawContent) {
        if (part.type === 'text' && part.text) {
          textParts.push(part.text);
        } else if (part.type === 'image_url' && part.image_url?.url) {
          imageUrl = part.image_url.url;
          contentType = part.image_url.url.startsWith('data:') ? 'image_base64' : 'image_url';
        } else if (part.inline_data?.data) {
          // Gemini-style inline base64 image
          const mime = part.inline_data.mime_type || 'image/png';
          imageUrl = `data:${mime};base64,${part.inline_data.data}`;
          contentType = 'image_base64';
        }
      }
      content = textParts.join('\n') || (imageUrl ? `![Generated Image](${imageUrl})` : '');
    } else if (rawContent === null || rawContent === undefined) {
      // Some image models return null content — check for other response fields
      content = '';
    } else {
      content = rawContent;
      // Check if text response contains a base64 image or image URL
      if (content.startsWith('data:image/')) {
        contentType = 'image_base64';
        imageUrl = content;
      } else if (content.match(/^https?:\/\/.*\.(png|jpg|jpeg|webp|gif)/i)) {
        contentType = 'image_url';
        imageUrl = content;
      }
    }

    return {
      id: data.id,
      content,
      contentType,
      imageUrl,
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
