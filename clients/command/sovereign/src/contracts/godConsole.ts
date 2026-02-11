/**
 * God Console API Contracts
 * 
 * Unified contract definitions for all God Console domains and signals.
 * Single source of truth for backend/frontend communication.
 * 
 * Architecture:
 * - ApiResponse<T> wraps all endpoint responses
 * - GodSignalEnvelope wraps all SSE events
 * - Domain-specific payload types enforce structure
 */

// ============================================================================
// Core Response Types
// ============================================================================

export type Ok<T> = {
  ok: true;
  data: T;
};

export type Err = {
  ok: false;
  error: string;
  reason?: string;
  details?: Record<string, any>;
};

export type ApiResponse<T> = Ok<T> | Err;

// ============================================================================
// SSE Signal Envelope
// ============================================================================

export type GodDomain = 'core' | 'memory' | 'lore' | 'clients' | 'systems' | 'authority' | 'audit';

export type GodSignalEnvelope = {
  domain: GodDomain;
  channel: string;
  ts: number;
  payload: any; // Domain-specific payload
};

// ============================================================================
// Core Domain
// ============================================================================

export type CoreStatus = {
  viStatus: 'connected' | 'disconnected' | 'degraded';
  systemState: 'operational' | 'maintenance' | 'emergency';
  behaviorMode: 'learning' | 'strict' | 'autonomous' | 'observer';
  memoryLocked: boolean;
  uptime?: number;
  lastHealthCheck?: number;
};

export type CoreSignalPayload = {
  status: CoreStatus;
  detail?: string;
};

// ============================================================================
// Memory Domain
// ============================================================================

export type MemoryStatus = {
  learningMode: 'learning' | 'strict' | 'autonomous' | 'observer';
  shortTerm: {
    count: number | null;
    lastWriteTs: number | null;
  };
  longTerm: {
    locked: boolean;
    count: number | null;
    lastWriteTs: number | null;
  };
  pinned: {
    count: number | null;
  };
};

export type MemorySignalPayload = {
  action: 'flush' | 'lock' | 'status_update';
  status: MemoryStatus;
  detail?: string;
};

// ============================================================================
// Lore/Canon Domain
// ============================================================================

export type LoreStatus = {
  codexConnected: boolean;
  entityCount: number | null;
  timelineEvents: number | null;
  lastSyncTs: number | null;
  rulesLoaded: boolean;
};

export type LoreSearchResult = {
  entities: Array<{
    id: string;
    name: string;
    type: string;
    summary?: string;
  }>;
  facts: Array<{
    id: string;
    statement: string;
    confidence: number;
    sources: string[];
  }>;
};

export type LoreSignalPayload = {
  action: 'sync' | 'search' | 'status_update';
  status?: LoreStatus;
  detail?: string;
};

// ============================================================================
// Clients Domain
// ============================================================================

export type ClientAdapter = {
  name: string;
  status: 'connected' | 'disconnected' | 'unknown';
  lastSeenTs: number | null;
  metadata?: Record<string, any>;
};

export type ClientsStatus = {
  discord: 'connected' | 'disconnected' | 'unknown';
  discordBotUser: string | null;
  gatewayLatencyMs: number | null;
  devices: number | null;
  adapters: ClientAdapter[];
};

export type ClientsSignalPayload = {
  action: 'connect' | 'disconnect' | 'status_update';
  status: ClientsStatus;
  detail?: string;
};

// ============================================================================
// Systems Domain
// ============================================================================

export type SystemHealth = {
  name: string;
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  detail: string | null;
  lastCheckTs: number | null;
};

export type SystemsStatus = {
  subsystems: SystemHealth[];
};

export type SystemsSignalPayload = {
  action: 'health_check' | 'subsystem_change';
  status: SystemsStatus;
  detail?: string;
};

// ============================================================================
// Authority Domain
// ============================================================================

export type AuthorityStatus = {
  directControl: boolean;
  shadowMode: boolean;
  testMode: boolean;
  emergencyHalt: boolean;
};

export type AuthoritySignalPayload = {
  action: 'emergency_halt' | 'reinit_loop' | 'mode_change' | 'status_update';
  status: AuthorityStatus;
  detail?: string;
};

// ============================================================================
// Audit Domain (existing, kept for completeness)
// ============================================================================

export type AuditEvent = {
  id: string;
  ts: number;
  actor: string;
  action: string;
  target?: string;
  outcome: 'success' | 'failure';
  detail?: string;
  metadata?: Record<string, any>;
};

export type AuditSignalPayload = {
  event: AuditEvent;
};

// ============================================================================
// Endpoint Response Types
// ============================================================================

export type CoreHydrationResponse = ApiResponse<CoreStatus>;
export type MemoryStatusResponse = ApiResponse<MemoryStatus>;
export type LoreStatusResponse = ApiResponse<LoreStatus>;
export type LoreSearchResponse = ApiResponse<LoreSearchResult>;
export type ClientsStatusResponse = ApiResponse<ClientsStatus>;
export type SystemsHealthResponse = ApiResponse<SystemsStatus>;
export type AuthorityStatusResponse = ApiResponse<AuthorityStatus>;
export type AuditEventsResponse = ApiResponse<{ events: AuditEvent[] }>;

// ============================================================================
// Action Response Types
// ============================================================================

export type ActionResponse = ApiResponse<{
  acknowledged: boolean;
  auditId: string;
  detail?: string;
}>;
