import { ProviderType } from '@cc/shared';
import type { AIModelConfig, AICompletionRequest, AICompletionResponse } from '@cc/shared';
import type { IAIProvider } from '../provider.interface.js';
import { logger } from '../../../config/logger.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider implements IAIProvider {
  readonly type = ProviderType.OPENROUTER;
  readonly name = 'OpenRouter';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  listModels(): AIModelConfig[] {
    // Models are now managed by the catalog service, not the provider
    return [];
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    // Log multimodal message structure (without base64 data)
    const hasMultimodal = request.messages.some((m) => Array.isArray(m.content));
    logger.info(
      {
        model: request.model,
        messageCount: request.messages.length,
        hasMultimodal,
        ...(hasMultimodal && {
          multimodalStructure: request.messages
            .filter((m) => Array.isArray(m.content))
            .map((m) => ({
              role: m.role,
              parts: (m.content as Array<{ type: string }>).map((p) => p.type),
            })),
        }),
      },
      'OpenRouter API call',
    );

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://spresso.xyz',
        'X-Title': 'Spresso',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.error(
        { status: response.status, body: errorBody, model: request.model },
        'OpenRouter API error',
      );

      // Specific, actionable error messages by status code
      switch (response.status) {
        case 401:
          throw new Error(
            'OpenRouter API key is invalid — check Settings > Integrations > AI Models.',
          );
        case 402:
          throw new Error(
            'OpenRouter credits exhausted — top up your OpenRouter account at openrouter.ai.',
          );
        case 404:
          throw new Error(
            `Model "${request.model}" is not available on OpenRouter — it may have been removed.`,
          );
        case 429: {
          // Retry once after a short delay
          logger.warn({ model: request.model }, 'OpenRouter rate limited, retrying in 2s');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const retryResponse = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
              'HTTP-Referer': 'https://spresso.xyz',
              'X-Title': 'Spresso',
            },
            body: JSON.stringify({
              model: request.model,
              messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
              max_tokens: request.maxTokens ?? 4096,
              temperature: request.temperature,
            }),
          });
          if (!retryResponse.ok) {
            throw new Error('Rate limited by OpenRouter — try again in a moment.');
          }
          return this.parseResponse(retryResponse, request.model);
        }
        default:
          throw new Error(`OpenRouter API error ${response.status}: ${errorBody.slice(0, 200)}`);
      }
    }

    return this.parseResponse(response, request.model);
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

  // ------------------------------------------------------------------
  // Response parsing — handles text, images, and multimodal outputs
  // ------------------------------------------------------------------

  private async parseResponse(
    response: Response,
    requestModel: string,
  ): Promise<AICompletionResponse> {
    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch {
      throw new Error(
        'OpenRouter returned malformed JSON — the service may be experiencing issues.',
      );
    }

    // Log raw response for image models to debug format
    const isImageModel = requestModel.includes('image');
    if (isImageModel) {
      logger.info(
        { model: requestModel, rawResponse: JSON.stringify(rawJson).slice(0, 2000) },
        'Image model raw response',
      );
    }

    const data = rawJson as {
      id: string;
      model: string;
      choices: Array<{
        message: {
          content:
            | string
            | null
            | Array<{
                type: string;
                text?: string;
                image_url?: { url: string };
                inline_data?: { mime_type: string; data: string };
              }>;
          images?: Array<{ type: string; image_url?: { url: string } }>;
        };
        finish_reason: string;
      }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices?.[0];
    if (!choice) {
      logger.error(
        { rawResponse: JSON.stringify(rawJson).slice(0, 2000) },
        'OpenRouter empty response — no choices',
      );
      throw new Error('OpenRouter returned an empty response — no choices in the completion.');
    }

    const rawContent = choice.message?.content;
    const rawImages = choice.message?.images;

    // Handle multimodal responses
    let content = '';
    let contentType: 'text' | 'image_url' | 'image_base64' | undefined;
    let imageUrl: string | undefined;

    // Check message.images field first (Gemini image models use this)
    if (rawImages && rawImages.length > 0) {
      const img = rawImages[0];
      if (img.image_url?.url) {
        imageUrl = img.image_url.url;
        contentType = imageUrl.startsWith('data:') ? 'image_base64' : 'image_url';
        content = imageUrl;
        logger.info(
          { model: requestModel, imageUrlLength: imageUrl.length },
          'Image extracted from message.images field',
        );
      }
    } else if (Array.isArray(rawContent)) {
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
      finishReason: choice.finish_reason === 'stop' ? 'stop' : 'length',
    };
  }
}
