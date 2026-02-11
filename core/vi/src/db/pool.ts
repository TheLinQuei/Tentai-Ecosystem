import { Pool } from 'pg';
import { Config } from '../config/config.js';
import { getLogger } from '../telemetry/logger.js';

let pool: Pool | null = null;

export function createPool(config: Config): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: config.database.url,
    max: config.database.poolSize,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    idleTimeoutMillis: config.database.idleTimeoutMs,
    ssl: config.database.ssl,
  });

  pool.on('error', (error: unknown) => {
    getLogger().error({ error }, 'Unexpected database error');
  });

  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call createPool first.');
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
