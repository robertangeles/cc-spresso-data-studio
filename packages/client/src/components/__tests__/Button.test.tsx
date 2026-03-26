import { describe, it, expect } from 'vitest';

describe('Button component', () => {
  it('exports a Button function', async () => {
    const mod = await import('../ui/Button');
    expect(mod.Button).toBeDefined();
    expect(typeof mod.Button).toBe('function');
  });
});
