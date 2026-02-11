/**
 * BondModel: Tracks relational state between Vi and each user.
 * 
 * Core dimensions:
 * - Trust: consistency/honesty (0-1)
 * - Familiarity: interaction count and time span
 * - Rapport: positive/negative tone accumulation (-1 to +1)
 * - Commitment: promises made/kept
 * 
 * Influences:
 * - Stance selection (closer bonds → more direct)
 * - Name usage frequency (closer bonds → sparser)
 * - Relational asymmetry (strong bonds → more personal)
 */

import { getTelemetry } from '../telemetry/telemetry.js';

export interface BondModel {
  userId: string;
  trust: number; // 0-1, based on consistency/honesty
  familiarity: number; // 0-1, derived from interaction count and time span
  rapport: number; // -1 to +1, positive/negative tone accumulation
  commitmentsMade: number; // count of promises
  commitmentsKept: number; // count of fulfilled promises
  interactionCount: number;
  firstInteraction: string; // ISO timestamp
  lastInteraction: string; // ISO timestamp
  decayFactor: number; // 0-1, how much bonds weaken per day without interaction
  updatedAt: string;
  version: number;
}

export interface BondUpdateSignals {
  relationalProbe?: boolean; // user asked relational question
  consistentBehavior?: boolean; // Vi remained consistent with self-model
  positiveAffect?: boolean; // user expressed positive sentiment
  negativeAffect?: boolean; // user expressed negative sentiment
  promiseMade?: boolean; // Vi made a commitment
  promiseKept?: boolean; // Vi fulfilled a commitment
  userMessage?: string; // for sentiment analysis
}

/**
 * Default bond for new users (neutral starting state)
 */
export function defaultBond(userId: string): BondModel {
  return {
    userId,
    trust: 0.5, // neutral starting trust
    familiarity: 0.0, // no familiarity yet
    rapport: 0.0, // neutral rapport
    commitmentsMade: 0,
    commitmentsKept: 0,
    interactionCount: 0,
    firstInteraction: new Date().toISOString(),
    lastInteraction: new Date().toISOString(),
    decayFactor: 0.98, // slight decay per day
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Apply decay to bond metrics based on time since last interaction.
 * Bonds weaken if not maintained.
 */
export function applyBondDecay(bond: BondModel, referenceTime: Date = new Date()): BondModel {
  const lastInteractionDate = new Date(bond.lastInteraction);
  const daysSinceInteraction = (referenceTime.getTime() - lastInteractionDate.getTime()) / (1000 * 60 * 60 * 24);

  // Trust decays toward neutral (0.5)
  const trustDecay = Math.pow(bond.decayFactor, daysSinceInteraction);
  const decayedTrust = bond.trust + (0.5 - bond.trust) * (1 - trustDecay);

  // Familiarity decays toward zero
  const decayedFamiliarity = bond.familiarity * Math.pow(bond.decayFactor, daysSinceInteraction);

  // Rapport decays toward neutral (0.0)
  const decayedRapport = bond.rapport * Math.pow(bond.decayFactor, daysSinceInteraction);

  return {
    ...bond,
    trust: Math.max(0, Math.min(1, decayedTrust)),
    familiarity: Math.max(0, Math.min(1, decayedFamiliarity)),
    rapport: Math.max(-1, Math.min(1, decayedRapport)),
  };
}

/**
 * Update bond based on interaction signals.
 * Returns updated bond and audit entry.
 */
export async function updateBond(
  bond: BondModel,
  signals: BondUpdateSignals
): Promise<{ bond: BondModel; auditEntry: BondAuditEntry }> {
  const updated = { ...bond };
  const now = new Date().toISOString();
  const changes: string[] = [];

  // Increment interaction count
  updated.interactionCount += 1;
  updated.lastInteraction = now;

  // Update familiarity based on interaction count and time span
  const daysSinceFirst = (new Date(now).getTime() - new Date(updated.firstInteraction).getTime()) / (1000 * 60 * 60 * 24);
  const timeSpanFactor = Math.min(1, daysSinceFirst / 30); // max familiarity after 30 days
  const interactionFactor = Math.min(1, updated.interactionCount / 20); // max after 20 interactions
  const oldFamiliarity = updated.familiarity;
  updated.familiarity = Math.min(1, (timeSpanFactor + interactionFactor) / 2);
  if (Math.abs(updated.familiarity - oldFamiliarity) > 0.05) {
    changes.push(`familiarity: ${oldFamiliarity.toFixed(2)} → ${updated.familiarity.toFixed(2)}`);
  }

  // Update trust based on consistency
  if (signals.consistentBehavior) {
    const oldTrust = updated.trust;
    updated.trust = Math.min(1, updated.trust + 0.05);
    if (updated.trust !== oldTrust) {
      changes.push(`trust: ${oldTrust.toFixed(2)} → ${updated.trust.toFixed(2)} (consistent)`);
    }
  }

  // Update rapport based on sentiment
  if (signals.positiveAffect) {
    const oldRapport = updated.rapport;
    updated.rapport = Math.min(1, updated.rapport + 0.1);
    changes.push(`rapport: ${oldRapport.toFixed(2)} → ${updated.rapport.toFixed(2)} (positive)`);
  }
  if (signals.negativeAffect) {
    const oldRapport = updated.rapport;
    updated.rapport = Math.max(-1, updated.rapport - 0.1);
    changes.push(`rapport: ${oldRapport.toFixed(2)} → ${updated.rapport.toFixed(2)} (negative)`);
  }

  // Track commitments
  if (signals.promiseMade) {
    updated.commitmentsMade += 1;
    changes.push(`commitment_made: total ${updated.commitmentsMade}`);
  }
  if (signals.promiseKept) {
    updated.commitmentsKept += 1;
    const oldTrust = updated.trust;
    updated.trust = Math.min(1, updated.trust + 0.15); // keeping promises builds trust
    changes.push(`commitment_kept: total ${updated.commitmentsKept}, trust: ${oldTrust.toFixed(2)} → ${updated.trust.toFixed(2)}`);
  }

  // Boost trust and rapport on relational probes (user showing interest)
  if (signals.relationalProbe) {
    const oldTrust = updated.trust;
    const oldRapport = updated.rapport;
    updated.trust = Math.min(1, updated.trust + 0.03);
    updated.rapport = Math.min(1, updated.rapport + 0.05);
    changes.push(`relational_probe: trust ${oldTrust.toFixed(2)} → ${updated.trust.toFixed(2)}, rapport ${oldRapport.toFixed(2)} → ${updated.rapport.toFixed(2)}`);
  }

  updated.updatedAt = now;
  updated.version += 1;

  const auditEntry: BondAuditEntry = {
    userId: updated.userId,
    timestamp: now,
    changes: changes.join('; '),
    trust: updated.trust,
    familiarity: updated.familiarity,
    rapport: updated.rapport,
    version: updated.version,
  };

  // Emit telemetry if significant change
  if (changes.length > 0) {
    await getTelemetry().recordEvent({
      timestamp: now,
      level: 'info',
      type: 'bond_updated',
      data: {
        userId: updated.userId,
        changes,
        trust: updated.trust,
        familiarity: updated.familiarity,
        rapport: updated.rapport,
        version: updated.version,
      },
    }).catch(() => {
      // Ignore telemetry errors
    });
  }

  return { bond: updated, auditEntry };
}

/**
 * Detect bond update signals from context.
 */
export function detectBondSignals(
  userMessage: string,
  context?: {
    selfModelViolation?: boolean;
    recentHistory?: string[];
  }
): BondUpdateSignals {
  const signals: BondUpdateSignals = { userMessage };
  const lowerMessage = userMessage.toLowerCase();

  // Relational probes
  const relationalTriggers = [
    'who am i to you',
    'who are you to me',
    'do you like me',
    'are you proud of me',
    'do you care',
    'what do you think of me',
  ];
  if (relationalTriggers.some(t => lowerMessage.includes(t))) {
    signals.relationalProbe = true;
  }

  // Positive affect
  const positiveTriggers = ['thank you', 'thanks', 'appreciate', 'helpful', 'great', 'love', 'perfect'];
  if (positiveTriggers.some(t => lowerMessage.includes(t))) {
    signals.positiveAffect = true;
  }

  // Negative affect
  const negativeTriggers = ['frustrated', 'annoyed', 'unhelpful', 'useless', 'disappointed', 'bad'];
  if (negativeTriggers.some(t => lowerMessage.includes(t))) {
    signals.negativeAffect = true;
  }

  // Promise detection (Vi made a commitment in recent history)
  if (context?.recentHistory) {
    const historyText = context.recentHistory.join(' ').toLowerCase();
    if (historyText.includes('vi: i will') || historyText.includes('vi: i promise')) {
      signals.promiseMade = true;
    }
  }

  // Consistency signal (no self-model violation)
  if (context && context.selfModelViolation === false) {
    signals.consistentBehavior = true;
  }

  return signals;
}

/**
 * Influence stance selection based on bond strength.
 */
export function bondInfluencedStance(bond: BondModel, baseStance: string): string {
  // High trust + familiarity → more direct/assertive
  const bondStrength = (bond.trust + bond.familiarity + Math.max(0, bond.rapport)) / 3;

  if (bondStrength > 0.7) {
    // Strong bond: lean direct/assertive
    if (baseStance === 'reflective' || baseStance === 'neutral') {
      return 'assertive';
    }
  } else if (bondStrength < 0.3) {
    // Weak bond: lean reflective/cautious
    if (baseStance === 'assertive' || baseStance === 'taskful') {
      return 'reflective';
    }
  }

  return baseStance; // default to base
}

export interface BondAuditEntry {
  userId: string;
  timestamp: string;
  changes: string;
  trust: number;
  familiarity: number;
  rapport: number;
  version: number;
}
