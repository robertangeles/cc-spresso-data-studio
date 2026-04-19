export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(details: Record<string, string[]>) {
    super(400, 'Validation failed', details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class CaptchaError extends AppError {
  constructor(message = 'CAPTCHA verification failed. Please try again.') {
    super(400, message);
    this.name = 'CaptchaError';
  }
}

export class TokenExpiredError extends AppError {
  constructor(message = 'This link has expired. Please request a new one.') {
    super(400, message);
    this.name = 'TokenExpiredError';
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message = 'Too many requests. Please try again later.',
    public retryAfter?: number,
  ) {
    super(429, message);
    this.name = 'TooManyRequestsError';
  }
}

export class EmailConfigError extends AppError {
  constructor(message = 'Email service is not configured. Contact your administrator.') {
    super(503, message);
    this.name = 'EmailConfigError';
  }
}

export class SessionQuotaExceededError extends AppError {
  constructor(
    message = 'Free session limit reached. Upgrade your plan to continue using AI features.',
    public remaining: number = 0,
    public limit: number = 0,
  ) {
    super(402, message);
    this.name = 'SessionQuotaExceededError';
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(
    public required: number,
    public available: number,
    public actionType: string,
    message = 'Insufficient credits for this action.',
  ) {
    super(402, message);
    this.name = 'InsufficientCreditsError';
  }
}

export class StripeConfigError extends AppError {
  constructor(message = 'Stripe is not configured. Go to Settings > Integrations > Stripe.') {
    super(503, message);
    this.name = 'StripeConfigError';
  }
}

// ============================================================
// Model Studio — AI provider, network, and structured-response errors.
// Introduced for Model Studio; reusable across the rest of the app.
// ============================================================

function makeSupportCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export class ProviderTimeoutError extends AppError {
  constructor(
    public providerName: string,
    message = 'The AI provider did not respond in time. Try again in a moment.',
  ) {
    super(504, message);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(
    public providerName: string,
    message = 'The AI provider is temporarily unavailable.',
  ) {
    super(503, message);
    this.name = 'ProviderUnavailableError';
  }
}

export class NetworkError extends AppError {
  constructor(message = 'A network error prevented completing this request.') {
    super(502, message);
    this.name = 'NetworkError';
  }
}

export class ProviderResponseError extends AppError {
  constructor(
    public providerName: string,
    public rawExcerpt: string,
    message = 'The AI provider returned an unexpected response.',
  ) {
    super(502, message);
    this.name = 'ProviderResponseError';
  }
}

export class AIRefusalError extends AppError {
  constructor(
    public refusalReason: string,
    message = 'The AI declined to respond to that request.',
  ) {
    // Not an HTTP error — assistant message is still rendered. Services may
    // handle this specifically to attach the refusal to the chat transcript.
    super(200, message);
    this.name = 'AIRefusalError';
  }
}

export class InvalidAIResponseError extends AppError {
  constructor(
    public rawExcerpt: string,
    message = 'Could not parse the AI response. Try rephrasing your request.',
  ) {
    super(502, message);
    this.name = 'InvalidAIResponseError';
  }
}

export class ContextTooLargeError extends AppError {
  constructor(
    public tokenCount: number,
    public tokenLimit: number,
    message = 'Your model is too large to fit in one AI request. Using compact context.',
  ) {
    super(413, message);
    this.name = 'ContextTooLargeError';
  }
}

export class DBError extends AppError {
  public supportCode: string;
  constructor(
    public operation: string,
    message = 'A database error occurred. Please retry.',
  ) {
    super(500, message);
    this.supportCode = makeSupportCode();
    this.name = 'DBError';
  }
}

export class InternalError extends AppError {
  public supportCode: string;
  constructor(message = 'An unexpected error occurred.') {
    super(500, message);
    this.supportCode = makeSupportCode();
    this.name = 'InternalError';
  }
}
