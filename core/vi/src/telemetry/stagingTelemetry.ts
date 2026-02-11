/**
 * Staging Telemetry Helper
 * 
 * Formats validation telemetry for staging logs.
 * - No PII (user IDs hashed, no private facts)
 * - Structured for easy monitoring
 * - Feature-flagged by STAGING_VALIDATION_MODE
 */

import crypto from 'crypto';
import { getLogger } from '../telemetry/logger.js';

export interface RelationshipTelemetry {
  vi_user_id?: string; // Will be hashed
  source: 'locked_fact' | 'database' | 'guarded_clamp' | 'default';
  relationship_type: 'owner' | 'public';
  voice_profile: 'owner_luxury' | 'public_elegant';
  trust_level: number;
  resolved_in_ms: number;
}

export interface AmbiguityTelemetry {
  reason:
    | 'MALFORMED_QUERY'
    | 'DANGLING_REFERENCE'
    | 'UNDERSPECIFIED_COMPARISON'
    | 'CONTRADICTORY_REQUEST'
    | 'NONE';
  input_length: number;
  confidence: number;
  checked_in_ms: number;
}

export interface GovernorTelemetry {
  violation_type: 'repetition' | 'locked_fact' | 'ungrounded' | 'posture' | 'none';
  attempt: number;
  max_attempts: number;
  regen_in_ms: number;
}

export interface ContinuityPackSummary {
  locked_facts_count: number;
  explicit_facts_count: number;
  inferred_facts_count: number;
  ephemeral_facts_count: number;
  historical_summaries_count: number;
  engagement_history_count: number;
  size_bytes: number;
  built_in_ms: number;
}

export class StagingTelemetry {
  private logger = getLogger();
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.STAGING_VALIDATION_MODE === 'true';
  }

  /**
   * Hash user ID for logs (no PII)
   */
  private hashUserId(userId: string): string {
    if (!userId) return 'unknown';
    const hash = crypto
      .createHash('sha256')
      .update(userId)
      .digest('hex')
      .substring(0, 8);
    return `user_${hash}`;
  }

  /**
   * Log relationship resolver decision
   */
  logRelationshipResolution(data: RelationshipTelemetry): void {
    if (!this.enabled) return;

    const hashedId = this.hashUserId(data.vi_user_id || '');
    this.logger.info(
      {
        hashedUserId: hashedId,
        source: data.source,
        relationship_type: data.relationship_type,
        voice_profile: data.voice_profile,
        trust_level: data.trust_level,
        resolved_in_ms: data.resolved_in_ms,
      },
      '[Staging] Relationship resolved'
    );
  }

  /**
   * Log ambiguity detection decision
   */
  logAmbiguityDetection(data: AmbiguityTelemetry): void {
    if (!this.enabled) return;

    const status = data.reason === 'NONE' ? 'clear' : 'AMBIGUOUS';
    this.logger.info(
      {
        status,
        reason: data.reason,
        input_length: data.input_length,
        confidence: data.confidence,
        checked_in_ms: data.checked_in_ms,
      },
      '[Staging] Ambiguity check completed'
    );
  }

  /**
   * Log governor regeneration
   */
  logGovernorAttempt(data: GovernorTelemetry): void {
    if (!this.enabled) return;

    const status = data.violation_type === 'none' ? 'passed' : 'violation_detected';
    this.logger.info(
      {
        status,
        violation_type: data.violation_type,
        attempt: data.attempt,
        max_attempts: data.max_attempts,
        regen_in_ms: data.regen_in_ms,
      },
      `[Staging] Governor pass ${data.attempt}/${data.max_attempts}`
    );
  }

  /**
   * Log ContinuityPack summary (authority tier breakdown)
   */
  logContinuityPackSummary(
    data: ContinuityPackSummary,
    userId?: string
  ): void {
    if (!this.enabled) return;

    const hashedId = userId ? this.hashUserId(userId) : 'anonymous';
    const totalFacts =
      data.locked_facts_count +
      data.explicit_facts_count +
      data.inferred_facts_count +
      data.ephemeral_facts_count;

    this.logger.info(
      {
        hashedUserId: hashedId,
        total_facts: totalFacts,
        authority_breakdown: {
          locked: data.locked_facts_count,
          explicit: data.explicit_facts_count,
          inferred: data.inferred_facts_count,
          ephemeral: data.ephemeral_facts_count,
        },
        historical_summaries: data.historical_summaries_count,
        engagement_history: data.engagement_history_count,
        size_bytes: data.size_bytes,
        built_in_ms: data.built_in_ms,
      },
      '[Staging] ContinuityPack built'
    );
  }

  /**
   * Validate that key telemetry fields are present in context
   * (used by tests to verify telemetry is being collected)
   */
  validateTelemetryContext(context: any): boolean {
    if (!this.enabled) return true;

    // Check that context has expected telemetry fields
    const hasRelationshipContext = !!context.relationship_context;
    const hasContinuityPack = !!context.continuity_pack;

    if (!hasRelationshipContext || !hasContinuityPack) {
      this.logger.warn(
        {
          has_relationship_context: hasRelationshipContext,
          has_continuity_pack: hasContinuityPack,
        },
        '[Staging] Missing expected telemetry fields'
      );
      return false;
    }

    return true;
  }

  /**
   * Is staging validation mode enabled?
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
export const stagingTelemetry = new StagingTelemetry();
