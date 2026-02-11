/**
 * Role-aware framing for console workspaces
 */

import type { Role, RoleFrame } from './types.js';

const founderFrame: RoleFrame = {
  role: 'founder',
  visibleControls: [
    'logs',
    'traces',
    'memory-injection',
    'enforcement',
    'audit-trail',
    'danger-zone',
  ],
  exposedMetrics: [
    'latency',
    'error-rate',
    'throughput',
    'memory-usage',
    'policy-events',
  ],
  allowedActions: [
    'view-logs',
    'view-traces',
    'inject-memory',
    'update-profile',
    'toggle-scope',
  ],
  auditLevel: 'detailed',
};

const userFrame: RoleFrame = {
  role: 'user',
  visibleControls: [
    'tasks',
    'guidance',
  ],
  exposedMetrics: [],
  allowedActions: [
    'submit-task',
  ],
  auditLevel: 'none',
};

export function getRoleFrame(role: Role): RoleFrame {
  return role === 'founder' ? founderFrame : userFrame;
}
