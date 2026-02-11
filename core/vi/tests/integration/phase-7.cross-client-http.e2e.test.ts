/**
 * Phase 7: Cross-Client Adapter Standardization (HTTP path)
 *
 * Purpose: Verify the live /v1/chat endpoint resolves and persists
 * provider identities from client headers, and keeps continuity per
 * provider_user_id without cross-linking providers.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { loadConfig } from '../../src/config/config.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';
import { createPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrations.js';
import { createServer } from '../../src/runtime/server.js';
import { ConversationRepository } from '../../src/db/repositories/conversationRepository.js';
import { MessageRepository } from '../../src/db/repositories/messageRepository.js';
import { UserRepository } from '../../src/db/repositories/UserRepository.js';
import { SessionRepository } from '../../src/db/repositories/SessionRepository.js';
import type { FastifyInstance } from 'fastify';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Phase 7: Cross-Client Identity via HTTP', () => {
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.VI_TELEMETRY_ENABLED = 'false';
    process.env.VI_AUTH_ENABLED = 'false';
    process.env.VI_TOOLS_RATE_LIMIT_DEFAULT = '1000';
    process.env.VI_TEST_MODE = 'true';

    const config = loadConfig();
    initializeLogger('error');
    initializeTelemetry('./test-telemetry', false);

    pool = createPool(config);
    await runMigrations(pool);

    // Keep tables lean for deterministic assertions
    await pool.query('TRUNCATE TABLE user_identity_map, identity_audit_log, users RESTART IDENTITY CASCADE');

    const conversationRepo = new ConversationRepository(pool);
    const messageRepo = new MessageRepository(pool);
    const userRepo = new UserRepository(pool);
    const sessionRepo = new SessionRepository(pool);

    app = await createServer({
      config,
      pool,
      conversationRepo,
      messageRepo,
      userRepo,
      sessionRepo,
    });
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  it('persists provider identity from Sovereign headers and reuses vi_user_id', async () => {
    const provider = 'sovereign';
    const providerUserId = 'sov-http-identity-1';

    const first = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      headers: {
        'x-provider': provider,
        'x-provider-user-id': providerUserId,
        'x-client-id': 'sovereign',
      },
      payload: {
        message: 'Hello Vi from Sovereign',
      },
    });

    expect(first.statusCode).toBe(200);

    const row1 = await pool.query(
      `SELECT vi_user_id FROM user_identity_map WHERE provider = $1 AND provider_user_id = $2`,
      [provider, providerUserId]
    );

    expect(row1.rows).toHaveLength(1);
    const viUserId = row1.rows[0].vi_user_id as string;
    expect(viUserId).toMatch(/^[0-9a-f\-]{36}$/);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      headers: {
        'x-provider': provider,
        'x-provider-user-id': providerUserId,
        'x-client-id': 'sovereign',
      },
      payload: {
        message: 'Second ping should reuse identity',
      },
    });

    expect(second.statusCode).toBe(200);

    const row2 = await pool.query(
      `SELECT vi_user_id FROM user_identity_map WHERE provider = $1 AND provider_user_id = $2`,
      [provider, providerUserId]
    );

    expect(row2.rows).toHaveLength(1);
    expect(row2.rows[0].vi_user_id).toBe(viUserId);

    // Ensure user record exists for the resolved identity
    const userRow = await pool.query('SELECT id FROM users WHERE id = $1', [viUserId]);
    expect(userRow.rows).toHaveLength(1);
  });

  it('keeps provider scopes separate (no implicit cross-link between Sovereign and Astralis)', async () => {
    const sharedId = 'shared-cross-provider-user';

    const sovereign = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      headers: {
        'x-provider': 'sovereign',
        'x-provider-user-id': sharedId,
        'x-client-id': 'sovereign',
      },
      payload: { message: 'Sovereign hello' },
    });
    expect(sovereign.statusCode).toBe(200);

    const astralis = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      headers: {
        'x-provider': 'astralis',
        'x-provider-user-id': sharedId,
        'x-client-id': 'astralis',
      },
      payload: { message: 'Astralis hello' },
    });
    expect(astralis.statusCode).toBe(200);

    const sovRow = await pool.query(
      `SELECT vi_user_id FROM user_identity_map WHERE provider = 'sovereign' AND provider_user_id = $1`,
      [sharedId]
    );
    const astRow = await pool.query(
      `SELECT vi_user_id FROM user_identity_map WHERE provider = 'astralis' AND provider_user_id = $1`,
      [sharedId]
    );

    expect(sovRow.rows).toHaveLength(1);
    expect(astRow.rows).toHaveLength(1);
    expect(sovRow.rows[0].vi_user_id).not.toBe(astRow.rows[0].vi_user_id);
  });

  it('does not record identity audit trail for repeated resolution without state change', async () => {
    const providerUserId = 'audit-check-user';

    // Resolve twice to generate consistent identity
    await app.inject({
      method: 'POST',
      url: '/v1/chat',
      headers: {
        'x-provider': 'sovereign',
        'x-provider-user-id': providerUserId,
        'x-client-id': 'sovereign',
      },
      payload: { message: 'First audit call' },
    });

    await app.inject({
      method: 'POST',
      url: '/v1/chat',
      headers: {
        'x-provider': 'sovereign',
        'x-provider-user-id': providerUserId,
        'x-client-id': 'sovereign',
      },
      payload: { message: 'Second audit call' },
    });

    const auditRows = await pool.query(
      `SELECT provider, provider_user_id FROM identity_audit_log WHERE provider = 'sovereign' AND provider_user_id = $1`,
      [providerUserId]
    );

    expect(auditRows.rows.length).toBe(0);
  });
});