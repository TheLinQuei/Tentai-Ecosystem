import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { loadConfig } from '../../src/config/config.js';
import { initializeLogger } from '../../src/telemetry/logger.js';
import { initializeTelemetry } from '../../src/telemetry/telemetry.js';
import { createPool, closePool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrations.js';
import { CodexService } from '../../src/codex/CodexService.js';
import { CodexEntityRepository } from '../../src/db/repositories/CodexEntityRepository.js';
import { CodexFacetRepository } from '../../src/db/repositories/CodexFacetRepository.js';
import { CodexStateRepository } from '../../src/db/repositories/CodexStateRepository.js';
import { CodexRelationRepository } from '../../src/db/repositories/CodexRelationRepository.js';
import { CodexEraRepository } from '../../src/db/repositories/CodexEraRepository.js';
import { CodexEventRepository } from '../../src/db/repositories/CodexEventRepository.js';
import { CodexChangeRepository } from '../../src/db/repositories/CodexChangeRepository.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/vi';

describe('Codex migrations and service', () => {
  let service: CodexService;
  let poolCleanup: (() => Promise<void>) | null = null;
  let pool: ReturnType<typeof createPool>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.VI_TELEMETRY_ENABLED = 'false';
    initializeLogger('error');
    initializeTelemetry('./test-telemetry', false);

    const config = loadConfig();
    pool = createPool(config);
    await runMigrations(pool);

    const entityRepo = new CodexEntityRepository(pool);
    const facetRepo = new CodexFacetRepository(pool);
    const stateRepo = new CodexStateRepository(pool);
    const relationRepo = new CodexRelationRepository(pool);
    const eraRepo = new CodexEraRepository(pool);
    const eventRepo = new CodexEventRepository(pool);
    const changeRepo = new CodexChangeRepository(pool);

    service = new CodexService(entityRepo, facetRepo, stateRepo, relationRepo, eraRepo, eventRepo, changeRepo);

    poolCleanup = async () => {
      await closePool();
    };
  });

  afterAll(async () => {
    if (poolCleanup) {
      await poolCleanup();
    }
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE codex_event_entities, codex_events, codex_changes, codex_relations, codex_states, codex_facets, codex_entities, codex_eras RESTART IDENTITY CASCADE'
    );
  });

  it('applies codex migrations and adds features column', async () => {
    const entitiesTable = await pool.query("SELECT to_regclass('public.codex_entities') as name");
    expect(entitiesTable.rows[0]?.name).toBe('codex_entities');

    const featuresColumn = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'features'"
    );
    expect(featuresColumn.rowCount).toBeGreaterThan(0);
  });

  it('resolves entities with preferred truth axis and confidence floor', async () => {
    const era = await service.upsertEra({
      slug: `pilot-era-${randomUUID()}`,
      name: 'Pilot Era',
      summary: 'Early canon period',
    });

    const entity = await service.upsertEntity({
      slug: `hero-${randomUUID()}`,
      name: 'Test Hero',
      type: 'Character',
      aliases: ['hero'],
      summary: 'A resilient protagonist',
      truthAxis: 'truth',
      confidence: 'provisional',
      eraId: era.id,
    });

    await service.addFacet({
      entityId: entity.id,
      key: 'role',
      value: { title: 'Pilot' },
      truthAxis: 'truth',
      confidence: 'locked',
    });

    await service.addState({
      entityId: entity.id,
      key: 'status',
      data: { alive: true },
      eraId: era.id,
      truthAxis: 'truth',
      confidence: 'locked',
    });

    await service.addState({
      entityId: entity.id,
      key: 'status',
      data: { alive: false },
      eraId: null,
      truthAxis: 'belief',
      confidence: 'experimental',
    });

    const resolved = await service.resolveEntity(entity.id, {
      eraId: era.id,
      truthAxis: 'truth',
      confidenceFloor: 'experimental',
    });

    expect(resolved?.entity?.id).toBe(entity.id);
    expect(resolved?.resolved.stateByKey.status.data).toEqual({ alive: true });
    expect(resolved?.resolved.facetByKey.role.value).toEqual({ title: 'Pilot' });
    expect(resolved?.relations.length).toBe(0);
  });

  it('validates drafts against canon rules and constraints', async () => {
    const entity = await service.upsertEntity({
      slug: `draft-${randomUUID()}`,
      name: 'Draft Subject',
      type: 'Character',
      aliases: [],
      summary: 'Draft target',
      truthAxis: 'truth',
      confidence: 'provisional',
    });

    const blocked = await service.validateDraft({
      entityId: entity.id,
      summary: 'This includes a forbidden pattern',
      negativeConstraints: ['forbidden'],
      canonMode: 'commit',
    });
    expect(blocked.severity).toBe('block');

    const warn = await service.validateDraft({
      entityId: entity.id,
      summary: 'Tone risk',
      tasteLocks: ['tone'],
      canonMode: 'commit',
      proposedConfidence: 'experimental',
    });
    expect(warn.severity).toBe('warn');

    const ok = await service.validateDraft({
      entityId: entity.id,
      summary: 'Locked draft',
      canonMode: 'lock',
      proposedConfidence: 'locked',
    });
    expect(ok.severity).toBe('info');
  });
});
