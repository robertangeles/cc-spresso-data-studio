import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString: config.database.url,
  ssl: config.database.url.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 10,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

pool.on('connect', () => {
  logger.info('Database pool connected');
});

// Verify DB connectivity on startup with retry
export async function verifyConnection(retries = 3, delay = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      logger.info('Database connection verified');
      return;
    } catch (err) {
      logger.warn({ err, attempt, retries }, 'Database connection attempt failed');
      if (attempt === retries) {
        throw new Error(`Database connection failed after ${retries} attempts`);
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export const db = drizzle(pool, { schema, logger: config.isDev });
export { pool, schema };
