/**
 * Astralis Codex tools
 *
 * Registers codex-aware tools with canon-mode gating.
 */

import type { Pool } from 'pg';
import { CodexService, CanonMode, ResolveEntityOptions } from '../../codex/CodexService.js';
import { CodexChangeRepository } from '../../db/repositories/CodexChangeRepository.js';
import { CodexEntityRepository } from '../../db/repositories/CodexEntityRepository.js';
import { CodexEraRepository } from '../../db/repositories/CodexEraRepository.js';
import { CodexEventRepository } from '../../db/repositories/CodexEventRepository.js';
import { CodexFacetRepository } from '../../db/repositories/CodexFacetRepository.js';
import { CodexRelationRepository } from '../../db/repositories/CodexRelationRepository.js';
import { CodexStateRepository } from '../../db/repositories/CodexStateRepository.js';
import { getToolRegistry } from '../registry.js';
import { JSONSchema, Tool } from '../types.js';

const ENTITY_TYPES = [
  'Character',
  'World',
  'Ability',
  'Item',
  'Law',
  'Rule',
  'Event',
  'Era',
  'Organization',
  'Species',
] as const;

const TRUTH_AXIS: Array<'truth' | 'belief' | 'public'> = ['truth', 'belief', 'public'];
const CONFIDENCE: Array<'locked' | 'provisional' | 'experimental'> = ['locked', 'provisional', 'experimental'];

function createCodexService(pool: Pool) {
  const entityRepo = new CodexEntityRepository(pool);
  const facetRepo = new CodexFacetRepository(pool);
  const stateRepo = new CodexStateRepository(pool);
  const relationRepo = new CodexRelationRepository(pool);
  const eraRepo = new CodexEraRepository(pool);
  const eventRepo = new CodexEventRepository(pool);
  const changeRepo = new CodexChangeRepository(pool);

  return {
    service: new CodexService(entityRepo, facetRepo, stateRepo, relationRepo, eraRepo, eventRepo, changeRepo),
    entityRepo,
  };
}

async function getCanonMode(pool: Pool, userId: string): Promise<CanonMode> {
  try {
    const res = await pool.query<{ features?: any }>('SELECT features FROM user_profiles WHERE user_id = $1', [userId]);
    const features = res.rows[0]?.features || {};
    const mode =
      features.canonMode ||
      features?.astralis?.canonMode ||
      features?.astralis_canon_mode;

    if (mode === 'brainstorm' || mode === 'commit' || mode === 'lock' || mode === 'export') {
      return mode;
    }
  } catch {
    // Default when feature flag storage is unavailable
  }
  return 'brainstorm';
}

async function assertCanonMode(
  pool: Pool,
  userId: string,
  allowed: CanonMode[]
): Promise<CanonMode> {
  const mode = await getCanonMode(pool, userId);
  if (!allowed.includes(mode)) {
    throw new Error(`Canon mode "${mode}" forbids this action; allowed modes: ${allowed.join(', ')}`);
  }
  return mode;
}

const querySchema: JSONSchema = {
  type: 'object',
  properties: {
    entityId: { type: 'string', description: 'Entity id to resolve' },
    slug: { type: 'string', description: 'Entity slug to resolve' },
    eraId: { type: 'string', description: 'Optional era filter' },
    truthAxis: { type: 'string', enum: TRUTH_AXIS, description: 'Preferred truth axis ordering' },
    confidenceFloor: { type: 'string', enum: CONFIDENCE, description: 'Minimum confidence to include' },
  },
};

const createOrUpdateSchema: JSONSchema = {
  type: 'object',
  required: ['slug', 'name', 'type', 'truthAxis', 'confidence'],
  properties: {
    id: { type: 'string', description: 'Optional existing entity id for update' },
    slug: { type: 'string', description: 'Unique slug (lowercase, hyphenated)' },
    name: { type: 'string', description: 'Display name' },
    type: { type: 'string', enum: ENTITY_TYPES as unknown as string[], description: 'Entity type' },
    aliases: { type: 'array', items: { type: 'string' }, description: 'Optional aliases' },
    summary: { type: 'string', description: 'Short summary' },
    truthAxis: { type: 'string', enum: TRUTH_AXIS, description: 'Truth/belief/public axis' },
    confidence: { type: 'string', enum: CONFIDENCE, description: 'Confidence level' },
    eraId: { type: 'string', description: 'Optional era id' },
    citations: { type: 'array', items: { type: 'object' }, description: 'Optional citations' },
  },
};

const addRelationSchema: JSONSchema = {
  type: 'object',
  required: ['subjectId', 'objectId', 'relationType', 'truthAxis', 'confidence'],
  properties: {
    subjectId: { type: 'string', description: 'Subject entity id' },
    objectId: { type: 'string', description: 'Object entity id' },
    relationType: { type: 'string', description: 'Relation label' },
    weight: { type: 'number', description: 'Optional weight 0-1' },
    eraId: { type: 'string', description: 'Optional era id' },
    truthAxis: { type: 'string', enum: TRUTH_AXIS, description: 'Truth/belief/public axis' },
    confidence: { type: 'string', enum: CONFIDENCE, description: 'Confidence level' },
    notes: { type: 'string', description: 'Optional notes' },
  },
};

const addStateSchema: JSONSchema = {
  type: 'object',
  required: ['entityId', 'key', 'data', 'truthAxis', 'confidence'],
  properties: {
    entityId: { type: 'string', description: 'Entity id' },
    key: { type: 'string', description: 'State key' },
    data: { type: 'object', description: 'State payload' },
    eraId: { type: 'string', description: 'Optional era id' },
    truthAxis: { type: 'string', enum: TRUTH_AXIS, description: 'Truth/belief/public axis' },
    confidence: { type: 'string', enum: CONFIDENCE, description: 'Confidence level' },
  },
};

const validateDraftSchema: JSONSchema = {
  type: 'object',
  required: ['entityId'],
  properties: {
    entityId: { type: 'string', description: 'Entity id' },
    summary: { type: 'string', description: 'Draft summary to validate' },
    proposedConfidence: { type: 'string', enum: CONFIDENCE, description: 'Confidence the draft will set' },
    negativeConstraints: { type: 'array', items: { type: 'string' }, description: 'Hard do-not-cross constraints' },
    tasteLocks: { type: 'array', items: { type: 'string' }, description: 'Taste locks to warn on' },
  },
};

export function initializeAstralisTools(pool: Pool): void {
  const registry = getToolRegistry();

  if (registry.exists('astralis.query')) {
    return;
  }

  const { service, entityRepo } = createCodexService(pool);

  const tools: Tool[] = [
    {
      name: 'astralis.query',
      category: 'memory',
      version: '1.0.0',
      description: 'Resolve a codex entity with context-aware facets, states, and relations.',
      inputSchema: querySchema,
      permissions: ['user_context'],
      rateLimit: { callsPerMinute: 30 },
      cost: { creditsPerExecution: 0 },
      timeout: { milliseconds: 5000 },
      isEnabled: true,
      async execute(parameters, context) {
        const entityIdParam = parameters.entityId as string | undefined;
        const slugParam = parameters.slug as string | undefined;

        let targetId = entityIdParam;
        if (!targetId && slugParam) {
          const existing = await entityRepo.getBySlug(slugParam.toLowerCase());
          if (!existing) {
            throw new Error('Entity not found for slug');
          }
          targetId = existing.id;
        }

        if (!targetId) {
          throw new Error('entityId or slug is required');
        }

        const resolveOptions: ResolveEntityOptions = {
          eraId: (parameters.eraId as string) || undefined,
          truthAxis: parameters.truthAxis as any,
          confidenceFloor: parameters.confidenceFloor as any,
        };

        const resolved = await service.resolveEntity(targetId, resolveOptions);
        if (!resolved) {
          throw new Error('Entity not found');
        }

        const canonMode = await getCanonMode(pool, context.userId);
        return {
          success: true,
          data: { canonMode, resolved },
          toolName: 'astralis.resolve_entity',
          parameters,
          executionTimeMs: 0,
          costApplied: 0,
          timestamp: new Date(),
          status: 'success',
        } as any;
      },
    },
    {
      name: 'astralis.create_or_update',
      category: 'memory',
      version: '1.0.0',
      description: 'Create or update a codex entity while honoring canon mode.',
      inputSchema: createOrUpdateSchema,
      permissions: ['user_context'],
      rateLimit: { callsPerMinute: 10 },
      cost: { creditsPerExecution: 0 },
      timeout: { milliseconds: 5000 },
      isEnabled: true,
      async execute(parameters, context) {
        const canonMode = await assertCanonMode(pool, context.userId, ['brainstorm', 'commit']);
        const entity = await service.upsertEntity({
          id: parameters.id as string | undefined,
          slug: (parameters.slug as string).toLowerCase(),
          name: parameters.name as string,
          type: parameters.type as string,
          aliases: (parameters.aliases as string[]) ?? [],
          summary: (parameters.summary as string) ?? null,
          truthAxis: parameters.truthAxis as any,
          confidence: parameters.confidence as any,
          eraId: (parameters.eraId as string) ?? null,
          citations: (parameters.citations as any[]) ?? [],
        });

        return {
          success: true,
          data: { canonMode, entity },
          toolName: 'astralis.create_or_update',
          parameters,
          executionTimeMs: 0,
          costApplied: 0,
          timestamp: new Date(),
          status: 'success',
        } as any;
      },
    },
    {
      name: 'astralis.add_relation',
      category: 'memory',
      version: '1.0.0',
      description: 'Link two entities with a typed relation.',
      inputSchema: addRelationSchema,
      permissions: ['user_context'],
      rateLimit: { callsPerMinute: 15 },
      cost: { creditsPerExecution: 0 },
      timeout: { milliseconds: 5000 },
      isEnabled: true,
      async execute(parameters, context) {
        const canonMode = await assertCanonMode(pool, context.userId, ['brainstorm', 'commit']);
        const relation = await service.addRelation({
          subjectId: parameters.subjectId as string,
          objectId: parameters.objectId as string,
          relationType: parameters.relationType as string,
          weight: parameters.weight as number | undefined,
          eraId: (parameters.eraId as string) ?? null,
          truthAxis: parameters.truthAxis as any,
          confidence: parameters.confidence as any,
          notes: (parameters.notes as string) ?? null,
        });
        return {
          success: true,
          data: { canonMode, relation },
          toolName: 'astralis.relate_entities',
          parameters,
          executionTimeMs: 0,
          costApplied: 0,
          timestamp: new Date(),
          status: 'success',
        } as any;
      },
    },
    {
      name: 'astralis.add_state',
      category: 'memory',
      version: '1.0.0',
      description: 'Append a state snapshot to an entity.',
      inputSchema: addStateSchema,
      permissions: ['user_context'],
      rateLimit: { callsPerMinute: 20 },
      cost: { creditsPerExecution: 0 },
      timeout: { milliseconds: 5000 },
      isEnabled: true,
      async execute(parameters, context) {
        const canonMode = await assertCanonMode(pool, context.userId, ['brainstorm', 'commit']);
        const state = await service.addState({
          entityId: parameters.entityId as string,
          key: parameters.key as string,
          data: parameters.data,
          eraId: (parameters.eraId as string) ?? null,
          truthAxis: parameters.truthAxis as any,
          confidence: parameters.confidence as any,
        });
        return {
          success: true,
          data: { canonMode, state },
          toolName: 'astralis.add_state',
          parameters,
          executionTimeMs: 0,
          costApplied: 0,
          timestamp: new Date(),
          status: 'success',
        } as any;
      },
    },
    {
      name: 'astralis.validate_draft',
      category: 'memory',
      version: '1.0.0',
      description: 'Validate a draft summary against canon rules.',
      inputSchema: validateDraftSchema,
      permissions: ['user_context'],
      rateLimit: { callsPerMinute: 30 },
      cost: { creditsPerExecution: 0 },
      timeout: { milliseconds: 4000 },
      isEnabled: true,
      async execute(parameters, context) {
        const canonMode = await getCanonMode(pool, context.userId);
        const result = await service.validateDraft({
          entityId: parameters.entityId as string,
          summary: parameters.summary as string | undefined,
          proposedConfidence: parameters.proposedConfidence as any,
          negativeConstraints: (parameters.negativeConstraints as string[]) ?? [],
          tasteLocks: (parameters.tasteLocks as string[]) ?? [],
          canonMode,
        });
        return {
          success: true,
          data: { canonMode, result },
          toolName: 'astralis.validate_draft',
          parameters,
          executionTimeMs: 0,
          costApplied: 0,
          timestamp: new Date(),
          status: 'success',
        } as any;
      },
    },
  ];

  for (const tool of tools) {
    try {
      registry.register(tool);
    } catch (error) {
      // Best-effort registration; avoid breaking startup if a tool already exists
      console.warn('Failed to register Astralis tool:', tool.name, error);
    }
  }
}
