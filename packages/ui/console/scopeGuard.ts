/**
 * Scope guard for console workspace isolation
 */

import type { WorkspaceId } from './types.js';

type ScopeConfig = {
  apis: string[];
  actions: string[];
};

const scopeMatrix: Record<WorkspaceId, ScopeConfig> = {
  chat: {
    apis: ['/v1/chat', '/v1/identity/resolve', '/v1/identity/link'],
    actions: ['send-message', 'view-memory'],
  },
  lore: {
    apis: ['/v1/lore', '/v1/astralis', '/v1/canon'],
    actions: ['query-canon', 'view-citations'],
  },
  discord: {
    apis: ['/v1/discord', '/v1/bridge', '/v1/identity/map'],
    actions: ['view-servers', 'view-bridge-status'],
  },
  'control-plane': {
    apis: ['/v1/admin', '/v1/metrics', '/v1/profile'],
    actions: ['view-metrics', 'view-audit', 'manage-users'],
  },
};

export class ScopeGuard {
  canCallAPI(workspaceId: WorkspaceId, endpoint: string): boolean {
    const config = scopeMatrix[workspaceId];
    return config.apis.some((allowed) => endpoint.startsWith(allowed));
  }

  canExecuteAction(workspaceId: WorkspaceId, action: string): boolean {
    const config = scopeMatrix[workspaceId];
    return config.actions.includes(action);
  }
}
