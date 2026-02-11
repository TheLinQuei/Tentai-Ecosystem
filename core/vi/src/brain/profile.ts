export type TonePreference = 'direct' | 'no-assistant' | 'neutral';
export type InferencePreference = 'infer-first' | 'clarify-when-ambiguous';
export type RelationalDepth = 'shallow' | 'building' | 'deepening';
export type StanceBias = 'reflective' | 'assertive' | 'inferential' | 'taskful';

import { ProfileAuditRepository } from '../db/repositories/ProfileAuditRepository.js';
import { ConflictResolver } from './conflictResolver.js';
import { UserProfileSignalRepository } from '../db/repositories/UserProfileSignalRepository.js';
import { SignalMetric, updateSignalMetric } from './signalWeighting.js';
import { getTelemetry } from '../telemetry/telemetry.js';
import { getLogger } from '../telemetry/logger.js';

type NameEvidence = {
  value: string;
  count: number;
  updatedAt: string;
};

export interface UserProfile {
  userId: string;
  name?: string;
  nameEvidence?: NameEvidence;
  tonePreference: TonePreference;
  inferencePreference: InferencePreference;
  relationalDepth: RelationalDepth;
  stanceBias: StanceBias;
  allowAsymmetry: boolean;
  allowImperfection: boolean;
  updatedAt: string;
  version?: number;
  // Phase 2: Relationship Model fields
  relationship_type?: 'owner' | 'trusted' | 'normal' | 'restricted';
  trust_level?: number;
  interaction_mode?: 'assistant' | 'companion' | 'operator' | 'lorekeeper';
  tone_preference?: string;
  voice_profile?: string;
  boundaries_profile?: string;
  // Extended profile attributes used by gateways (optional)
  tier?: string;
  tierFeatures?: Record<string, unknown>;
  bio?: string;
  timezone?: string;
  location?: string;
  occupation?: string;
  interests?: string[];
  communicationStyle?: string;
  topicsOfInterest?: string[];
  boundaries?: Record<string, unknown>;
  profileCompleteness?: number;
  metadata?: Record<string, unknown>;
  lastInteraction?: string;
  accountAge?: number;
}

const profileStore = new Map<string, UserProfile>();

export interface UserProfileStorage {
  getByUserId(userId: string): Promise<UserProfile | null>;
  upsert(profile: UserProfile): Promise<void>;
}

// Optional: audit repository for observability (NOW REQUIRED)
export interface ProfileEnv {
  auditRepo: ProfileAuditRepository; // Mandatory for 77EZ compliance
  signalRepo?: UserProfileSignalRepository; // Optional persistence for signal histories
}

const conflictResolver = new ConflictResolver();

function sanitizeProfile(raw: Partial<UserProfile> | null | undefined, userId: string): UserProfile {
  const base = defaultProfile(userId);
  const safeTone: TonePreference = raw?.tonePreference && ['direct', 'no-assistant', 'neutral'].includes(raw.tonePreference)
    ? raw.tonePreference
    : base.tonePreference;
  const safeInference: InferencePreference = raw?.inferencePreference && ['infer-first', 'clarify-when-ambiguous'].includes(raw.inferencePreference)
    ? raw.inferencePreference
    : base.inferencePreference;
  const safeRelDepth: RelationalDepth = raw?.relationalDepth && ['shallow', 'building', 'deepening'].includes(raw.relationalDepth)
    ? raw.relationalDepth
    : base.relationalDepth;
  const safeBias: StanceBias = raw?.stanceBias && ['reflective', 'assertive', 'inferential', 'taskful'].includes(raw.stanceBias)
    ? raw.stanceBias
    : base.stanceBias;

  return {
    ...base,
    ...raw,
    userId,
    nameEvidence: raw?.nameEvidence && typeof raw.nameEvidence === 'object'
      ? {
          value: typeof raw.nameEvidence.value === 'string' ? raw.nameEvidence.value : base.nameEvidence?.value ?? '',
          count: typeof raw.nameEvidence.count === 'number' ? raw.nameEvidence.count : base.nameEvidence?.count ?? 0,
          updatedAt: typeof raw.nameEvidence.updatedAt === 'string' ? raw.nameEvidence.updatedAt : base.nameEvidence?.updatedAt ?? base.updatedAt,
        }
      : base.nameEvidence,
    tonePreference: safeTone,
    inferencePreference: safeInference,
    relationalDepth: safeRelDepth,
    stanceBias: safeBias,
    allowAsymmetry: raw?.allowAsymmetry ?? base.allowAsymmetry,
    allowImperfection: raw?.allowImperfection ?? base.allowImperfection,
    updatedAt: raw?.updatedAt ?? base.updatedAt,
    version: raw?.version ?? base.version,
  };
}

function defaultProfile(userId: string): UserProfile {
  return {
    userId,
    tonePreference: 'no-assistant',
    inferencePreference: 'infer-first',
    relationalDepth: 'building',
    stanceBias: 'inferential',
    allowAsymmetry: true,
    allowImperfection: true,
    updatedAt: new Date().toISOString(),
    version: 1,
    nameEvidence: undefined,
  };
}

function mergeNameEvidence(existing?: NameEvidence, candidates?: string[]): NameEvidence | undefined {
  if (!candidates || candidates.length === 0) return existing;
  const latest = candidates[candidates.length - 1];
  if (!latest || !/^[A-Za-z]{2,32}$/.test(latest)) return existing;

  const latestLower = latest.toLowerCase();
  const occurrenceCount = candidates.filter((c) => c.toLowerCase() === latestLower).length;
  const now = new Date().toISOString();

  if (!existing) {
    return { value: latest, count: occurrenceCount, updatedAt: now };
  }

  const same = existing.value.toLowerCase() === latestLower;
  if (same) {
    return { value: existing.value, count: existing.count + occurrenceCount, updatedAt: now };
  }

  // Switch only if new name is observed at least twice and existing confidence is low (<2)
  if (occurrenceCount >= 2 && existing.count < 2) {
    return { value: latest, count: occurrenceCount, updatedAt: now };
  }

  return existing;
}

export async function loadOrCreateProfile(
  userId: string,
  storage?: UserProfileStorage
): Promise<UserProfile> {
  const cached = profileStore.get(userId);
  if (cached) return cached;

  if (storage) {
    const persisted = await storage.getByUserId(userId);
    if (persisted) {
      const safe = sanitizeProfile(persisted, userId);
      profileStore.set(userId, safe);
      return safe;
    }
  }

  const created = defaultProfile(userId);
  profileStore.set(userId, created);
  if (storage) {
    await storage.upsert(created);
  }
  return created;
}

export async function updateProfileFromSignals(
  profile: UserProfile,
  signals: {
    personalIdentifiers?: string[];
    recentHistory?: string[];
    immediateContext?: string[];
    currentInput?: string;
  },
  auditRepo: ProfileAuditRepository,
  storage?: UserProfileStorage,
  signalRepo?: UserProfileSignalRepository
): Promise<UserProfile> {
  const updated = sanitizeProfile(profile, profile.userId);

  // Load existing signal records to inform conflict resolution (decay-aware)
  let existingSignals: Record<string, SignalMetric | undefined> = {};
  if (signalRepo) {
    const rows = await signalRepo.getByUserId(profile.userId);
    for (const r of rows) {
      existingSignals[r.signalType] = {
        type: r.signalType,
        value: r.value,
        weight: r.weight,
        confidence: r.confidence,
        firstObserved: r.firstObserved,
        lastObserved: r.lastObserved,
        observationCount: r.observationCount,
        decayFactor: r.decayFactor,
      };
    }
  }

  const mergedNameEvidence = mergeNameEvidence(updated.nameEvidence, signals.personalIdentifiers);
  updated.nameEvidence = mergedNameEvidence;
  
  // Resolve name conflicts with full conflict resolver
  if (mergedNameEvidence && updated.name !== mergedNameEvidence.value) {
    const nameConflict = conflictResolver.resolveConflict(
      'name',
      updated.name,
      mergedNameEvidence.value,
      undefined,
      0.7 // confidence for name evidence
    );

    if (nameConflict.resolution === 'accept_new') {
      updated.name = mergedNameEvidence.value;
      await auditRepo.logSignalUpdate(
        profile.userId,
        'name',
        nameConflict.oldValue,
        nameConflict.newValue,
        nameConflict.confidence,
        nameConflict.reason,
        updated.version ?? 1
      ).catch(err => getLogger().warn({ err }, 'Failed to log name update'));

      // Persist signal metric for name if repository is available
      if (signalRepo) {
        const existing = existingSignals['name'];
        const metric = updateSignalMetric(existing, updated.name ?? mergedNameEvidence.value, nameConflict.confidence, existing?.decayFactor ?? 0.95, 'name');
        existingSignals['name'] = metric;
        await signalRepo.upsertSignal({
          userId: profile.userId,
          signalType: 'name',
          value: metric.value,
          weight: metric.weight,
          confidence: metric.confidence,
          firstObserved: metric.firstObserved,
          lastObserved: metric.lastObserved,
          observationCount: metric.observationCount,
          decayFactor: metric.decayFactor,
          }).catch(err => getLogger().warn({ err }, 'Failed to persist name signal metric'));
      }

      // Emit telemetry for significant profile changes
      getTelemetry().recordEvent({
        timestamp: new Date().toISOString(),
        level: nameConflict.confidence > 0.8 ? 'info' : 'debug',
        type: 'profile_signal_resolved',
        data: {
          userId: profile.userId,
          signalType: 'name',
          resolution: nameConflict.resolution,
          confidence: nameConflict.confidence,
          reason: nameConflict.reason,
        },
      }).catch(() => {
        // Ignore telemetry errors
      });
    }
  }

  const historyText = (signals.recentHistory || []).join(' ').toLowerCase();
  const inputText = (signals.currentInput || '').toLowerCase();

  // Tone corrections with conflict resolution
  if (historyText.includes('assistant tone') || historyText.includes('speak plainly') || inputText.includes('assistant tone')) {
    const toneConflict = conflictResolver.resolveConflict(
      'tonePreference',
      updated.tonePreference,
      'no-assistant',
      existingSignals['tonePreference'],
      0.8
    );
    if (toneConflict.resolution === 'accept_new') {
      updated.tonePreference = 'no-assistant';
      await auditRepo.logSignalUpdate(
        profile.userId,
        'tonePreference',
        toneConflict.oldValue,
        toneConflict.newValue,
        toneConflict.confidence,
        toneConflict.reason,
        updated.version ?? 1
      ).catch(err => getLogger().warn({ err }, 'Failed to log tone update'));

      if (signalRepo) {
        const existing = existingSignals['tonePreference'];
        const metric = updateSignalMetric(existing, 'no-assistant', toneConflict.confidence, existing?.decayFactor ?? 0.95, 'tonePreference');
        existingSignals['tonePreference'] = metric;
        await signalRepo.upsertSignal({
          userId: profile.userId,
          signalType: 'tonePreference',
          value: metric.value,
          weight: metric.weight,
          confidence: metric.confidence,
          firstObserved: metric.firstObserved,
          lastObserved: metric.lastObserved,
          observationCount: metric.observationCount,
          decayFactor: metric.decayFactor,
        }).catch(err => getLogger().warn({ err }, 'Failed to persist tone signal metric'));
      }
    }
  }

  // Ambiguity handling preference inferred from short utterances like "i dont"
  if (historyText.includes('i dont') || inputText === 'i dont' || inputText === "i don't") {
    const inferenceConflict = conflictResolver.resolveConflict(
      'inferencePreference',
      updated.inferencePreference,
      'infer-first',
      existingSignals['inferencePreference'],
      0.7
    );
    if (inferenceConflict.resolution === 'accept_new') {
      updated.inferencePreference = 'infer-first';
      await auditRepo.logSignalUpdate(
        profile.userId,
        'inferencePreference',
        inferenceConflict.oldValue,
        inferenceConflict.newValue,
        inferenceConflict.confidence,
        inferenceConflict.reason,
        updated.version ?? 1
      ).catch(err => getLogger().warn({ err }, 'Failed to log inference update'));

      if (signalRepo) {
        const existing = existingSignals['inferencePreference'];
        const metric = updateSignalMetric(existing, 'infer-first', inferenceConflict.confidence, existing?.decayFactor ?? 0.95, 'inferencePreference');
        existingSignals['inferencePreference'] = metric;
        await signalRepo.upsertSignal({
          userId: profile.userId,
          signalType: 'inferencePreference',
          value: metric.value,
          weight: metric.weight,
          confidence: metric.confidence,
          firstObserved: metric.firstObserved,
          lastObserved: metric.lastObserved,
          observationCount: metric.observationCount,
          decayFactor: metric.decayFactor,
        }).catch(err => getLogger().warn({ err }, 'Failed to persist inference signal metric'));
      }
    }
  }

  // Relational probes imply deeper asymmetry is allowed (with conflict resolution)
  const relationalTriggers = ['who am i to you', 'who are you to me', 'do you like me', 'are you proud of me'];
  if (relationalTriggers.some((t) => historyText.includes(t) || inputText.includes(t))) {
    const relDepthConflict = conflictResolver.resolveConflict(
      'relationalDepth',
      updated.relationalDepth,
      'deepening',
      existingSignals['relationalDepth'],
      0.85
    );
    if (relDepthConflict.resolution === 'accept_new') {
      updated.relationalDepth = 'deepening';
      updated.stanceBias = 'reflective';
      updated.allowAsymmetry = true;
      await auditRepo.logSignalUpdate(
        profile.userId,
        'relationalDepth',
        relDepthConflict.oldValue,
        relDepthConflict.newValue,
        relDepthConflict.confidence,
        relDepthConflict.reason,
        updated.version ?? 1
      ).catch(err => getLogger().warn({ err }, 'Failed to log relational depth update'));

      if (signalRepo) {
        const existing = existingSignals['relationalDepth'];
        const metric = updateSignalMetric(existing, 'deepening', relDepthConflict.confidence, existing?.decayFactor ?? 0.95, 'relationalDepth');
        existingSignals['relationalDepth'] = metric;
        await signalRepo.upsertSignal({
          userId: profile.userId,
          signalType: 'relationalDepth',
          value: metric.value,
          weight: metric.weight,
          confidence: metric.confidence,
          firstObserved: metric.firstObserved,
          lastObserved: metric.lastObserved,
          observationCount: metric.observationCount,
          decayFactor: metric.decayFactor,
        }).catch(err => getLogger().warn({ err }, 'Failed to persist relationalDepth signal metric'));
      }
    }
  }

  // Commitment or promise language nudges stance to reflective/assertive
  if (historyText.includes('promise') || historyText.includes('commit') || inputText.includes('promise')) {
    const stanceConflict = conflictResolver.resolveConflict(
      'stanceBias',
      updated.stanceBias,
      'assertive',
      existingSignals['stanceBias'],
      0.7
    );
    if (stanceConflict.resolution === 'accept_new') {
      updated.stanceBias = 'assertive';
      await auditRepo.logSignalUpdate(
        profile.userId,
        'stanceBias',
        stanceConflict.oldValue,
        stanceConflict.newValue,
        stanceConflict.confidence,
        stanceConflict.reason,
        updated.version ?? 1
      ).catch(err => getLogger().warn({ err }, 'Failed to log stance update'));

      if (signalRepo) {
        const existing = existingSignals['stanceBias'];
        const metric = updateSignalMetric(existing, 'assertive', stanceConflict.confidence, existing?.decayFactor ?? 0.95, 'stanceBias');
        existingSignals['stanceBias'] = metric;
        await signalRepo.upsertSignal({
          userId: profile.userId,
          signalType: 'stanceBias',
          value: metric.value,
          weight: metric.weight,
          confidence: metric.confidence,
          firstObserved: metric.firstObserved,
          lastObserved: metric.lastObserved,
          observationCount: metric.observationCount,
          decayFactor: metric.decayFactor,
        }).catch(err => getLogger().warn({ err }, 'Failed to persist stanceBias signal metric'));
      }
    }
  }

  // Soft sentiment heuristic: if strong negative affect, skew reflective
  const negativeTriggers = ['tired', 'exhausted', 'overwhelmed', 'burned out', 'burnt out', 'stressed'];
  if (negativeTriggers.some((t) => historyText.includes(t) || inputText.includes(t))) {
    const negativeStanceConflict = conflictResolver.resolveConflict(
      'stanceBias',
      updated.stanceBias,
      'reflective',
      existingSignals['stanceBias'],
      0.65
    );
    if (negativeStanceConflict.resolution === 'accept_new') {
      updated.stanceBias = 'reflective';
      await auditRepo.logSignalUpdate(
        profile.userId,
        'stanceBias',
        negativeStanceConflict.oldValue,
        negativeStanceConflict.newValue,
        negativeStanceConflict.confidence,
        negativeStanceConflict.reason,
        updated.version ?? 1
      ).catch(err => getLogger().warn({ err }, 'Failed to log negative sentiment update'));

      if (signalRepo) {
        const existing = existingSignals['stanceBias'];
        const metric = updateSignalMetric(existing, 'reflective', negativeStanceConflict.confidence, existing?.decayFactor ?? 0.95, 'stanceBias');
        existingSignals['stanceBias'] = metric;
        await signalRepo.upsertSignal({
          userId: profile.userId,
          signalType: 'stanceBias',
          value: metric.value,
          weight: metric.weight,
          confidence: metric.confidence,
          firstObserved: metric.firstObserved,
          lastObserved: metric.lastObserved,
          observationCount: metric.observationCount,
          decayFactor: metric.decayFactor,
        }).catch(err => getLogger().warn({ err }, 'Failed to persist stanceBias signal metric'));
      }
    }
  }

  // Preference hints: if user says "no advice", keep infer-first and no-assistant tone (with high confidence)
  if (historyText.includes('no advice') || inputText.includes('no advice')) {
    const noAdviceTone = conflictResolver.resolveConflict(
      'tonePreference',
      updated.tonePreference,
      'no-assistant',
      existingSignals['tonePreference'],
      0.9
    );
    const noAdviceInfer = conflictResolver.resolveConflict(
      'inferencePreference',
      updated.inferencePreference,
      'infer-first',
      existingSignals['inferencePreference'],
      0.9
    );

    if (noAdviceTone.resolution === 'accept_new') {
      updated.tonePreference = 'no-assistant';
      await auditRepo.logSignalUpdate(
        profile.userId,
        'tonePreference',
        noAdviceTone.oldValue,
        noAdviceTone.newValue,
        noAdviceTone.confidence,
        noAdviceTone.reason,
        updated.version ?? 1
      ).catch(err => getLogger().warn({ err }, 'Failed to log no-advice tone update'));

      if (signalRepo) {
        const existing = existingSignals['tonePreference'];
        const metric = updateSignalMetric(existing, 'no-assistant', noAdviceTone.confidence, existing?.decayFactor ?? 0.95, 'tonePreference');
        existingSignals['tonePreference'] = metric;
        await signalRepo.upsertSignal({
          userId: profile.userId,
          signalType: 'tonePreference',
          value: metric.value,
          weight: metric.weight,
          confidence: metric.confidence,
          firstObserved: metric.firstObserved,
          lastObserved: metric.lastObserved,
          observationCount: metric.observationCount,
          decayFactor: metric.decayFactor,
        }).catch(err => getLogger().warn({ err }, 'Failed to persist tone signal metric'));
      }
    }

    if (noAdviceInfer.resolution === 'accept_new') {
      updated.inferencePreference = 'infer-first';
      await auditRepo.logSignalUpdate(
        profile.userId,
        'inferencePreference',
        noAdviceInfer.oldValue,
        noAdviceInfer.newValue,
        noAdviceInfer.confidence,
        noAdviceInfer.reason,
        updated.version ?? 1
      ).catch(err => getLogger().warn({ err }, 'Failed to log no-advice inference update'));

      if (signalRepo) {
        const existing = existingSignals['inferencePreference'];
        const metric = updateSignalMetric(existing, 'infer-first', noAdviceInfer.confidence, existing?.decayFactor ?? 0.95, 'inferencePreference');
        existingSignals['inferencePreference'] = metric;
        await signalRepo.upsertSignal({
          userId: profile.userId,
          signalType: 'inferencePreference',
          value: metric.value,
          weight: metric.weight,
          confidence: metric.confidence,
          firstObserved: metric.firstObserved,
          lastObserved: metric.lastObserved,
          observationCount: metric.observationCount,
          decayFactor: metric.decayFactor,
        }).catch(err => getLogger().warn({ err }, 'Failed to persist inference signal metric'));
      }
    }
  }

  updated.updatedAt = new Date().toISOString();
  
  // Only increment version if an actual signal was accepted (not on every call)
  let actualChangeOccurred = false;
  if (mergedNameEvidence && updated.name !== profile.name) {
    actualChangeOccurred = true;
  }
  if (updated.tonePreference !== profile.tonePreference) {
    actualChangeOccurred = true;
  }
  if (updated.inferencePreference !== profile.inferencePreference) {
    actualChangeOccurred = true;
  }
  if (updated.relationalDepth !== profile.relationalDepth) {
    actualChangeOccurred = true;
  }
  if (updated.stanceBias !== profile.stanceBias) {
    actualChangeOccurred = true;
  }
  if (updated.allowAsymmetry !== profile.allowAsymmetry) {
    actualChangeOccurred = true;
  }
  if (updated.allowImperfection !== profile.allowImperfection) {
    actualChangeOccurred = true;
  }
  
  // Only increment if something actually changed
  if (actualChangeOccurred) {
    updated.version = (updated.version ?? 1) + 1;
  } else {
    // No change occurred, preserve existing version
    updated.version = profile.version ?? 1;
  }
  
  profileStore.set(profile.userId, updated);

  if (storage) {
    await storage.upsert(updated);
  }

  return updated;
}

export function selectStance(profile: UserProfile, bond?: { trust: number; familiarity: number; rapport: number }): StanceBias {
  const baseStance = profile.stanceBias;
  
  // If bond is provided, adjust stance based on bond strength
  if (bond) {
    const bondStrength = (bond.trust + bond.familiarity + Math.max(0, bond.rapport)) / 3;
    
    if (bondStrength > 0.7) {
      // Strong bond: lean assertive/direct
      if (baseStance === 'reflective' || baseStance === 'inferential') {
        return 'assertive';
      }
    } else if (bondStrength < 0.3) {
      // Weak bond: lean reflective/cautious
      if (baseStance === 'assertive' || baseStance === 'taskful') {
        return 'reflective';
      }
    }
  }
  
  return baseStance;
}

/**
 * StanceEngine: Decide stance before generation (Layer 5 - 77EZ)
 * Combines user profile, bond strength, immediate/recent context, and self model hints.
 * Returns stance and concise reasoning for observability.
 */
export function computeStanceDecision(input: string, opts: {
  profile: UserProfile;
  bond?: { trust: number; familiarity: number; rapport: number };
  immediateContext?: string[];
  recentHistory?: string[];
  selfModel?: { stances?: Record<string, unknown>; preferences?: Record<string, unknown> };
}): { stance: StanceBias; reasoning: string } {
  const { profile, bond, immediateContext = [], recentHistory = [], selfModel } = opts;
  const base = profile.stanceBias;
  const inputText = (input || '').toLowerCase();
  const ctxText = [...immediateContext, ...recentHistory].join(' ').toLowerCase();

  // Relational probes → reflective (answer personally, asymmetrically)
  const relationalTriggers = ['who am i to you', 'who are you to me', 'do you like me', 'are you proud of me'];
  if (relationalTriggers.some(t => inputText.includes(t) || ctxText.includes(t))) {
    return { stance: 'reflective', reasoning: 'Relational probe detected; prefer reflective asymmetry.' };
  }

  // Commitments/promises → assertive (clear, directive follow-through)
  const commitmentTriggers = ['promise', 'commit', 'deadline', 'i will', 'we will'];
  if (commitmentTriggers.some(t => inputText.includes(t) || ctxText.includes(t))) {
    return { stance: 'assertive', reasoning: 'Commitment language detected; prefer assertive clarity.' };
  }

  // Negative affect → reflective (contain, name the subtext)
  const negativeTriggers = ['tired', 'exhausted', 'overwhelmed', 'burned out', 'burnt out', 'stressed'];
  if (negativeTriggers.some(t => inputText.includes(t) || ctxText.includes(t))) {
    return { stance: 'reflective', reasoning: 'Negative affect detected; prefer reflective grounding.' };
  }

  // Ambiguity: if immediate context clarifies, keep inferential; else reflective
  const isAmbiguous = inputText.trim().length < 6 || /\?|maybe|not sure|idk/i.test(input);
  if (isAmbiguous) {
    const ctxHasSignal = immediateContext.join(' ').length > 0;
    const stance = ctxHasSignal ? 'inferential' : 'reflective';
    return { stance, reasoning: ctxHasSignal ? 'Ambiguity with clarifying context; inferential first.' : 'Ambiguity without context; reflective.' };
  }

  // Bond influence: strong → assertive, weak → reflective
  if (bond) {
    const strength = (bond.trust + bond.familiarity + Math.max(0, bond.rapport)) / 3;
    if (strength > 0.7) {
      const stance = base === 'reflective' ? 'assertive' : base;
      return { stance, reasoning: 'Strong bond; allow more assertive/direct stance.' };
    }
    if (strength < 0.3) {
      const stance = base === 'assertive' || base === 'taskful' ? 'reflective' : base;
      return { stance, reasoning: 'Weak bond; prefer reflective/cautious stance.' };
    }
  }

  // Self model preferences can bias stance (if present)
  const prefersTaskful = !!selfModel?.stances && JSON.stringify(selfModel.stances).toLowerCase().includes('task');
  if (prefersTaskful && /action|steps|plan|execute/i.test(input)) {
    return { stance: 'taskful', reasoning: 'Self model task preference and action language detected.' };
  }

  // Default: profile bias
  return { stance: base, reasoning: 'Default to profile stance bias.' };
}

