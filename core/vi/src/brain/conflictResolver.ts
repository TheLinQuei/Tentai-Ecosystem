/**
 * Conflict Resolution for UserModel profile evolution.
 * 
 * Handles scenarios where user signals shift (e.g., name change, stance preference change).
 * Uses weighting and decay to determine if a shift is real or noise.
 */

import {
  SignalMetric,
  calculateDecayedWeight,
  SignalAuditEntry,
  createAuditEntry,
} from './signalWeighting.js';

export interface ConflictReport {
  fieldName: string;
  oldValue: string;
  newValue: string;
  confidence: number; // 0-1, how sure the system is of the resolution
  resolution: 'accept_new' | 'keep_old' | 'defer_decision';
  reason: string;
  auditEntry: SignalAuditEntry;
}

export class ConflictResolver {
  /**
   * Resolve a conflict between an established value and a new signal.
   * Returns decision + audit entry.
   */
  resolveConflict(
    fieldName: string,
    oldValue: string | undefined,
    newValue: string,
    existingSignal: SignalMetric | undefined,
    newConfidence: number,
    decayThreshold: number = 0.5
  ): ConflictReport {
    // If no old value, trivially accept new
    if (!oldValue) {
      // const updated = updateSignalMetric(...); // for future use

      return {
        fieldName,
        oldValue: oldValue ?? '(none)',
        newValue,
        confidence: newConfidence,
        resolution: 'accept_new',
        reason: 'First observation',
        auditEntry: createAuditEntry(
          fieldName,
          oldValue,
          newValue,
          newConfidence,
          'accept_new_first_observation'
        ),
      };
    }

    // If same value, reinforce
    if (oldValue === newValue) {
      return {
        fieldName,
        oldValue,
        newValue,
        confidence: Math.min(1, (existingSignal?.confidence ?? 0.5) + 0.15),
        resolution: 'keep_old',
        reason: 'Reinforced existing value',
        auditEntry: createAuditEntry(
          fieldName,
          oldValue,
          newValue,
          Math.min(1, (existingSignal?.confidence ?? 0.5) + 0.15),
          'reinforced'
        ),
      };
    }

    // Different value: decide based on decay + confidence
    const existingDecayedWeight = existingSignal
      ? calculateDecayedWeight(existingSignal)
      : 0.5;

    // If existing signal has decayed significantly, accept new
    if (existingDecayedWeight < decayThreshold && newConfidence > 0.7) {
      return {
        fieldName,
        oldValue,
        newValue,
        confidence: newConfidence,
        resolution: 'accept_new',
        reason: `Existing signal decayed to ${(existingDecayedWeight * 100).toFixed(0)}%, new confidence: ${(newConfidence * 100).toFixed(0)}%`,
        auditEntry: createAuditEntry(
          fieldName,
          oldValue,
          newValue,
          newConfidence,
          'accept_new_decay_threshold'
        ),
      };
    }

    // If existing is well-established (weight > threshold), keep unless new is very high confidence
    if (existingDecayedWeight > decayThreshold && newConfidence < 0.85) {
      return {
        fieldName,
        oldValue,
        newValue,
        confidence: existingDecayedWeight,
        resolution: 'keep_old',
        reason: `Existing signal strong (${(existingDecayedWeight * 100).toFixed(0)}%), new confidence low (${(newConfidence * 100).toFixed(0)}%)`,
        auditEntry: createAuditEntry(
          fieldName,
          oldValue,
          newValue,
          existingDecayedWeight,
          'keep_old_high_confidence_existing'
        ),
      };
    }

    // Edge case: significant confidence > 85% and decayed weight < threshold
    if (newConfidence > 0.85 && existingDecayedWeight < 0.5) {
      return {
        fieldName,
        oldValue,
        newValue,
        confidence: newConfidence,
        resolution: 'accept_new',
        reason: `High-confidence new signal (${(newConfidence * 100).toFixed(0)}%) overrides weak existing`,
        auditEntry: createAuditEntry(
          fieldName,
          oldValue,
          newValue,
          newConfidence,
          'accept_new_high_confidence_override'
        ),
      };
    }

    // Defer: both signals have moderate strength; unclear which to trust
    return {
      fieldName,
      oldValue,
      newValue,
      confidence: Math.max(existingDecayedWeight, newConfidence) * 0.7, // Reduce confidence due to conflict
      resolution: 'defer_decision',
      reason: `Conflicting signals: existing ${(existingDecayedWeight * 100).toFixed(0)}% vs. new ${(newConfidence * 100).toFixed(0)}%. Will re-evaluate with more data.`,
      auditEntry: createAuditEntry(
        fieldName,
        oldValue,
        newValue,
        Math.max(existingDecayedWeight, newConfidence) * 0.7,
        'defer_conflict_unresolved'
      ),
    };
  }

  /**
   * Batch resolve multiple conflicts (e.g., from a single turn).
   */
  resolveBatch(
    conflicts: Array<{
      fieldName: string;
      oldValue: string | undefined;
      newValue: string;
      existingSignal?: SignalMetric;
      newConfidence: number;
    }>
  ): ConflictReport[] {
    return conflicts.map(c =>
      this.resolveConflict(
        c.fieldName,
        c.oldValue,
        c.newValue,
        c.existingSignal,
        c.newConfidence
      )
    );
  }
}
