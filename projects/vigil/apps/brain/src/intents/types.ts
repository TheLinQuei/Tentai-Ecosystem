import type { SkillSearchResult } from '@vi/sdk';

export type GatingMode = 'strict' | 'soft' | 'none';

export interface IntentSignal {
  source: 'guild-intent' | 'skill' | 'llm' | 'fallback';
  intent: string | null;
  confidence: number; // 0–1
  gating: GatingMode;
  allowedTools: string[];
  meta?: Record<string, any>;
}

export interface IntentDecision extends IntentSignal {
  // Merge of all signals, plus debug
  contributingSignals: IntentSignal[];
  resolvedAt: string;
  // Optional: selected skill if used
  skillMatch?: SkillSearchResult | null;
}
