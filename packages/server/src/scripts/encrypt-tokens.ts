/**
 * Token Encryption Migration Script
 *
 * Encrypts all existing plaintext access_token and refresh_token values
 * in the social_accounts table using AES-256-GCM.
 *
 * Idempotent: skips tokens that are already encrypted (prefixed with "enc:").
 *
 * Usage:
 *   TOKEN_ENCRYPTION_KEY=<64-hex-chars> npx tsx src/scripts/encrypt-tokens.ts
 *
 * Prerequisites:
 *   - DATABASE_URL must be set
 *   - TOKEN_ENCRYPTION_KEY must be set (64 hex chars = 32 bytes)
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { encryptToken, isEncryptionEnabled } from '../utils/crypto.js';

const ENCRYPTED_PREFIX = 'enc:';

async function migrateTokens() {
  console.log('=== Token Encryption Migration ===\n');

  if (!isEncryptionEnabled()) {
    console.error('ERROR: TOKEN_ENCRYPTION_KEY is not set or invalid.');
    console.error(
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
    process.exit(1);
  }

  const accounts = await db.query.socialAccounts.findMany();
  console.log(`Found ${accounts.length} social accounts.\n`);

  let encrypted = 0;
  let skipped = 0;
  let empty = 0;

  for (const account of accounts) {
    const updates: Record<string, string> = {};

    // Process accessToken
    if (account.accessToken) {
      if (account.accessToken.startsWith(ENCRYPTED_PREFIX)) {
        skipped++;
      } else {
        updates.accessToken = encryptToken(account.accessToken);
      }
    } else {
      empty++;
    }

    // Process refreshToken
    if (account.refreshToken) {
      if (account.refreshToken.startsWith(ENCRYPTED_PREFIX)) {
        // Already encrypted — no action
      } else {
        updates.refreshToken = encryptToken(account.refreshToken);
      }
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.socialAccounts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.socialAccounts.id, account.id));

      encrypted++;
      console.log(
        `  Encrypted: ${account.platform} — ${account.accountName ?? account.accountId ?? account.id}`,
      );
    }
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`  Encrypted: ${encrypted}`);
  console.log(`  Skipped (already encrypted): ${skipped}`);
  console.log(`  Empty (no token): ${empty}`);
  console.log(`  Total accounts: ${accounts.length}`);
}

migrateTokens()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
