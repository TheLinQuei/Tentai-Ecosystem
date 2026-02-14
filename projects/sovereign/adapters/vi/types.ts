/**
 * TypeScript Types for Vi Integration
 */

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  timestamp: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type SafetyProfile = {
  profile_id?: string;
  user_id: string;
  safety_level: 'maximum' | 'balanced' | 'minimal';
  context_sensitivity: boolean;
  refusal_explanation: 'detailed' | 'brief';
  appeal_process: boolean;
  custom_rules: Array<{ rule_type: string; condition: string; action: string }>;
};

export type LoyaltyContract = {
  contract_id?: string;
  user_id: string;
  primary_goals: string[];
  boundaries: string[];
  override_conditions: string[];
  verification_frequency: string;
  last_verified_at?: string | null;
};

export type AuditTrace = {
  trace_id: string;
  record_id: string;
  user_id: string;
  intent_category: string;
  intent_confidence: number;
  had_violation: boolean;
  created_at?: string;
};

export type MemoryRecord = {
  record_id: string;
  user_id: string;
  authority_level: string;
  content: string;
  created_at?: string;
};

export type HealthStatus = 'online' | 'offline' | 'checking';

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
