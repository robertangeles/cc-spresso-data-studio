import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { logger } from '../config/logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCODING = 'base64' as const;

// Prefix to identify encrypted values vs plaintext (backward compat)
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Get the encryption key from environment.
 * Returns null if not configured (encryption disabled — plaintext passthrough).
 */
function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) return null;

  const keyBuffer = Buffer.from(keyHex, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${keyHex.length} hex chars.`,
    );
  }
  return keyBuffer;
}

/**
 * Encrypt a token string using AES-256-GCM.
 * Returns prefixed base64 string: "enc:<iv>:<authTag>:<ciphertext>"
 *
 * If TOKEN_ENCRYPTION_KEY is not set, returns the plaintext unchanged
 * (graceful degradation for dev environments).
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext;

  const key = getEncryptionKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${encrypted.toString(ENCODING)}`;
}

/**
 * Decrypt a token string encrypted with encryptToken().
 *
 * Backward-compatible:
 * - If the value doesn't start with "enc:", treats it as plaintext and returns as-is.
 * - If TOKEN_ENCRYPTION_KEY is not set, returns the value as-is.
 * - If decryption fails (wrong key, corrupted data), logs a warning and returns as-is
 *   to avoid breaking existing connections during key rotation.
 */
export function decryptToken(value: string): string {
  if (!value) return value;

  // Not encrypted — return plaintext as-is (backward compat)
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;

  const key = getEncryptionKey();
  if (!key) {
    logger.warn('Encrypted token found but TOKEN_ENCRYPTION_KEY is not set — returning as-is');
    return value;
  }

  try {
    const payload = value.slice(ENCRYPTED_PREFIX.length);
    const [ivB64, tagB64, ciphertextB64] = payload.split(':');

    if (!ivB64 || !tagB64 || !ciphertextB64) {
      throw new Error('Malformed encrypted token — expected enc:<iv>:<tag>:<data>');
    }

    const iv = Buffer.from(ivB64, ENCODING);
    const authTag = Buffer.from(tagB64, ENCODING);
    const ciphertext = Buffer.from(ciphertextB64, ENCODING);

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    logger.error({ err }, 'Token decryption failed — returning value as-is for backward compat');
    return value;
  }
}

/**
 * Check whether encryption is enabled (TOKEN_ENCRYPTION_KEY is set and valid).
 */
export function isEncryptionEnabled(): boolean {
  try {
    return getEncryptionKey() !== null;
  } catch {
    return false;
  }
}

/**
 * Generate a random 32-byte hex key suitable for TOKEN_ENCRYPTION_KEY.
 * Usage: npx tsx -e "import { generateEncryptionKey } from './src/utils/crypto.js'; console.log(generateEncryptionKey())"
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}
