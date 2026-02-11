/**
 * GroundingGate — Phase 2 Core Implementation
 *
 * Validates responses against canon, memory, and tool outputs
 * Ensures all claims are grounded or properly tagged as uncertain
 */

import {
  Citation,
  Claim,
  GroundingCheck,
  GroundingContext,
  GroundingRequirements,
  CitationSourceType,
  GroundedResponse,
} from './types';
import { MemoryResolver } from './MemoryResolver';
import { CanonResolver } from './CanonResolver';

/**
 * Main grounding enforcement gate
 * All responses pass through this before being sent to users
 */
export class GroundingGate {
  private readonly logger: any;
  private readonly canonResolver: CanonResolver;
  private readonly memoryResolver: MemoryResolver | null;

  constructor(logger?: any, memoryResolver?: MemoryResolver) {
    const fallbackLogger = {
      debug: (...args: any[]) => console.debug(...args),
      info: (...args: any[]) => console.info(...args),
      warn: (...args: any[]) => console.warn(...args),
      error: (...args: any[]) => console.error(...args),
    };

    this.logger = {
      debug: logger?.debug || fallbackLogger.debug,
      info: logger?.info || fallbackLogger.info,
      warn: logger?.warn || fallbackLogger.warn,
      error: logger?.error || fallbackLogger.error,
    };
    this.canonResolver = new CanonResolver(logger);
    this.memoryResolver = memoryResolver || null;
  }

  /**
   * Validate a response for grounding compliance
   */
  async validateResponse(
    responseText: string,
    context: GroundingContext
  ): Promise<GroundingCheck> {
    try {
      // Extract claims from response
      const claims = this.extractClaims(responseText);
      this.logger.debug(`Extracted ${claims.length} claims from response`);

      // Find sources for each claim
      const citations: Citation[] = [];
      const ungroundedClaims: Claim[] = [];
      let totalConfidence = 0;

      for (const claim of claims) {
        const claimCitations = await this.findSourcesForClaim(claim, context);

        if (claimCitations.length > 0) {
          citations.push(...claimCitations);
          totalConfidence += this.averageConfidence(claimCitations);
        } else if (claim.claimType === 'uncertainty') {
          // Uncertainty statements don't need grounding
          totalConfidence += 1;
        } else {
          ungroundedClaims.push(claim);
        }
      }

      const avgConfidence = claims.length > 0 ? totalConfidence / claims.length : 1;
      const missingGrounding = ungroundedClaims.map((c) => c.text);

      // Determine recommendation
      const recommendation = this.determineRecommendation(
        context.requirements,
        ungroundedClaims,
        avgConfidence
      );

      const check: GroundingCheck = {
        passed: recommendation !== 'block',
        citations: this.deduplicateCitations(citations),
        confidence: avgConfidence,
        missingGrounding,
        ungroundedClaims,
        recommendation,
        reason: this.generateReason(recommendation, ungroundedClaims, avgConfidence),
      };

      return check;
    } catch (error) {
      this.logger.error('Error in grounding validation', { error });
      // On error, allow but mark as uncertain
      return {
        passed: true,
        citations: [],
        confidence: 0.5,
        missingGrounding: ['Grounding validation failed'],
        ungroundedClaims: [],
        recommendation: 'warn',
        reason: 'Grounding validation encountered an error',
      };
    }
  }

  /**
   * Extract claims from response text
   */
  extractClaims(text: string): Claim[] {
    const claims: Claim[] = [];
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    let currentIdx = 0;
    for (const sentence of sentences) {
      const sentenceIdx = text.indexOf(sentence, currentIdx);
      const endIdx = sentenceIdx + sentence.length;

      // Simple heuristic: sentences with questions, commands, or factual statements
      const trimmed = sentence.trim();

      if (trimmed.length < 10) {
        currentIdx = endIdx;
        continue;
      }

      let claimType: 'factual' | 'procedural' | 'directive' | 'uncertainty' = 'factual';

      if (
        trimmed.includes('?') ||
        trimmed.toLowerCase().includes('i don\'t know') ||
        trimmed.toLowerCase().includes('unknown')
      ) {
        claimType = 'uncertainty';
      } else if (trimmed.toLowerCase().match(/^(to|don\'t|can\'t|should|must)/)) {
        claimType = 'directive';
      } else if (trimmed.toLowerCase().match(/^how to|steps|process/)) {
        claimType = 'procedural';
      }

      // Extract entity references (simple: capitalized words)
      const entities = this.extractEntityReferences(trimmed);

      claims.push({
        id: `claim-${claims.length}`,
        text: trimmed,
        startIdx: sentenceIdx,
        endIdx,
        claimType,
        relatedEntities: entities,
      });

      currentIdx = endIdx;
    }

    return claims;
  }

  /**
   * Find citations for a specific claim
   * Uses canon-first strategy: check canon, then memory, then tools
   */
  async findSourcesForClaim(claim: Claim, context: GroundingContext): Promise<Citation[]> {
    const citations: Citation[] = [];

    // Strategy 1: Check canon first (highest priority)
    const canonCitations = await this.canonResolver.resolveFromCanon(
      claim.text,
      claim.relatedEntities,
      context
    );

    if (canonCitations.length > 0) {
      citations.push(...canonCitations);
      return citations; // Found in canon, don't need memory
    }

    // Strategy 2: Fall back to memory if canon incomplete
    if (this.memoryResolver && context.userId) {
      const memoryCitations = await this.memoryResolver.resolveFromMemory(
        context.userId,
        claim.text,
        { maxResults: 3, minRelevance: 0.6 }
      );

      if (memoryCitations.length > 0) {
        citations.push(...memoryCitations);
        return citations;
      }
    }

    // Strategy 3: Check context-provided memory as fallback
    for (const entityId of claim.relatedEntities) {
      const memoryData = context.availableMemories.get(entityId);
      if (memoryData) {
        citations.push({
          id: `cite-memory-${entityId}-${Date.now()}`,
          type: 'memory',
          sourceId: entityId,
          sourceText: memoryData,
          confidence: 0.75, // Memory is medium confidence
        });
      }
    }

    return citations;
  }

  /**
   * Extract entity references from text
   */
  private extractEntityReferences(text: string): string[] {
    // Simple heuristic: find capitalized words (potential entity names)
    const matches = text.match(/\b[A-Z][a-zA-Z]*\b/g);
    return matches ? Array.from(new Set(matches)) : [];
  }

  /**
   * Determine recommendation based on requirements and findings
   */
  private determineRecommendation(
    requirements: GroundingRequirements,
    ungroundedClaims: Claim[],
    confidence: number
  ): 'allow' | 'block' | 'warn' | 'ask_user' {
    // Block if too many ungrounded claims and citations required
    if (requirements.requireCitations && ungroundedClaims.length > requirements.maxUngroundedClaims) {
      return 'block';
    }

    // Warn if confidence too low
    if (confidence < requirements.minConfidence) {
      return 'warn';
    }

    // Ask user if there are ungrounded claims in strict mode
    if (ungroundedClaims.length > 0 && requirements.maxUngroundedClaims === 0) {
      return 'ask_user';
    }

    // Otherwise allow
    return 'allow';
  }

  /**
   * Generate human-readable reason for recommendation
   */
  private generateReason(
    recommendation: string,
    ungroundedClaims: Claim[],
    confidence: number
  ): string {
    switch (recommendation) {
      case 'block':
        return `Too many ungrounded claims (${ungroundedClaims.length})`;
      case 'warn':
        return `Low confidence (${(confidence * 100).toFixed(1)}%)`;
      case 'ask_user':
        return `Contains ${ungroundedClaims.length} ungrounded claim(s)`;
      case 'allow':
        return `Response is grounded`;
      default:
        return '';
    }
  }

  /**
   * Average confidence across citations
   */
  private averageConfidence(citations: Citation[]): number {
    if (citations.length === 0) return 0;
    return citations.reduce((sum, c) => sum + c.confidence, 0) / citations.length;
  }

  /**
   * Deduplicate citations by source
   */
  private deduplicateCitations(citations: Citation[]): Citation[] {
    const seen = new Set<string>();
    const deduplicated: Citation[] = [];

    for (const citation of citations) {
      const key = `${citation.type}:${citation.sourceId}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(citation);
      }
    }

    return deduplicated;
  }

  /**
   * Create a grounded response with metadata
   */
  async groundResponse(
    responseText: string,
    context: GroundingContext
  ): Promise<GroundedResponse> {
    const check = await this.validateResponse(responseText, context);

    let groundingStatus: 'grounded' | 'ungrounded' | 'uncertain' | 'blocked' = 'grounded';

    if (check.recommendation === 'block') {
      groundingStatus = 'blocked';
    } else if (check.confidence < 0.7) {
      groundingStatus = 'uncertain';
    } else if (check.ungroundedClaims.length > 0) {
      groundingStatus = 'ungrounded';
    }

    return {
      content: responseText,
      citations: check.citations,
      confidence: check.confidence,
      groundingStatus,
      warnings: check.ungroundedClaims.map((claim) => ({
        code: 'ungrounded_claim',
        message: `Claim not grounded: "${claim.text}"`,
        failedClaim: claim,
      })),
    };
  }
}
