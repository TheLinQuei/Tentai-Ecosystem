/**
 * SelfModelRegenerator: Detects persistent violations and triggers SelfModel refresh.
 * On high-severity violations, regenerates the SelfModel to align with actual behavior.
 */

import { SelfModel, cacheSelfModel } from '../config/selfModel.js';
import OpenAI from 'openai';
import { SelfModelRepository, SelfModelEvent } from '../db/repositories/SelfModelRepository.js';
import { ViolationReport } from './selfModelEnforcer.js';
import { getLogger } from '../telemetry/logger.js';
import { getTelemetry } from '../telemetry/telemetry.js';

export class SelfModelRegenerator {
  private logger = getLogger();
  private telemetry = getTelemetry();
  private violationCounts = new Map<string, { high: number; medium: number; lastReset: number }>();

  constructor(private readonly repo: SelfModelRepository) {}

  /**
   * Track violations and decide if regeneration is needed.
   * Regeneration triggers if:
   * - 3+ high-severity violations in 1 hour
   * - 5+ medium-severity violations in 1 hour
   */
  async maybeRegenerateOnViolation(
    violation: ViolationReport,
    selfModel: SelfModel
  ): Promise<boolean> {
    const key = `${selfModel.version}`;
    const now = Date.now();
    const oneHourMs = 60 * 60 * 1000;

    let counts = this.violationCounts.get(key);
    if (!counts) {
      counts = { high: 0, medium: 0, lastReset: now };
      this.violationCounts.set(key, counts);
    }

    // Reset counts if window expired
    if (now - counts.lastReset > oneHourMs) {
      counts = { high: 0, medium: 0, lastReset: now };
      this.violationCounts.set(key, counts);
    }

    // Increment appropriate counter
    if (violation.severity === 'high') {
      counts.high += 1;
    } else if (violation.severity === 'medium') {
      counts.medium += 1;
    }

    // Check regeneration thresholds
    const shouldRegenerate = counts.high >= 3 || counts.medium >= 5;

    if (shouldRegenerate) {
      this.logger.info(
        { violation, counts, selfModelVersion: selfModel.version },
        'Regeneration threshold reached for SelfModel'
      );

      await this.regenerateSelfModel(selfModel, violation, counts);
      return true;
    }

    return false;
  }

  /**
   * Regenerate (adjust) SelfModel to reflect actual behavior.
   * For now: log the regeneration; in production, could call LLM to refine boundaries/stances.
   */
  private async regenerateSelfModel(
    selfModel: SelfModel,
    triggeringViolation: ViolationReport,
    violationCounts: { high: number; medium: number; lastReset: number }
  ): Promise<void> {
    this.logger.warn(
      { selfModelVersion: selfModel.version, violationCounts, triggeringViolation },
      'Regenerating SelfModel due to persistent violations'
    );

    // Log regeneration event to audit trail
    const regenerationEvent: SelfModelEvent = {
      version: selfModel.version,
      eventType: 'regeneration_triggered',
      details: {
        reason: `${violationCounts.high} high-severity violations (threshold: 3) or ${violationCounts.medium} medium-severity violations (threshold: 5)`,
        triggeringViolation: {
          type: triggeringViolation.type,
          severity: triggeringViolation.severity,
          confidence: triggeringViolation.confidence,
        },
        timestamp: new Date().toISOString(),
      },
    };

    try {
      await this.repo.logEvent(regenerationEvent);
    } catch (err) {
      this.logger.error({ err }, 'Failed to log regeneration event');
    }

    // Emit telemetry
    await this.telemetry.recordEvent({
      timestamp: new Date().toISOString(),
      level: 'warn',
      type: 'self_model_regeneration_triggered',
      data: {
        selfModelVersion: selfModel.version,
        violationCounts,
        triggeringViolationType: triggeringViolation.type,
        triggeringViolationSeverity: triggeringViolation.severity,
      },
    }).catch(() => {
      // Ignore telemetry errors
    });

    // Compute a new adjusted SelfModel version and activate it
    const adjusted: SelfModel = this.adjustSelfModel(selfModel, triggeringViolation);
    const refined: SelfModel = await this.refineSelfModelWithLLM(adjusted, triggeringViolation).catch(() => adjusted);

    try {
      await this.repo.upsert(refined);
      cacheSelfModel(refined);
      await this.repo.logEvent({
        version: refined.version,
        eventType: 'regeneration_applied',
        details: {
          fromVersion: selfModel.version,
          reason: triggeringViolation.type,
          timestamp: new Date().toISOString(),
        },
      });
      // Reset counters for new active version
      this.violationCounts.set(refined.version, { high: 0, medium: 0, lastReset: Date.now() });
    } catch (err) {
      this.logger.error({ err }, 'Failed to activate regenerated SelfModel');
    }
  }

  /**
   * Create a minimally adjusted SelfModel and new version id.
   */
  private adjustSelfModel(selfModel: SelfModel, violation: ViolationReport): SelfModel {
    const newVersion = `${selfModel.version}-regen-${new Date().toISOString()}`;
    const copy: SelfModel = {
      ...selfModel,
      version: newVersion,
      stances: { ...selfModel.stances },
      preferences: { ...selfModel.preferences },
      boundaries: { ...selfModel.boundaries },
    };

    // Heuristic adjustments
    if (violation.type === 'boundary' && violation.boundary === 'no-advice') {
      copy.boundaries['no-advice'] = 'strict';
    }
    if (violation.type === 'stance') {
      // If strategic kept failing, lean technical; otherwise lean strategic
      const current = copy.stances.default ?? 'balanced';
      copy.stances.default = current === 'strategic' ? 'technical' : 'strategic';
    }
    if (violation.type === 'tone') {
      // Normalize tone to neutral on repeated mismatches
      copy.tone = 'neutral';
    }
    if (violation.type === 'preference' && violation.preference) {
      copy.preferences[violation.preference] = 'reinforced';
    }

    return copy;
  }

  /**
   * Optional: Use LLM to refine the adjusted SelfModel.
   * Falls back to heuristic copy if no API key or error.
   */
  private async refineSelfModelWithLLM(selfModel: SelfModel, violation: ViolationReport): Promise<SelfModel> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || process.env.OPENAI_KEY;
    if (!apiKey) {
      return selfModel; // No LLM available; keep heuristic
    }

    const client = new OpenAI({ apiKey });
    const systemPrompt = `You are refining Vi's SelfModel. Update fields to better enforce boundaries/stances/preferences.
Return JSON with the same structure. Only adjust minimally and include a new version string.`;
    const userPrompt = `Current model:\n${JSON.stringify(selfModel, null, 2)}\n\nLatest violation:\n${JSON.stringify(violation, null, 2)}\n\nProduce updated JSON.`;

    try {
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content;
      if (!content) return selfModel;
      const parsed = JSON.parse(content);
      // Ensure mandatory keys exist
      return {
        version: parsed.version || `${selfModel.version}-llm-${Date.now()}`,
        name: parsed.name || selfModel.name,
        identity: parsed.identity || selfModel.identity,
        purpose: parsed.purpose || selfModel.purpose,
        tone: parsed.tone ?? selfModel.tone,
        stances: parsed.stances || selfModel.stances,
        preferences: parsed.preferences || selfModel.preferences,
        boundaries: parsed.boundaries || selfModel.boundaries,
      };
    } catch (err) {
      this.logger.warn({ err }, 'LLM refinement failed; using heuristic');
      return selfModel;
    }
  }
}
