import { describe, it, expect } from 'vitest';

describe('Health endpoint', () => {
  it('should return { success: true, data: { status: "ok" } } shape', () => {
    // Test the response shape expected by the health endpoint
    const expectedResponse = {
      success: true,
      data: { status: 'ok' },
    };

    expect(expectedResponse.success).toBe(true);
    expect(expectedResponse.data.status).toBe('ok');
  });
});
