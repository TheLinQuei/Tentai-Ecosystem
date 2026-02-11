/**
 * Signal weighting and decay for UserModel.
 * 
 * Tracks the confidence/weight of each signal over time, allowing:
 * - Cross-session accumulation (signals reinforce each other)
 * - Decay over time (older signals fade in influence)
 * - Conflict resolution (new signal vs. established preference)
 * - Observability (audit trail of signal integration)
 */

export interface SignalMetric {
  type: string; // e.g., 'tone_preference', 'relational_depth', 'stance_bias'
  value: string; // e.g., 'no-assistant', 'deepening', 'reflective'
  weight: number; // 0-1, current influence
  confidence: number; // 0-1, how sure we are
  firstObserved: string; // ISO timestamp
  lastObserved: string; // ISO timestamp
  observationCount: number; // how many times seen
  decayFactor: number; // 0-1, how much to decay per day
}

export interface SignalHistory {
  userId: string;
  signals: SignalMetric[];
  lastUpdated: string;
}

/**
 * Calculate decay multiplier based on time since last observation.
 * After N days, weight decays by decay factor.
 * Example: decay=0.9, weight=1.0 → after 1 day, weight=0.9; after 10 days, weight~0.35
 */
export function calculateDecayedWeight(
  signal: SignalMetric,
  referenceTime: Date = new Date()
): number {
  const lastObservedDate = new Date(signal.lastObserved);
  const daysSinceObservation = (referenceTime.getTime() - lastObservedDate.getTime()) / (1000 * 60 * 60 * 24);

  // Decay is exponential: weight_decayed = initial_weight * decay^days
  const decayedWeight = signal.weight * Math.pow(signal.decayFactor, daysSinceObservation);
  return Math.max(0, Math.min(1, decayedWeight)); // Clamp to [0, 1]
}

/**
 * Update a signal metric with a new observation.
 * If signal hasn't been seen before, initialize it.
 * If seen again, increase confidence and weight.
 */
export function updateSignalMetric(
  existing: SignalMetric | undefined,
  newValue: string,
  newConfidence: number = 0.7,
  decayFactor: number = 0.95,
  signalType: string = 'unknown'
): SignalMetric {
  const now = new Date().toISOString();

  if (!existing) {
    return {
      type: signalType,
      value: newValue,
      weight: newConfidence,
      confidence: newConfidence,
      firstObserved: now,
      lastObserved: now,
      observationCount: 1,
      decayFactor,
    };
  }

  // Reinforce existing signal or shift to new value
  if (existing.value === newValue) {
    // Same signal reinforced
    const newObservationCount = existing.observationCount + 1;
    const reinforcedConfidence = Math.min(1, existing.confidence + 0.15); // Max increase per observation
    return {
      ...existing,
      weight: reinforcedConfidence,
      confidence: reinforcedConfidence,
      lastObserved: now,
      observationCount: newObservationCount,
    };
  } else {
    // Different signal observed; consider conflict
    // Only switch if new observation is highly confident and existing is weak
    const shouldSwitch =
      newConfidence > 0.8 && existing.confidence < 0.5;

    if (shouldSwitch) {
      return {
        type: existing.type,
        value: newValue,
        weight: newConfidence,
        confidence: newConfidence,
        firstObserved: now,
        lastObserved: now,
        observationCount: 1,
        decayFactor,
      };
    } else {
      // Keep existing; treat as minor reinforcement
      return {
        ...existing,
        lastObserved: now,
        observationCount: existing.observationCount + 1,
        confidence: Math.min(1, existing.confidence + 0.05),
      };
    }
  }
}

/**
 * Merge multiple signals of same type with weighting.
 * Returns the weighted-average value or highest-confidence value.
 */
export function mergeSignalsByWeight(
  signals: SignalMetric[],
  referenceTime: Date = new Date()
): string | null {
  if (signals.length === 0) return null;
  if (signals.length === 1) return signals[0].value;

  // Calculate decayed weights
  const weighted = signals.map(sig => ({
    value: sig.value,
    decayedWeight: calculateDecayedWeight(sig, referenceTime),
    confidence: sig.confidence,
  }));

  // Group by value and sum weights
  const valueScores = new Map<string, { weight: number; count: number }>();
  for (const w of weighted) {
    const current = valueScores.get(w.value) ?? { weight: 0, count: 0 };
    valueScores.set(w.value, {
      weight: current.weight + w.decayedWeight,
      count: current.count + 1,
    });
  }

  // Return highest-scored value
  let best = null;
  let bestScore = 0;
  for (const [value, score] of valueScores.entries()) {
    const avgWeight = score.weight / score.count;
    if (avgWeight > bestScore) {
      bestScore = avgWeight;
      best = value;
    }
  }

  return best;
}

/**
 * Audit record for signal integration.
 */
export interface SignalAuditEntry {
  timestamp: string;
  signalType: string;
  oldValue?: string;
  newValue: string;
  confidence: number;
  reason: string; // e.g., 'reinforced', 'conflict_resolved', 'decay_threshold_exceeded'
  decayedWeights?: Map<string, number>; // Optional: show decay impact
}

export interface ProfileAuditLog {
  userId: string;
  entries: SignalAuditEntry[];
}

/**
 * Record an audit entry for a signal update.
 */
export function createAuditEntry(
  signalType: string,
  oldValue: string | undefined,
  newValue: string,
  confidence: number,
  reason: string
): SignalAuditEntry {
  return {
    timestamp: new Date().toISOString(),
    signalType,
    oldValue,
    newValue,
    confidence,
    reason,
  };
}
