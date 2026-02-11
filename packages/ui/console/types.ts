/**
 * Console Workspace Types
 * Canonical workspace contract for Vi Console UI
 */

export type WorkspaceId = 'chat' | 'lore' | 'discord' | 'control-plane';
export type Role = 'founder' | 'user';

export interface ScrollState {
  pane: string;
  offset: number;
}

export interface SessionContext {
  userId: string;
  sessionId: string;
  timestamp: string;
}

export interface WorkspaceState {
  workspaceId: WorkspaceId;
  activePane: string;
  filters: Record<string, unknown>;
  queries: Record<string, unknown>;
  scrollState: ScrollState[];
  sessionContext?: SessionContext;
  persistedAt: string;
}

export interface RoleFrame {
  role: Role;
  visibleControls: string[];
  exposedMetrics: string[];
  allowedActions: string[];
  auditLevel: 'detailed' | 'standard' | 'none';
}
