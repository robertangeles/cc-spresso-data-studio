import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

// Generate a valid test key (32 bytes = 64 hex chars)
const TEST_KEY = randomBytes(32).toString('hex');

describe('crypto utility', () => {
  let encryptToken: (token: string) => string;
  let decryptToken: (encrypted: string) => string;
  let isEncryptionEnabled: () => boolean;
  let generateEncryptionKey: () => string;

  beforeEach(async () => {
    // Reset module cache so env var changes take effect
    vi.resetModules();
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    const mod = await import('../crypto.js');
    encryptToken = mod.encryptToken;
    decryptToken = mod.decryptToken;
    isEncryptionEnabled = mod.isEncryptionEnabled;
    generateEncryptionKey = mod.generateEncryptionKey;
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  // T15: encrypt → decrypt roundtrip
  it('should encrypt and decrypt a token successfully (roundtrip)', () => {
    const original = 'ya29.a0AfH6SMBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const encrypted = encryptToken(original);

    expect(encrypted).not.toBe(original);
    expect(encrypted.startsWith('enc:')).toBe(true);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertexts for the same plaintext (random IV)', () => {
    const token = 'my-secret-token';
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);

    expect(enc1).not.toBe(enc2); // Different IVs
    expect(decryptToken(enc1)).toBe(token);
    expect(decryptToken(enc2)).toBe(token);
  });

  it('should handle empty and null-ish values gracefully', () => {
    expect(encryptToken('')).toBe('');
    expect(decryptToken('')).toBe('');
  });

  it('should handle unicode tokens', () => {
    const token = 'token-with-émojis-🔑-and-日本語';
    const encrypted = encryptToken(token);
    expect(decryptToken(encrypted)).toBe(token);
  });

  it('should handle very long tokens', () => {
    const token = 'x'.repeat(10_000);
    const encrypted = encryptToken(token);
    expect(decryptToken(encrypted)).toBe(token);
  });

  // T16: decrypt plaintext (backward compat)
  it('should return plaintext as-is if not encrypted (backward compat)', () => {
    const plaintext = 'ya29.a0AfH6SMBxxxxxx';
    expect(decryptToken(plaintext)).toBe(plaintext);
  });

  // T17: missing encryption key → graceful degradation
  describe('when TOKEN_ENCRYPTION_KEY is not set', () => {
    beforeEach(async () => {
      vi.resetModules();
      delete process.env.TOKEN_ENCRYPTION_KEY;
      const mod = await import('../crypto.js');
      encryptToken = mod.encryptToken;
      decryptToken = mod.decryptToken;
      isEncryptionEnabled = mod.isEncryptionEnabled;
    });

    it('encryptToken returns plaintext unchanged', () => {
      const token = 'my-access-token';
      expect(encryptToken(token)).toBe(token);
    });

    it('decryptToken returns value as-is even if prefixed', () => {
      const encrypted = 'enc:abc:def:ghi';
      // Without a key, it should return as-is with a warning
      expect(decryptToken(encrypted)).toBe(encrypted);
    });

    it('isEncryptionEnabled returns false', () => {
      expect(isEncryptionEnabled()).toBe(false);
    });
  });

  describe('when TOKEN_ENCRYPTION_KEY is invalid length', () => {
    it('encryptToken throws for invalid key length', async () => {
      vi.resetModules();
      process.env.TOKEN_ENCRYPTION_KEY = 'tooshort';
      const mod = await import('../crypto.js');
      expect(() => mod.encryptToken('test')).toThrow(
        'TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters',
      );
    });
  });

  it('should detect corrupted ciphertext gracefully (backward compat)', () => {
    const corrupted = 'enc:invalid:data:here';
    // Should not throw — returns as-is for backward compat
    const result = decryptToken(corrupted);
    expect(result).toBe(corrupted);
  });

  it('should detect wrong key gracefully', async () => {
    const token = 'my-secret';
    const encrypted = encryptToken(token);

    // Switch to a different key
    vi.resetModules();
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    const mod2 = await import('../crypto.js');

    // Should not throw — returns encrypted value as-is (backward compat)
    const result = mod2.decryptToken(encrypted);
    expect(result).toBe(encrypted);
  });

  it('generateEncryptionKey returns a 64-char hex string', () => {
    const key = generateEncryptionKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('isEncryptionEnabled', () => {
    it('returns true when valid key is set', () => {
      expect(isEncryptionEnabled()).toBe(true);
    });
  });
});
