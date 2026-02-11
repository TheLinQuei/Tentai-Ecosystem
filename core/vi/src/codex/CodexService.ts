import { CodexChangeRepository } from '../db/repositories/CodexChangeRepository';
import { CodexEntityRepository, UpsertEntityInput } from '../db/repositories/CodexEntityRepository';
import { CodexEraRepository, UpsertEraInput } from '../db/repositories/CodexEraRepository';
import { CodexEventRepository, CreateEventInput } from '../db/repositories/CodexEventRepository';
import { CodexFacetRepository, UpsertFacetInput } from '../db/repositories/CodexFacetRepository';
import { CodexRelationRepository, CreateRelationInput } from '../db/repositories/CodexRelationRepository';
import { CodexStateRepository, CreateStateInput } from '../db/repositories/CodexStateRepository';

export type CanonMode = 'brainstorm' | 'commit' | 'lock' | 'export';

export interface ValidateDraftInput {
  entityId: string;
  canonMode: CanonMode;
  summary?: string;
  proposedConfidence?: 'locked' | 'provisional' | 'experimental';
  negativeConstraints?: string[];
  tasteLocks?: string[];
}

export interface ResolveEntityOptions {
  eraId?: string | null;
  truthAxis?: 'truth' | 'belief' | 'public';
  confidenceFloor?: 'locked' | 'provisional' | 'experimental';
}

export interface ResolvedEntityContext {
  entity: Awaited<ReturnType<CodexEntityRepository['getById']>>;
  facets: Awaited<ReturnType<CodexFacetRepository['listByEntity']>>;
  states: Awaited<ReturnType<CodexStateRepository['listByEntity']>>;
  relations: Awaited<ReturnType<CodexRelationRepository['listByEntity']>>;
  changes: Awaited<ReturnType<CodexChangeRepository['listByEntity']>>;
  resolved: {
    stateByKey: Record<string, Awaited<ReturnType<CodexStateRepository['listByEntity']>>[number]>;
    facetByKey: Record<string, Awaited<ReturnType<CodexFacetRepository['listByEntity']>>[number]>;
  };
  context: {
    eraId: string | null;
    truthAxis: 'truth' | 'belief' | 'public';
    confidenceFloor: 'locked' | 'provisional' | 'experimental';
  };
}

export interface ValidateDraftResult {
  severity: 'info' | 'warn' | 'block';
  message: string;
  fixSuggestion?: string;
}

export class CodexService {
  constructor(
    private readonly entityRepo: CodexEntityRepository,
    private readonly facetRepo: CodexFacetRepository,
    private readonly stateRepo: CodexStateRepository,
    private readonly relationRepo: CodexRelationRepository,
    private readonly eraRepo: CodexEraRepository,
    private readonly eventRepo: CodexEventRepository,
    private readonly changeRepo: CodexChangeRepository
  ) {}

  async upsertEra(input: UpsertEraInput) {
    return this.eraRepo.upsert({ ...input, slug: input.slug.toLowerCase() });
  }

  async upsertEntity(input: UpsertEntityInput) {
    return this.entityRepo.upsert({
      ...input,
      slug: input.slug.toLowerCase(),
      aliases: input.aliases ?? [],
      citations: input.citations ?? [],
    });
  }

  async addFacet(input: UpsertFacetInput) {
    return this.facetRepo.upsert(input);
  }

  async addState(input: CreateStateInput) {
    return this.stateRepo.create(input);
  }

  async addRelation(input: CreateRelationInput) {
    return this.relationRepo.create(input);
  }

  async recordEvent(input: CreateEventInput) {
    return this.eventRepo.create(input);
  }

  async recordChange(input: Parameters<CodexChangeRepository['create']>[0]) {
    return this.changeRepo.create(input);
  }

  async getEntityContext(entityId: string) {
    const [entity, facets, states, relations, changes] = await Promise.all([
      this.entityRepo.getById(entityId),
      this.facetRepo.listByEntity(entityId),
      this.stateRepo.listByEntity(entityId),
      this.relationRepo.listByEntity(entityId),
      this.changeRepo.listByEntity(entityId),
    ]);

    return { entity, facets, states, relations, changes };
  }

  async resolveEntity(entityId: string, options: ResolveEntityOptions = {}): Promise<ResolvedEntityContext | null> {
    const context = await this.getEntityContext(entityId);
    if (!context.entity) {
      return null;
    }

    const truthPreference: Array<'truth' | 'belief' | 'public'> = options.truthAxis
      ? [options.truthAxis, ...(['truth', 'belief', 'public'] as const).filter((axis) => axis !== options.truthAxis)]
      : ['truth', 'belief', 'public'];

    const confidenceFloor = options.confidenceFloor ?? 'experimental';
    const confidenceRank: Record<'locked' | 'provisional' | 'experimental', number> = {
      locked: 3,
      provisional: 2,
      experimental: 1,
    };

    const truthRank = (axis: 'truth' | 'belief' | 'public') => truthPreference.indexOf(axis);
    const meetsConfidence = (value: 'locked' | 'provisional' | 'experimental') =>
      confidenceRank[value] >= confidenceRank[confidenceFloor];

    const sortByPreference = <T extends { truthAxis: any; confidence: any; createdAt?: string; updatedAt?: string }>(
      a: T,
      b: T
    ) => {
      const truthComparison = truthRank(a.truthAxis) - truthRank(b.truthAxis);
      if (truthComparison !== 0) return truthComparison;

      const confidenceComparison = confidenceRank[b.confidence] - confidenceRank[a.confidence];
      if (confidenceComparison !== 0) return confidenceComparison;

      const timeA = a.updatedAt || a.createdAt;
      const timeB = b.updatedAt || b.createdAt;
      if (!timeA || !timeB) return 0;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    };

    const filterStates = context.states
      .filter((state) => !options.eraId || state.eraId === options.eraId)
      .filter((state) => meetsConfidence(state.confidence as any))
      .sort(sortByPreference);

    const filterRelations = context.relations
      .filter((relation) => !options.eraId || relation.eraId === options.eraId)
      .filter((relation) => meetsConfidence(relation.confidence as any))
      .sort(sortByPreference);

    const filterFacets = context.facets
      .filter((facet) => meetsConfidence(facet.confidence as any))
      .sort(sortByPreference);

    const groupByKey = <T extends { key: string }>(items: T[]) => {
      const result: Record<string, T> = {};
      for (const item of items) {
        if (!result[item.key]) {
          result[item.key] = item;
        }
      }
      return result;
    };

    return {
      entity: context.entity,
      facets: filterFacets,
      states: filterStates,
      relations: filterRelations,
      changes: context.changes,
      resolved: {
        stateByKey: groupByKey(filterStates),
        facetByKey: groupByKey(filterFacets),
      },
      context: {
        eraId: options.eraId ?? null,
        truthAxis: truthPreference[0],
        confidenceFloor,
      },
    };
  }

  async validateDraft(input: ValidateDraftInput): Promise<ValidateDraftResult> {
    const entity = await this.entityRepo.getById(input.entityId);
    if (!entity) {
      return {
        severity: 'block',
        message: 'Entity not found; create or adopt before editing canon.',
        fixSuggestion: 'Create the entity via astralis.create_or_update before validating.',
      };
    }

    const negativeHits = (input.negativeConstraints ?? []).filter((constraint) =>
      (input.summary ?? '').toLowerCase().includes(constraint.toLowerCase())
    );
    if (negativeHits.length > 0) {
      return {
        severity: 'block',
        message: `Draft violates locked canon: ${negativeHits.join(', ')}`,
        fixSuggestion: 'Remove or refactor the draft to respect negative canon rules.',
      };
    }

    const tasteHits = (input.tasteLocks ?? []).filter((lock) =>
      (input.summary ?? '').toLowerCase().includes(lock.toLowerCase())
    );
    if (tasteHits.length > 0) {
      return {
        severity: 'warn',
        message: `Draft conflicts with taste locks: ${tasteHits.join(', ')}`,
        fixSuggestion: 'Adjust tone to align with taste locks or mark as deliberate override.',
      };
    }

    if (input.canonMode === 'lock' && (input.proposedConfidence ?? entity.confidence) !== 'locked') {
      return {
        severity: 'block',
        message: 'Locked canon requires confidence=locked before saving.',
        fixSuggestion: 'Set confidence to locked or switch canon mode to commit/brainstorm.',
      };
    }

    if (input.canonMode === 'commit' && (input.proposedConfidence ?? entity.confidence) === 'experimental') {
      return {
        severity: 'warn',
        message: 'Commit mode should avoid experimental confidence.',
        fixSuggestion: 'Upgrade confidence to provisional or locked before commit.',
      };
    }

    return {
      severity: 'info',
      message: 'Draft looks consistent with current canon checks.',
    };
  }
}
