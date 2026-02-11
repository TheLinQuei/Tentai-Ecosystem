import type { ObservabilityRepository } from './repositories/ObservabilityRepository.js';

let emitter: ObservabilityRepository | null = null;

export function setObservabilityEmitter(repo: ObservabilityRepository): void {
  emitter = repo;
}

export function getObservabilityEmitter(): ObservabilityRepository | null {
  return emitter;
}
