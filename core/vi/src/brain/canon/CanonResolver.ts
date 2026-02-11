/**
 * PHASE 4: Canon Resolver
 * 
 * Provides queryable access to Astralis Codex canon facts and verse rules.
 * Resolves canon queries, handles contradictions, and provides citations.
 * 
 * Canon is truth. It is:
 * - Structured (no freeform invention)
 * - Queryable (by entity, timeline, rule)
 * - Enforced (contradictions handled)
 * - Cited (every fact has source)
 * - Uncertainty explicit (unknown facts acknowledged)
 */

export interface CanonEntity {
  id: string;
  name: string;
  aliases?: string[];
  description: string;
  type: 'character' | 'location' | 'faction' | 'artifact' | 'concept';
  attributes?: Record<string, any>;
  created_at?: string;
  last_updated?: string;
}

export interface CanonFact {
  id: string;
  subject_id: string; // Entity ID (e.g., movado_character)
  predicate: string; // What is being stated (e.g., 'originated_from')
  object_id?: string; // Reference to another entity (if applicable)
  value?: string; // Literal value (if not entity reference)
  confidence: number; // 0-1 confidence level
  source_id: string; // Citation reference
  timestamp: string;
  verification_status: 'canon' | 'extended_canon' | 'uncertain' | 'disputed';
  contradictions?: string[]; // IDs of conflicting facts
}

export interface VerseRule {
  id: string;
  title: string;
  description: string;
  applies_to: string[]; // Entity IDs this rule applies to
  priority: number; // Higher = overrides lower
  text: string; // The actual rule/law
  exceptions?: string[];
  source_id: string;
  created_at: string;
}

export interface CanonSource {
  id: string;
  title: string;
  type: 'codex_entry' | 'lore_document' | 'character_sheet' | 'timeline' | 'external';
  content: string;
  authority_level: number; // 0-100, higher = more authoritative
  contributors: string[];
  created_at: string;
  last_verified_at: string;
}

export interface CanonResolution {
  facts: CanonFact[];
  entities: CanonEntity[];
  rules: VerseRule[];
  confidence: number; // 0-1 overall confidence in results
  citations: CanonSource[];
  uncertainties?: string[]; // Things we don't know or are disputed
  warnings?: string[]; // Contradictions or concerns
}

export class CanonResolver {
  private canonStore: Map<string, CanonEntity>;
  private facts: Map<string, CanonFact[]>;
  private rules: Map<string, VerseRule[]>;
  private sources: Map<string, CanonSource>;

  constructor() {
    this.canonStore = new Map();
    this.facts = new Map();
    this.rules = new Map();
    this.sources = new Map();
    this.initializeSampleCanon();
  }

  /**
   * Initialize with sample canon (will be replaced with DB queries)
   */
  private initializeSampleCanon(): void {
    // Core entities (examples)
    const entities: CanonEntity[] = [
      {
        id: 'movado_character',
        name: 'Movado',
        type: 'character',
        description: 'Primary antagonist. Master of temporal manipulation.',
        attributes: { age: 'unknown', origin: 'astralis', primary_goal: 'temporal_domination' },
      },
      {
        id: 'azula_character',
        name: 'Azula',
        type: 'character',
        description: 'Sovereign of the Astralis verse. Guardian of the Timeline.',
        attributes: { age: 'immortal', origin: 'astralis_native', primary_goal: 'maintain_timeline' },
      },
      {
        id: 'akima_character',
        name: 'Akima',
        type: 'character',
        description: 'Bridge-walker. Moves between realities.',
        attributes: { age: 'variable', origin: 'astralis', primary_goal: 'maintain_bridges' },
      },
      {
        id: 'astralis_location',
        name: 'Astralis',
        type: 'location',
        description: 'The Verse. A pocket dimension holding multiple timelines.',
        attributes: { dimension_type: 'pocket', timeline_count: 'multiple', stability: 'contested' },
      },
      {
        id: 'codex_artifact',
        name: 'Codex',
        aliases: ['Astralis Codex', 'The Codex'],
        type: 'artifact',
        description: 'The living record of Astralis canon. Repository of all verified lore.',
        attributes: { type: 'living_document', authority: 'absolute', accessibility: 'restricted' },
      },
    ];

    for (const entity of entities) {
      this.canonStore.set(entity.id, entity);
    }

    // Core facts
    const facts: CanonFact[] = [
      {
        id: 'fact_movado_origin',
        subject_id: 'movado_character',
        predicate: 'origin',
        value: 'Outside Astralis, invaded during Timeline Fracture',
        confidence: 0.95,
        source_id: 'codex_movado',
        timestamp: '2026-01-01T00:00:00Z',
        verification_status: 'canon',
      },
      {
        id: 'fact_azula_role',
        subject_id: 'azula_character',
        predicate: 'role',
        value: 'Timeline Guardian and Sovereign of Astralis',
        confidence: 0.99,
        source_id: 'codex_azula',
        timestamp: '2026-01-01T00:00:00Z',
        verification_status: 'canon',
      },
      {
        id: 'fact_akima_ability',
        subject_id: 'akima_character',
        predicate: 'unique_ability',
        value: 'Can traverse between Astralis and external dimensions',
        confidence: 0.9,
        source_id: 'codex_akima',
        timestamp: '2026-01-01T00:00:00Z',
        verification_status: 'extended_canon',
      },
      {
        id: 'fact_astralis_nature',
        subject_id: 'astralis_location',
        predicate: 'nature',
        value: 'Pocket dimension containing multiple branching timelines',
        confidence: 0.99,
        source_id: 'codex_laws',
        timestamp: '2026-01-01T00:00:00Z',
        verification_status: 'canon',
      },
      {
        id: 'fact_codex_purpose',
        subject_id: 'codex_artifact',
        predicate: 'purpose',
        value: 'Authoritative repository of all Astralis canon, verse rules, and verified facts',
        confidence: 1.0,
        source_id: 'codex_meta',
        timestamp: '2026-01-01T00:00:00Z',
        verification_status: 'canon',
      },
    ];

    for (const fact of facts) {
      const existing = this.facts.get(fact.subject_id) || [];
      existing.push(fact);
      this.facts.set(fact.subject_id, existing);
    }

    // Core rules
    const rules: VerseRule[] = [
      {
        id: 'rule_timeline_inviolate',
        title: 'The Timeline Is Inviolate',
        description: 'The primary timeline cannot be altered without consensus',
        applies_to: ['azula_character', 'astralis_location'],
        priority: 100,
        text: 'Primary timeline exists in locked state. All changes require Sovereign approval.',
        source_id: 'codex_laws',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'rule_invaders_contained',
        title: 'Invaders Are Contained',
        description: 'External entities cannot leave Astralis without Sovereign approval',
        applies_to: ['movado_character', 'astralis_location'],
        priority: 95,
        text: 'All non-native entities attempting to exit face Sovereign judgment.',
        source_id: 'codex_laws',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    for (const rule of rules) {
      // Store rule for ALL entities it applies to
      for (const entityId of rule.applies_to) {
        const existing = this.rules.get(entityId) || [];
        existing.push(rule);
        this.rules.set(entityId, existing);
      }
    }

    // Sources
    const sources: CanonSource[] = [
      {
        id: 'codex_movado',
        title: 'The Invader: Movado Chronicles',
        type: 'codex_entry',
        content: 'Movado arrived during the Timeline Fracture event...',
        authority_level: 95,
        contributors: ['Astralis Council'],
        created_at: '2026-01-01T00:00:00Z',
        last_verified_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'codex_azula',
        title: 'Azula: Sovereign of Time',
        type: 'character_sheet',
        content: 'Azula has governed Astralis since its inception...',
        authority_level: 99,
        contributors: ['Astralis Council'],
        created_at: '2026-01-01T00:00:00Z',
        last_verified_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'codex_laws',
        title: 'Verse Laws and Governance',
        type: 'codex_entry',
        content: 'The following laws govern interaction within Astralis...',
        authority_level: 98,
        contributors: ['Astralis Council'],
        created_at: '2026-01-01T00:00:00Z',
        last_verified_at: '2026-01-10T00:00:00Z',
      },      {
        id: 'codex_meta',
        title: 'The Codex: About the Repository',
        type: 'codex_entry',
        content: 'The Codex is the canonical source for all Astralis lore...',
        authority_level: 100,
        contributors: ['Astralis Council', 'Sovereign'],
        created_at: '2026-01-01T00:00:00Z',
        last_verified_at: '2026-01-10T00:00:00Z',
      },    ];

    for (const source of sources) {
      this.sources.set(source.id, source);
    }
  }

  /**
   * Resolve canon for a query
   */
  async resolveCanon(query: string, context?: { entity_id?: string; strict?: boolean }): Promise<CanonResolution> {
    const lowerQuery = query.toLowerCase();

    const facts: CanonFact[] = [];
    const rules: VerseRule[] = [];
    const entities: CanonEntity[] = [];
    const citations = new Set<CanonSource>();
    const uncertainties: string[] = [];
    const warnings: string[] = [];

    // Extract all matching entities from query (not just first match)
    if (context?.entity_id) {
      const targetEntity = this.canonStore.get(context.entity_id);
      if (targetEntity) entities.push(targetEntity);
    } else {
      // Find all entities mentioned in query
      for (const [_id, entity] of this.canonStore) {
        if (entity.name.toLowerCase() !== entity.name && lowerQuery.includes(entity.name.toLowerCase())) {
          entities.push(entity);
        } else if (entity.name.toLowerCase() === entity.name && lowerQuery.includes(entity.name)) {
          entities.push(entity);
        } else if (entity.aliases?.some((a) => lowerQuery.includes(a.toLowerCase()))) {
          entities.push(entity);
        }
      }
    }

    // Collect facts, rules, and citations for all found entities
    for (const entity of entities) {
      // Get all facts about this entity
      const entityFacts = this.facts.get(entity.id) || [];
      facts.push(...entityFacts);

      // Get all rules for this entity
      const entityRules = this.rules.get(entity.id) || [];
      rules.push(...entityRules);

      // Collect citations
      for (const fact of entityFacts) {
        const source = this.sources.get(fact.source_id);
        if (source) citations.add(source);
      }

      // Check for contradictions
      for (const fact of entityFacts) {
        if (fact.contradictions && fact.contradictions.length > 0) {
          warnings.push(`Contradiction detected on fact ${fact.id}: conflicting information exists`);
        }
      }

      // Mark uncertain facts
      for (const fact of entityFacts) {
        if (fact.verification_status === 'uncertain' || fact.confidence < 0.7) {
          uncertainties.push(`Uncertain: ${fact.predicate} (confidence: ${fact.confidence})`);
        }
      }
    }

    if (entities.length === 0) {
      // Entity not found in canon
      uncertainties.push(`Entity not found in canon: "${query}". This information is unavailable or external to Astralis.`);
      if (!context?.strict) {
        // In non-strict mode, return empty but valid response
        return {
          facts: [],
          entities: [],
          rules: [],
          confidence: 0,
          citations: [],
          uncertainties,
          warnings: ['Query did not match any known canon entities'],
        };
      } else {
        // In strict mode, throw error
        throw new Error(`Canon not found for query: ${query}`);
      }
    }

    // Calculate overall confidence
    const avgConfidence =
      facts.length > 0 ? facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length : 0;

    return {
      facts,
      entities,
      rules,
      confidence: Math.min(avgConfidence, 0.95), // Cap at 95% even if all high
      citations: Array.from(citations),
      uncertainties: uncertainties.length > 0 ? uncertainties : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Find entity by name (case-insensitive)
   */
  private findEntityByName(query: string): CanonEntity | undefined {
    for (const [_id, entity] of this.canonStore) {
      if (entity.name.toLowerCase().includes(query) || entity.aliases?.some((a) => a.toLowerCase().includes(query))) {
        return entity;
      }
    }
    return undefined;
  }

  /**
   * Check if query is about lore/canon (heuristic detection)
   */
  isLoreQuery(message: string): boolean {
    const loreKeywords = [
      'astralis',
      'codex',
      'movado',
      'azula',
      'akima',
      'verse',
      'lore',
      'canon',
      'timeline',
      'sovereign',
      'character_sheet',
      'lore mode',
    ];

    const lowerMessage = message.toLowerCase();
    
    // Check for explicit lore keywords
    if (loreKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      return true;
    }

    // Check for "who is [Character]" pattern specifically
    // Must have capitalized proper noun immediately after "who is"
    if (/who is [A-Z][a-z]+/.test(message)) {
      return true;
    }

    // Check for "tell me about [Entity]" with capitalized entity
    if (/tell me about [A-Z][a-z]+/.test(message)) {
      return true;
    }

    return false;
  }

  /**
   * Get formatted citation string for response
   */
  formatCitations(sources: CanonSource[]): string {
    if (sources.length === 0) return '';

    const citationLines = sources.map(
      (source) => `[${source.id}] ${source.title} (Authority: ${source.authority_level}/100)`
    );

    return '\n\n**Canon Sources:**\n' + citationLines.join('\n');
  }

  /**
   * Get formatted contradiction warning
   */
  formatWarnings(warnings?: string[]): string {
    if (!warnings || warnings.length === 0) return '';

    return '\n\n⚠️ **Canon Notes:**\n' + warnings.map((w) => `- ${w}`).join('\n');
  }

  /**
   * Get formatted uncertainty disclaimer
   */
  formatUncertainties(uncertainties?: string[]): string {
    if (!uncertainties || uncertainties.length === 0) return '';

    return '\n\n❓ **Uncertain Information:**\n' + uncertainties.map((u) => `- ${u}`).join('\n');
  }
}
