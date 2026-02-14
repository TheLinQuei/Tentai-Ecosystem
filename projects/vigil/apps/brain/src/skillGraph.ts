import type { FastifyInstance } from 'fastify';
import type {
  SkillNode,
  SkillStats,
  SkillSearchResult,
  SkillPromotionCriteria,
  SkillDecayCriteria,
} from '@vi/sdk';
import { prepareLog } from './utils/logContract.js';

/**
 * Skill Graph — Procedural Memory System
 * 
 * Detects repeated successful plans, promotes them to reusable skills,
 * and replays them when similar intents are detected.
 * 
 * Architecture:
 * - Brain tracks execution history (in-memory circular buffer)
 * - Successful patterns are promoted to Memory API as skills
 * - Before LLM planning, Brain checks for existing skills via vector search
 * - Skills decay if they fail or go unused
 */

interface ExecutionHistory {
  intent: string;
  actions: Array<{ tool: string; input: Record<string, any> }>;
  success: boolean;
  latencyMs: number;
  timestamp: string;
  contextHash: string;
}

interface SkillCandidate {
  intent: string;
  pattern: string;
  actions: Array<{ tool: string; input: Record<string, any> }>;
  successStreak: number;
  totalExecutions: number;
  successCount: number;
}

export class SkillGraph {
  private history: ExecutionHistory[] = [];
  private candidates: Map<string, SkillCandidate> = new Map();
  private memoryClient: any; // @vi/sdk MemoryClient
  private log: FastifyInstance['log'];

  // Configurable criteria
  private promotionCriteria: SkillPromotionCriteria = {
    minSuccessStreak: 3,
    minSuccessRate: 0.8,
    minExecutions: 3,
    // Similarity threshold is configurable via env, default 0.8; can be lowered in dev for testing
    similarityThreshold: (() => {
      const v = parseFloat(process.env.SKILL_SIMILARITY_THRESHOLD || '');
      return Number.isFinite(v) ? v : 0.8;
    })(),
  };

  private decayCriteria: SkillDecayCriteria = {
    maxFailureStreak: 2,
    minSuccessRate: 0.5,
    unusedThresholdDays: 30,
    preferredSuccessRate: 0.9,
  };

  constructor(memoryClient: any, log: FastifyInstance['log']) {
    this.memoryClient = memoryClient;
    this.log = log;
    this.log.info(prepareLog('SkillGraph', {
      message: '🧩 Skill Graph initialized'
    }));
  }

  /**
   * Record execution result for promotion/decay tracking
   */
  async recordExecution(record: {
    intent: string;
    actions: Array<{ tool: string; input: Record<string, any> }>;
    success: boolean;
    latencyMs: number;
    contextHash?: string;
  }): Promise<void> {
    const timestamp = new Date().toISOString();
    const contextHash = record.contextHash || this.hashContext(record.intent, record.actions);

    // Add to history
    this.history.push({
      intent: record.intent,
      actions: record.actions,
      success: record.success,
      latencyMs: record.latencyMs,
      timestamp,
      contextHash,
    });

    // Keep history bounded (last 1000 executions)
    if (this.history.length > 1000) {
      this.history.shift();
    }

    // Update candidate tracking
    await this.updateCandidate(contextHash, record);

    // Check for promotion opportunity
    const candidate = this.candidates.get(contextHash);
    if (candidate && this.shouldPromote(candidate)) {
      // Log richer detail prior to attempting promotion for debugging ISSUE-002
      this.log.info(prepareLog('SkillGraph', {
        intent: candidate.intent,
        pattern: candidate.pattern,
        successStreak: candidate.successStreak,
        totalExecutions: candidate.totalExecutions,
        successRate: candidate.successCount / candidate.totalExecutions,
        message: 'Promotion criteria met – attempting promotion'
      }));
      await this.promoteToSkill(candidate);
    }

    this.log.debug(prepareLog('SkillGraph', {
      contextHash,
      success: record.success,
      intent: record.intent,
      latencyMs: record.latencyMs,
      message: 'Execution recorded'
    }));
  }

  /**
   * Find existing skills similar to the given intent
   */
  async findSimilarSkills(intent: string, limit = 5): Promise<SkillSearchResult[]> {
    try {
      // Query Memory API for skills via vector search
      const response = await fetch(`${this.memoryClient.baseUrl}/v1/skills/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: intent, limit }),
      });

      if (!response.ok) {
        this.log.warn(prepareLog('SkillGraph', {
          status: response.status,
          message: 'Skill search failed'
        }));
        return [];
      }

      const results = (await response.json()) as SkillSearchResult[];

      // Filter by similarity threshold
      return results.filter(r => r.similarity >= this.promotionCriteria.similarityThreshold);
    } catch (error) {
      this.log.error(prepareLog('SkillGraph', {
        error,
        intent,
        message: 'Error searching for skills'
      }));
      return [];
    }
  }

  /**
   * Check if a skill should be used instead of LLM planning
   */
  async shouldUseSkill(intent: string): Promise<SkillSearchResult | null> {
    const skills = await this.findSimilarSkills(intent, 1);
    
    if (skills.length === 0) {
      return null;
    }

    const topSkill = skills[0];

    // Validate skill structure (corrupted skills with null/missing actions should be rejected)
    if (!topSkill.skill || !Array.isArray(topSkill.skill.actions) || topSkill.skill.actions.length === 0) {
      this.log.warn(prepareLog('SkillGraph', {
        skillId: topSkill.skill?.id || 'unknown',
        message: 'Skill found but has invalid or missing actions array, rejecting'
      }));
      return null;
    }

    // Temporary: Prefer LLM for weather until first-class weather tool/skill is established
    try {
      const pat = (topSkill as any)?.skill?.pattern?.toLowerCase?.() || '';
      if (pat.includes('weather')) {
        this.log.info(prepareLog('SkillGraph', {
          skillId: topSkill.skill.id,
          message: 'Skill match skipped for weather to prefer tool-based response'
        }));
        return null;
      }
    } catch {}

    // Check status and success rate
    if (topSkill.stats.status === 'archived' || topSkill.stats.status === 'demoted') {
      this.log.debug(prepareLog('SkillGraph', {
        skillId: topSkill.skill.id,
        status: topSkill.stats.status,
        message: 'Skill found but status prevents use'
      }));
      return null;
    }

    if (topSkill.stats.successRate < this.decayCriteria.minSuccessRate) {
      this.log.debug(prepareLog('SkillGraph', {
        skillId: topSkill.skill.id,
        successRate: topSkill.stats.successRate,
        message: 'Skill found but success rate too low'
      }));
      return null;
    }

    // Additional guard: require loose keyword overlap with skill.pattern when available
    try {
      const intentLc = intent.toLowerCase();
      const pattern: string | undefined = (topSkill as any).skill?.pattern;
      if (pattern && typeof pattern === 'string') {
        const tokens = pattern.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const hasOverlap = tokens.some(t => intentLc.includes(t));
        if (!hasOverlap) {
          this.log.debug(prepareLog('SkillGraph', {
            skillId: topSkill.skill.id,
            pattern,
            intent,
            message: 'Skill match skipped: no keyword overlap with intent'
          }));
          return null;
        }
      }
    } catch {}

    this.log.info(prepareLog('SkillGraph', {
      skillId: topSkill.skill.id,
      similarity: topSkill.similarity,
      successRate: topSkill.stats.successRate,
      message: 'Skill match found'
    }));
    return topSkill;
  }

  /**
   * Promote a candidate plan to a reusable skill
   */
  private async promoteToSkill(candidate: SkillCandidate): Promise<void> {
    try {
      const skillId = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const skill: Omit<SkillNode, 'embedding'> = {
        id: skillId,
        intent: candidate.intent,
        pattern: candidate.pattern,
        actions: candidate.actions,
        inputs: this.extractInputs(candidate.actions),
        outputs: this.extractOutputs(candidate.actions),
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        metadata: {
          promotedAfter: candidate.totalExecutions,
          successStreak: candidate.successStreak,
        },
      };

      // Send to Memory API for storage + embedding
      const response = await fetch(`${this.memoryClient.baseUrl}/v1/skills/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill }),
      });

      if (!response.ok) {
        let bodyText: string | undefined;
        try { bodyText = await response.text(); } catch { bodyText = '<unavailable>'; }
        throw new Error(`Skill promotion failed: status=${response.status} body=${(bodyText || '').slice(0,200)}`);
      }

      // Remove from candidates (now a skill)
      this.candidates.delete(candidate.pattern);

      this.log.info(prepareLog('SkillGraph', {
        skillId,
        intent: candidate.intent,
        successStreak: candidate.successStreak,
        successRate: candidate.successCount / candidate.totalExecutions,
        message: '🎓 Plan promoted to skill'
      }));
    } catch (error) {
      // Ensure we always log a meaningful error payload (BUG: empty error objects previously)
      let serializedError: Record<string, any> = {};
      if (error instanceof Error) {
        serializedError = { name: error.name, message: error.message, stack: error.stack };
      } else if (error) {
        serializedError = { value: error };
      } else {
        serializedError = { message: 'Unknown error (falsy error value)' };
      }
      this.log.error(prepareLog('SkillGraph', {
        error: serializedError,
        candidate,
        message: 'Failed to promote skill'
      }));
    }
  }

  /**
   * Update candidate tracking for promotion eligibility
   */
  private async updateCandidate(
    contextHash: string,
    record: { intent: string; actions: any[]; success: boolean }
  ): Promise<void> {
    let candidate = this.candidates.get(contextHash);

    if (!candidate) {
      candidate = {
        intent: record.intent,
        pattern: contextHash,
        actions: record.actions,
        successStreak: 0,
        totalExecutions: 0,
        successCount: 0,
      };
      this.candidates.set(contextHash, candidate);
    }

    candidate.totalExecutions++;

    if (record.success) {
      candidate.successCount++;
      candidate.successStreak++;
    } else {
      candidate.successStreak = 0; // Reset streak on failure
    }
  }

  /**
   * Determine if a candidate should be promoted
   */
  private shouldPromote(candidate: SkillCandidate): boolean {
    const { minSuccessStreak, minSuccessRate, minExecutions } = this.promotionCriteria;

    if (candidate.totalExecutions < minExecutions) {
      return false;
    }

    if (candidate.successStreak < minSuccessStreak) {
      return false;
    }

    const successRate = candidate.successCount / candidate.totalExecutions;
    if (successRate < minSuccessRate) {
      return false;
    }

    return true;
  }

  /**
   * Decay or demote skills based on failure rate or inactivity
   */
  async decaySkills(): Promise<void> {
    try {
      // Get all active skills from Memory API
      const response = await fetch(`${this.memoryClient.baseUrl}/v1/skills?status=active,preferred`, {
        method: 'GET',
      });

      if (!response.ok) {
        this.log.warn(prepareLog('SkillGraph', {
          message: 'Failed to fetch skills for decay check'
        }));
        return;
      }

      const skills = (await response.json()) as Array<{ skill: SkillNode; stats: SkillStats }>;

      for (const { skill, stats } of skills) {
        // Check for demotion conditions
        if (stats.successRate < this.decayCriteria.minSuccessRate) {
          await this.demoteSkill(skill.id, 'low success rate');
          continue;
        }

        // Check for archival (unused > threshold days)
        const daysSinceUse = this.daysSince(skill.lastUsed);
        if (daysSinceUse > this.decayCriteria.unusedThresholdDays) {
          await this.archiveSkill(skill.id, `unused for ${daysSinceUse} days`);
          continue;
        }

        // Check for promotion to preferred
        if (stats.successRate >= this.decayCriteria.preferredSuccessRate && stats.status === 'active') {
          await this.markPreferred(skill.id);
        }
      }
    } catch (error) {
      this.log.error(prepareLog('SkillGraph', {
        error,
        message: 'Error during skill decay'
      }));
    }
  }

  /**
   * Demote a skill to inactive status
   */
  private async demoteSkill(skillId: string, reason: string): Promise<void> {
    try {
      await fetch(`${this.memoryClient.baseUrl}/v1/skills/${skillId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'demoted', reason }),
      });
      this.log.info(prepareLog('SkillGraph', {
        skillId,
        reason,
        message: '⬇️ Skill demoted'
      }));
    } catch (error) {
      this.log.error(prepareLog('SkillGraph', {
        error,
        skillId,
        message: 'Failed to demote skill'
      }));
    }
  }

  /**
   * Archive a skill due to inactivity
   */
  private async archiveSkill(skillId: string, reason: string): Promise<void> {
    try {
      await fetch(`${this.memoryClient.baseUrl}/v1/skills/${skillId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived', reason }),
      });
      this.log.info(prepareLog('SkillGraph', {
        skillId,
        reason,
        message: '📦 Skill archived'
      }));
    } catch (error) {
      this.log.error(prepareLog('SkillGraph', {
        error,
        skillId,
        message: 'Failed to archive skill'
      }));
    }
  }

  /**
   * Mark skill as preferred due to high success rate
   */
  private async markPreferred(skillId: string): Promise<void> {
    try {
      await fetch(`${this.memoryClient.baseUrl}/v1/skills/${skillId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'preferred' }),
      });
      this.log.info(prepareLog('SkillGraph', {
        skillId,
        message: '⭐ Skill marked as preferred'
      }));
    } catch (error) {
      this.log.error(prepareLog('SkillGraph', {
        error,
        skillId,
        message: 'Failed to mark skill as preferred'
      }));
    }
  }

  /**
   * Calculate days since timestamp
   */
  private daysSince(timestamp: string): number {
    const then = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - then.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Extract input parameters from action sequence
   */
  private extractInputs(actions: any[]): string[] {
    const inputs = new Set<string>();
    for (const action of actions) {
      if (action.input) {
        Object.keys(action.input).forEach(key => inputs.add(key));
      }
    }
    return Array.from(inputs);
  }

  /**
   * Extract output artifacts from action sequence
   */
  private extractOutputs(actions: any[]): string[] {
    return actions.map(a => a.tool);
  }

  /**
   * Hash context for deduplication
   */
  private hashContext(intent: string, actions: any[]): string {
    const actionSig = actions.map(a => `${a.tool}:${JSON.stringify(a.input)}`).join('|');
    const combined = `${intent}::${actionSig}`;
    // Simple hash (in production, use crypto)
    return Buffer.from(combined).toString('base64').slice(0, 16);
  }

  /**
   * Get current statistics (for debugging/monitoring)
   */
  getStats() {
    return {
      historySize: this.history.length,
      candidateCount: this.candidates.size,
      promotionCriteria: this.promotionCriteria,
      decayCriteria: this.decayCriteria,
    };
  }
}
