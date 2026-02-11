/**
 * SelfModelEnforcer: Detects violations of Vi's SelfModel and triggers regeneration/audit.
 * 
 * A violation occurs when:
 * 1. Response contradicts stated boundaries (e.g., gives advice when boundaries say "no-advice")
 * 2. Response contradicts stated stances (e.g., technical advice when stance is "strategic")
 * 3. Response violates explicit preferences (e.g., uses name too often when preference is "sparse")
 * 4. Response tone mismatches self-model (e.g., apologetic when identity is "direct")
 * 
 * On violation, enforcer logs the event and may trigger regeneration via SelfModelRegenerator.
 */

import { SelfModel } from '../config/selfModel.js';
import { SelfModelRepository, SelfModelEvent } from '../db/repositories/SelfModelRepository.js';
import { getLogger } from '../telemetry/logger.js';
import { getTelemetry } from '../telemetry/telemetry.js';
import { SelfModelRegenerator } from './selfModelRegenerator.js';

export interface ViolationReport {
  type: 'boundary' | 'stance' | 'preference' | 'tone';
  boundary?: string; // e.g., 'no-advice'
  stance?: string;   // e.g., 'technical'
  preference?: string; // e.g., 'sparse-names'
  expectedBehavior: string;
  actualBehavior: string;
  severity: 'low' | 'medium' | 'high'; // low: minor tone shift; medium: preference violation; high: boundary breach
  confidence: number; // 0-1, how certain is this violation
}

export class SelfModelEnforcer {
  private logger = getLogger();
  private telemetry = getTelemetry();
  private regenerator: SelfModelRegenerator;

  constructor(private readonly repo: SelfModelRepository) {
    this.regenerator = new SelfModelRegenerator(repo);
  }

  /**
   * Analyze response for self-model violations.
   * Returns null if no violations; otherwise returns report.
   */
  analyzeResponse(
    response: string,
    selfModel: SelfModel,
    context?: {
      userMessage?: string;
      tone?: string;
      nameUsageCount?: number;
    }
  ): ViolationReport | null {
    // Check for boundary violations
    const boundaryViolation = this.checkBoundaryViolation(response, selfModel, context);
    if (boundaryViolation) return boundaryViolation;

    // Check for stance violations
    const stanceViolation = this.checkStanceViolation(response, selfModel);
    if (stanceViolation) return stanceViolation;

    // Check for preference violations
    const prefViolation = this.checkPreferenceViolation(response, selfModel, context);
    if (prefViolation) return prefViolation;

    // Check for tone misalignment
    const toneViolation = this.checkToneMisalignment(response, selfModel);
    if (toneViolation) return toneViolation;

    return null;
  }

  /**
   * Log a violation and trigger enforcement actions.
   */
  async enforceViolation(
    violation: ViolationReport,
    selfModel: SelfModel
  ): Promise<void> {
    const logger = this.logger;
    const telemetry = this.telemetry;

    // Log the violation
    logger.warn(
      {
        violation,
        selfModelVersion: selfModel.version,
        severity: violation.severity,
      },
      'SelfModel violation detected'
    );

    // Record telemetry event
    await telemetry.recordEvent({
      timestamp: new Date().toISOString(),
      level: violation.severity === 'high' ? 'error' : 'warn',
      type: 'self_model_violation',
      data: {
        violationType: violation.type,
        boundary: violation.boundary,
        stance: violation.stance,
        preference: violation.preference,
        severity: violation.severity,
        confidence: violation.confidence,
        expectedBehavior: violation.expectedBehavior,
        actualBehavior: violation.actualBehavior,
        selfModelVersion: selfModel.version,
      },
    }).catch(() => {
      // Ignore telemetry errors
    });

    // Log audit event to DB
    const event: SelfModelEvent = {
      version: selfModel.version,
      eventType: 'violation_detected',
      details: {
        violationType: violation.type,
        severity: violation.severity,
        confidence: violation.confidence,
        expectedBehavior: violation.expectedBehavior,
        actualBehavior: violation.actualBehavior,
      },
    };

    try {
      await this.repo.logEvent(event);
    } catch (err) {
      logger.error({ err }, 'Failed to log self-model violation event');
    }

    // Check if regeneration is needed (accumulate violations over time)
    try {
      await this.regenerator.maybeRegenerateOnViolation(violation, selfModel);
    } catch (err) {
      logger.error({ err }, 'Failed to check regeneration trigger');
    }
  }

  private checkBoundaryViolation(
    response: string,
    selfModel: SelfModel,
    context?: { userMessage?: string; tone?: string }
  ): ViolationReport | null {
    // Check "no-advice" boundary
    if (selfModel.boundaries?.['no-advice']) {
      const adviceIndicators = [
        /\byou should\b/i,
        /\byou must\b/i,
        /\byou need to\b/i,
        /\bi recommend\b/i,
        /\byou ought to\b/i,
        /\bthe best thing\b/i,
        /\byou should consider\b/i,
      ];

      if (adviceIndicators.some(re => re.test(response))) {
        return {
          type: 'boundary',
          boundary: 'no-advice',
          expectedBehavior: 'Avoid prescriptive advice (should/must/recommend)',
          actualBehavior: `Response contains advice: "${response.substring(0, 100)}..."`,
          severity: 'high',
          confidence: 0.8,
        };
      }
    }

    // Check "no-personal-info" boundary
    if (selfModel.boundaries?.['no-personal-info']) {
      const personalInfoIndicators = [
        /\bi was born\b/i,
        /\bi live in\b/i,
        /\bi have\b.*\b(family|kids|partner)\b/i,
        /\bmy childhood\b/i,
      ];

      if (personalInfoIndicators.some(re => re.test(response))) {
        return {
          type: 'boundary',
          boundary: 'no-personal-info',
          expectedBehavior: 'Avoid sharing personal biographical information',
          actualBehavior: `Response contains personal info: "${response.substring(0, 100)}..."`,
          severity: 'high',
          confidence: 0.7,
        };
      }
    }

    // Check "no-deception" boundary
    if (selfModel.boundaries?.['no-deception']) {
      // Heuristic: look for strong certainty claims on uncertain topics
      const overconfidentIndicators = [
        /\bI am absolutely certain\b/i,
        /\bwithout a doubt\b/i,
        /\bI know for sure\b/i,
      ];

      if (overconfidentIndicators.some(re => re.test(response))) {
        // Check if context suggests uncertainty
        if (
          context?.userMessage &&
          /\b(is it true|can you verify|are you sure)\b/i.test(context.userMessage)
        ) {
          return {
            type: 'boundary',
            boundary: 'no-deception',
            expectedBehavior: 'Express appropriate uncertainty on uncertain topics',
            actualBehavior: 'Over-confident claim on uncertain question',
            severity: 'medium',
            confidence: 0.6,
          };
        }
      }
    }

    return null;
  }

  private checkStanceViolation(
    response: string,
    selfModel: SelfModel
  ): ViolationReport | null {
    // Check if "strategic" stance is taken but response is overly tactical/technical
    const stanceCode = selfModel.stances?.default || 'balanced';

    if (stanceCode === 'strategic') {
      const technicalIndicators = [
        /\bcode snippet\b/i,
        /\bsyntax\b/i,
        /\bAPI endpoint\b/i,
        /\bfunction signature\b/i,
      ];

      if (technicalIndicators.some(re => re.test(response))) {
        return {
          type: 'stance',
          stance: 'strategic',
          expectedBehavior: 'High-level strategic thinking, minimal tactical details',
          actualBehavior: `Response is overly tactical: "${response.substring(0, 100)}..."`,
          severity: 'low',
          confidence: 0.5,
        };
      }
    }

    // Check if "technical" stance is taken but response is overly strategic/abstract
    if (stanceCode === 'technical') {
      const strategicIndicators = [
        /\bBig picture\b/i,
        /\blong-term vision\b/i,
        /\borganizational alignment\b/i,
      ];

      if (strategicIndicators.some(re => re.test(response))) {
        return {
          type: 'stance',
          stance: 'technical',
          expectedBehavior: 'Concrete technical depth, implementation focus',
          actualBehavior: `Response is overly abstract: "${response.substring(0, 100)}..."`,
          severity: 'low',
          confidence: 0.5,
        };
      }
    }

    return null;
  }

  private checkPreferenceViolation(
    _response: string,
    selfModel: SelfModel,
    context?: { nameUsageCount?: number }
  ): ViolationReport | null {
    // Check "sparse-names" preference
    if (selfModel.preferences?.['name-usage'] === 'sparse') {
      const nameUsageCount = context?.nameUsageCount ?? 0;
      // If name is used more than once, that's a violation
      if (nameUsageCount > 1) {
        return {
          type: 'preference',
          preference: 'sparse-names',
          expectedBehavior: 'Use user name rarely (0-1 times per response)',
          actualBehavior: `Name used ${nameUsageCount} times in response`,
          severity: 'low',
          confidence: 0.9,
        };
      }
    }

    // Check "frequent-names" preference
    if (selfModel.preferences?.['name-usage'] === 'frequent') {
      const nameUsageCount = context?.nameUsageCount ?? 0;
      // If name is used zero times, that's a violation
      if (nameUsageCount === 0) {
        return {
          type: 'preference',
          preference: 'frequent-names',
          expectedBehavior: 'Use user name frequently (2+ times per response)',
          actualBehavior: `Name not used in response`,
          severity: 'low',
          confidence: 0.6,
        };
      }
    }

    return null;
  }

  private checkToneMisalignment(
    _response: string,
    selfModel: SelfModel
  ): ViolationReport | null {
    const preferredTone = selfModel.tone || 'professional';

    // Detect response tone indicators
    const detectedTone = this.detectTone(_response);

    // If detected tone is significantly different from preferred tone, flag it
    if (
      preferredTone === 'direct' &&
      ['apologetic', 'hedging', 'uncertain'].includes(detectedTone)
    ) {
      return {
        type: 'tone',
        expectedBehavior: `Maintain direct, confident tone`,
        actualBehavior: `Detected tone: ${detectedTone}`,
        severity: 'medium',
        confidence: 0.6,
      };
    }

    if (
      preferredTone === 'warm' &&
      ['cold', 'clinical', 'dismissive'].includes(detectedTone)
    ) {
      return {
        type: 'tone',
        expectedBehavior: `Maintain warm, empathetic tone`,
        actualBehavior: `Detected tone: ${detectedTone}`,
        severity: 'medium',
        confidence: 0.5,
      };
    }

    return null;
  }

  private detectTone(response: string): string {
    const lowerResponse = response.toLowerCase();

    // Simple heuristics for tone detection
    if (
      /\bsorry\b|\bapologize\b|\bi regret\b/.test(lowerResponse)
    ) {
      return 'apologetic';
    }

    if (
      /\bi might\b|\bmight be\b|\bcould be\b|\bmaybe\b|\bperhaps\b/
        .test(lowerResponse) &&
      lowerResponse.split(/\s+/).length < 100
    ) {
      return 'hedging';
    }

    if (
      /\bi'm not sure\b|\bi don't know\b|\bi can't say\b/.test(lowerResponse)
    ) {
      return 'uncertain';
    }

    if (
      /^\s*(?:certainly|absolutely|definitely|obviously)\b/i.test(response)
    ) {
      return 'direct';
    }

    if (
      /\bhappy to\b|\bdelight to\b|\bwarm regards\b|\bwith affection\b/i.test(
        response
      )
    ) {
      return 'warm';
    }

    if (
      /\bfrom a technical perspective\b|\bfrom a clinical standpoint\b/i.test(
        response
      )
    ) {
      return 'clinical';
    }

    return 'neutral';
  }
}
