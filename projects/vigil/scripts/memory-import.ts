import path from 'node:path';
import { readFile } from 'node:fs/promises';

import type { Diagnostic } from '@prisma/client';

import { prisma } from '../src/db/prisma';
import { DbMemoryService } from '../src/memory/dbService';

interface CapabilityJsonItem {
  area?: unknown;
  title?: unknown;
  details?: unknown;
  id?: unknown;
}

interface CapabilitiesJson {
  capabilities?: CapabilityJsonItem[];
}

interface ConsentJsonEntry {
  consented?: unknown;
}

interface ConsentJson {
  users?: Record<string, boolean | string | ConsentJsonEntry>;
}

const memoryDir = path.resolve(process.cwd(), 'memory');
const service = new DbMemoryService(prisma);

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const contents = await readFile(filePath, 'utf8');
    return JSON.parse(contents) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`Memory file not found, skipping: ${path.relative(process.cwd(), filePath)}`);
      return null;
    }

    throw error;
  }
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }

    if (value.toLowerCase() === 'false') {
      return false;
    }

    return null;
  }

  if (value && typeof value === 'object' && 'consented' in value) {
    return normalizeBoolean((value as ConsentJsonEntry).consented);
  }

  return null;
}

async function importCapabilities(): Promise<number> {
  const filePath = path.join(memoryDir, 'capabilities.json');
  const data = await readJsonFile<CapabilitiesJson>(filePath);
  if (!data?.capabilities) {
    return 0;
  }

  const normalized = data.capabilities
    .map(({ id, area, title, details }) => {
      if (typeof area !== 'string' || typeof title !== 'string') {
        return null;
      }

      return {
        id: typeof id === 'string' ? id : undefined,
        area,
        title,
        details: typeof details === 'string' ? details : undefined,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  await service.setCapabilities(normalized);

  return normalized.length;
}

async function importConsent(): Promise<number> {
  const filePath = path.join(memoryDir, 'consent.json');
  const data = await readJsonFile<ConsentJson>(filePath);
  const users = data?.users;

  if (!users) {
    return 0;
  }

  let count = 0;
  for (const [userId, rawValue] of Object.entries(users)) {
    const normalized = normalizeBoolean(rawValue);
    if (normalized === null) {
      continue;
    }

    await service.setConsent(userId, normalized);
    count += 1;
  }

  return count;
}

async function importDiagnostics(): Promise<number> {
  const filePath = path.join(memoryDir, 'diagnostics.state.json');
  const data = await readJsonFile<Record<string, unknown>>(filePath);

  if (!data) {
    return 0;
  }

  const entries = Object.entries(data);
  await Promise.all(
    entries.map(([key, value]) => service.setDiagnostic(key, value as Diagnostic['value'])),
  );
  return entries.length;
}

async function main(): Promise<void> {
  const [capabilities, consent, diagnostics] = await Promise.all([
    importCapabilities(),
    importConsent(),
    importDiagnostics(),
  ]);

  console.log(`Imported ${capabilities} capabilities`);
  console.log(`Imported ${consent} consent records`);
  console.log(`Imported ${diagnostics} diagnostics entries`);
}

main()
  .catch((error) => {
    console.error('Memory import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
