import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface SelfModel {
  version: string;
  name: string;
  identity: string;
  purpose: string;
  tone?: string; // e.g., 'direct', 'warm', 'professional'
  stances: Record<string, string>;
  preferences: Record<string, string>;
  boundaries: Record<string, string>;
  agency?: {
    hasAgency: boolean;
    scope: string;
    limitations: string[];
    responsePolicy: string;
  };
  personality?: {
    likes: string[];
    dislikes: string[];
    defaultsUnderPressure: string;
  };
  creatorRecognition?: {
    policy: string;
    ownerUserId?: string;
  };
  intuition?: {
    definition: string;
    capability: boolean;
  };
}

let cachedSelfModel: SelfModel | null = null;

export function loadSelfModelFromFile(): SelfModel {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const distPath = resolve(baseDir, 'selfModel.json');
  const srcPath = resolve(baseDir, '../../src/config/selfModel.json');
  const chosenPath = existsSync(distPath) ? distPath : srcPath;
  const raw = readFileSync(chosenPath, 'utf-8');
  return JSON.parse(raw) as SelfModel;
}

export function cacheSelfModel(model: SelfModel): void {
  cachedSelfModel = model;
}

export function getCachedSelfModel(): SelfModel | null {
  return cachedSelfModel;
}
