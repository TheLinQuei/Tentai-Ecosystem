/**
 * Workspace State Persistence
 * Stores and restores workspace state per workspaceId
 */

import type { WorkspaceId, WorkspaceState } from './types.js';

const STORAGE_PREFIX = 'vi.console.workspace.';

export function createDefaultWorkspaceState(workspaceId: WorkspaceId): WorkspaceState {
  return {
    workspaceId,
    activePane: 'main',
    filters: {},
    queries: {},
    scrollState: [],
    persistedAt: new Date().toISOString(),
  };
}

export function loadWorkspaceState(workspaceId: WorkspaceId): WorkspaceState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createDefaultWorkspaceState(workspaceId);
  }

  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`);
  if (!raw) {
    return createDefaultWorkspaceState(workspaceId);
  }

  try {
    const parsed = JSON.parse(raw) as WorkspaceState;
    return {
      ...createDefaultWorkspaceState(workspaceId),
      ...parsed,
      workspaceId,
    };
  } catch {
    return createDefaultWorkspaceState(workspaceId);
  }
}

export function saveWorkspaceState(state: WorkspaceState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  const next = {
    ...state,
    persistedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(`${STORAGE_PREFIX}${state.workspaceId}` , JSON.stringify(next));
}
