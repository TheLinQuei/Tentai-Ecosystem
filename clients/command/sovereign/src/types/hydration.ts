/**
 * Canonical God Console hydration contract (shared backend ↔ console).
 * This file defines the only accepted inbound signal shapes for Phase II wiring.
 */

export type GodConsoleTone = 'ok' | 'warn' | 'offline' | 'degraded';

export interface GodConsoleSignal {
  label: string;
  tone: GodConsoleTone;
  detail?: string;
  timestamp?: string; // ISO8601
  source?: string; // optional component or endpoint identifier
}

export interface GodConsoleHydrationPayload {
  viStatus?: GodConsoleSignal;
  systemState?: string;
  signals?: Partial<GodConsoleSignals>;
}

// Domain → panel signal map (all optional; only wired signals should be sent)
export interface GodConsoleSignals {
  'core-posture': GodConsoleSignal;
  'core-channel': GodConsoleSignal;
  'memory-episodic': GodConsoleSignal;
  'memory-canon': GodConsoleSignal;
  'lore-mode': GodConsoleSignal;
  'lore-integrity': GodConsoleSignal;
  'clients-identity': GodConsoleSignal;
  'clients-adapters': GodConsoleSignal;
  'systems-health': GodConsoleSignal;
  'systems-dependencies': GodConsoleSignal;
  'authority-overrides': GodConsoleSignal;
  'authority-safety': GodConsoleSignal;
  'audit-evidence': GodConsoleSignal;
  'audit-events': GodConsoleSignal;
}
