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
