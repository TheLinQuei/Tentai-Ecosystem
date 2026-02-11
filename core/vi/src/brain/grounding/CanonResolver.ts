/**
 * CanonResolver — Canon-First Strategy
 *
 * Implements the "canon first" principle:
 * When Vi is asked about Astralis entities, ALWAYS check canon first
 * before using LLM or memory
 */

import { Citation, CanonEntity, GroundingContext } from './types';

/**
 * Resolves canon entities and returns citations
 */
export class CanonResolver {
  private readonly logger: any;
  private canonCache: Map<string, CanonEntity>;

  constructor(logger?: any) {
    this.logger = logger || console;
    this.canonCache = new Map();
  }

  /**
   * Resolve a query against canon
   * Returns citations if found, empty array if not
   */
  async resolveFromCanon(
    query: string,
    entityReferences: string[],
    context: GroundingContext
  ): Promise<Citation[]> {
    const citations: Citation[] = [];

    // Try to find each referenced entity in canon
    for (const entityId of entityReferences) {
      const cannonData = context.availableCanon.get(entityId);

      if (cannonData) {
        this.logger.debug(`Found canon entity: ${entityId}`);

        citations.push({
          id: `cite-canon-${entityId}-${Date.now()}`,
          type: 'canon_entity',
          sourceId: entityId,
          sourceText: cannonData,
          confidence: 0.95, // Canon is high confidence by default
          timestamp: new Date(),
          metadata: {
            strategy: 'canon_first',
            queryLength: query.length,
          },
        });
      }
    }

    return citations;
  }

  /**
   * Check if query is about canon entities
   */
  isCanonQuery(entityReferences: string[]): boolean {
    // If we have entity references, it's a canon-relevant query
    return entityReferences.length > 0;
  }

  /**
   * Get canonical answer for entity
   * Returns null if not found in canon
   */
  async getCanonicalAnswer(entityId: string, context: GroundingContext): Promise<string | null> {
    const data = context.availableCanon.get(entityId);
    return data || null;
  }

  /**
   * Resolve entity through canon hierarchy
   * Some entities reference other entities
   */
  async resolveHierarchical(
    entityId: string,
    depth: number = 3,
    context?: GroundingContext
  ): Promise<Citation[]> {
    const citations: Citation[] = [];
    const visited = new Set<string>();
    const toVisit = [entityId];

    while (toVisit.length > 0 && depth > 0) {
      const current = toVisit.shift();
      if (!current || visited.has(current)) continue;

      visited.add(current);

      if (context?.availableCanon.has(current)) {
        const data = context.availableCanon.get(current);

        citations.push({
          id: `cite-canon-hier-${current}-${Date.now()}`,
          type: 'canon_entity',
          sourceId: current,
          sourceText: data || '',
          confidence: 0.95 - depth * 0.1, // Slightly lower confidence for derived facts
          metadata: {
            hierarchyDepth: depth,
            strategy: 'hierarchical_resolution',
          },
        });

        // Simple heuristic: look for entity references in the data
        const relatedIds = this.extractRelatedEntityIds(data || '');
        toVisit.push(...relatedIds.filter((id) => !visited.has(id)));
      }

      depth--;
    }

    return citations;
  }

  /**
   * Extract related entity IDs from canon data
   */
  private extractRelatedEntityIds(data: string): string[] {
    // Simple heuristic: look for patterns like @entity-id or [EntityName]
    const matches = data.match(/@[\w-]+|\[[\w\s]+\]/g);
    return matches ? matches.map((m) => m.replace(/[@\[\]]/g, '')) : [];
  }

  /**
   * Verify entity consistency across canon
   * Check if different canon sources conflict
   */
  async verifyCanonConsistency(
    entityId: string,
    context: GroundingContext
  ): Promise<{ consistent: boolean; conflicts: string[] }> {
    const conflicts: string[] = [];
    const canonData = context.availableCanon.get(entityId);

    if (!canonData) {
      return { consistent: true, conflicts };
    }

    // Check against related entities for consistency
    const relatedIds = this.extractRelatedEntityIds(canonData);
    for (const relatedId of relatedIds) {
      const relatedData = context.availableCanon.get(relatedId);
      if (relatedData) {
        // Simple check: if they both mention each other consistently
        if (!relatedData.includes(entityId)) {
          conflicts.push(
            `Entity ${relatedId} does not reference ${entityId} back (unidirectional reference)`
          );
        }
      }
    }

    return { consistent: conflicts.length === 0, conflicts };
  }

  /**
   * Get canon summary for UI display
   */
  summarizeCanonCitation(citation: Citation, maxLength: number = 200): string {
    if (citation.sourceText.length <= maxLength) {
      return citation.sourceText;
    }

    // Truncate and add ellipsis
    return citation.sourceText.substring(0, maxLength) + '...';
  }

  /**
   * Tag claims with canon alignment
   */
  getCanonAlignment(claim: string, context: GroundingContext): number {
    // Score how well a claim aligns with canon (0-1)
    const canonData = Array.from(context.availableCanon.values()).join('\n');

    // Simple heuristic: keyword overlap
    const claimWords = new Set(claim.toLowerCase().split(/\s+/));
    const canonWords = new Set(canonData.toLowerCase().split(/\s+/));

    const overlap = Array.from(claimWords).filter((w) => canonWords.has(w)).length;
    const alignment = overlap / claimWords.size;

    return Math.min(alignment, 1); // Clamp to 0-1
  }
}
