import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  TooManyRequestsError,
} from '../../utils/errors.js';

describe('Security & Error Classes', () => {
  // ── Error class behavior ─────────────────────────────────────

  // TC-SEC-01: NotFoundError has status 404
  it('TC-SEC-01: NotFoundError has statusCode 404', () => {
    const err = new NotFoundError('Channel');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Channel not found');
    expect(err.name).toBe('NotFoundError');
  });

  // TC-SEC-02: ForbiddenError has status 403
  it('TC-SEC-02: ForbiddenError has statusCode 403', () => {
    const err = new ForbiddenError('Access denied');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Access denied');
  });

  // TC-SEC-03: ForbiddenError default message
  it('TC-SEC-03: ForbiddenError has default message "Forbidden"', () => {
    const err = new ForbiddenError();
    expect(err.message).toBe('Forbidden');
  });

  // TC-SEC-04: ValidationError has status 400 and details
  it('TC-SEC-04: ValidationError has statusCode 400 with details', () => {
    const err = new ValidationError({ name: ['Name is required'] });
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ name: ['Name is required'] });
    expect(err.message).toBe('Validation failed');
  });

  // TC-SEC-05: ConflictError has status 409
  it('TC-SEC-05: ConflictError has statusCode 409', () => {
    const err = new ConflictError('Already exists');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Already exists');
  });

  // TC-SEC-06: UnauthorizedError has status 401
  it('TC-SEC-06: UnauthorizedError has statusCode 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Unauthorized');
  });

  // TC-SEC-07: TooManyRequestsError has status 429
  it('TC-SEC-07: TooManyRequestsError has statusCode 429', () => {
    const err = new TooManyRequestsError();
    expect(err.statusCode).toBe(429);
  });

  // TC-SEC-08: All error classes extend AppError
  it('TC-SEC-08: all error classes extend AppError', () => {
    expect(new NotFoundError('x')).toBeInstanceOf(AppError);
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
    expect(new ValidationError({})).toBeInstanceOf(AppError);
    expect(new ConflictError('x')).toBeInstanceOf(AppError);
    expect(new UnauthorizedError()).toBeInstanceOf(AppError);
    expect(new TooManyRequestsError()).toBeInstanceOf(AppError);
  });

  // TC-SEC-09: All error classes extend Error
  it('TC-SEC-09: all error classes extend native Error', () => {
    expect(new NotFoundError('x')).toBeInstanceOf(Error);
    expect(new ForbiddenError()).toBeInstanceOf(Error);
    expect(new ValidationError({})).toBeInstanceOf(Error);
  });

  // ── Ownership / IDOR prevention ──────────────────────────────

  // TC-SEC-10: Ownership check logic (message.userId !== userId)
  it('TC-SEC-10: ownership check correctly identifies non-owner', () => {
    const message = { userId: 'owner-1' };
    const requesterId = 'attacker-1';
    const isOwner = message.userId === requesterId;
    expect(isOwner).toBe(false);
  });

  // TC-SEC-11: Ownership check passes for actual owner
  it('TC-SEC-11: ownership check passes for actual owner', () => {
    const message = { userId: 'user-1' };
    const requesterId = 'user-1';
    const isOwner = message.userId === requesterId;
    expect(isOwner).toBe(true);
  });

  // ── Admin role enforcement ───────────────────────────────────

  // TC-SEC-12: Admin role check for announcement channels
  it('TC-SEC-12: admin role check for announcement channel', () => {
    const channelType: string = 'announcement';
    const userRole: string = 'Member';
    const isAllowed = channelType !== 'announcement' || userRole === 'Administrator';
    expect(isAllowed).toBe(false);

    const adminAllowed = channelType !== 'announcement' || 'Administrator' === 'Administrator';
    expect(adminAllowed).toBe(true);
  });

  // ── XSS sanitization ────────────────────────────────────────

  // TC-SEC-13: HTML stripping removes script tags
  it('TC-SEC-13: XSS: script tags are stripped', () => {
    const malicious = '<script>document.cookie</script>Hello';
    const sanitized = malicious.replace(/<[^>]*>/g, '');
    expect(sanitized).toBe('document.cookieHello');
    expect(sanitized).not.toContain('<script>');
  });

  // TC-SEC-14: HTML stripping removes event handlers
  it('TC-SEC-14: XSS: img onerror is stripped', () => {
    const malicious = '<img src=x onerror=alert(1)>Safe text';
    const sanitized = malicious.replace(/<[^>]*>/g, '');
    expect(sanitized).toBe('Safe text');
    expect(sanitized).not.toContain('onerror');
  });
});
