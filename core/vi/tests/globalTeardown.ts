import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';

// Instances shared via globalThis from globalSetup
const anyGlobal = globalThis as any;

export default async function globalTeardown() {
  const app: FastifyInstance | undefined = anyGlobal.__vi_app;
  const pool: Pool | undefined = anyGlobal.__vi_pool;

  try {
    if (app) {
      await app.close();
    }
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}
