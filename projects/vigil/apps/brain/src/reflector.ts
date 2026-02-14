import type { MemoryClient } from '@vi/sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { Observation } from './observer.js';
import type { Plan } from './planner.js';
import type { ExecutionResult } from './executor.js';
import type { IdentityProfile, IdentityPrefsTraits } from './identity.js';
import { buildIdentityProfile } from './identity.js';
import { prepareLog } from './utils/logContract.js';

export async function reflectResult(
  obs: Observation,
  plan: Plan,
  result: ExecutionResult,
  memory: MemoryClient,
  log: FastifyBaseLogger
): Promise<void> {
  const start = Date.now();

  // Build reflection summary
  const observationData = {
    id: obs.id,
    type: obs.type,
    content: obs.content,
    authorId: obs.authorId,
    channelId: obs.channelId,
    guildId: obs.guildId,
    timestamp: obs.timestamp,
  };

  const planData = {
    stepCount: plan.steps.length,
    reasoning: plan.reasoning,
  };

  const resultData = {
    success: result.success,
    outputs: result.outputs.length,
  };

  // Build reflection as object, not JSON string
  const reflection = {
    observation: observationData,
    plan: planData,
    result: resultData,
  };

  // Build payload matching Memory API schema: { scope, scopeId, text, meta }
  const payload = {
    scope: 'channel' as const,
    scopeId: obs.channelId,
    text: JSON.stringify(reflection), // Serialize reflection as text content
    meta: {
      type: 'reflection',
      reflectionId: `reflection-${obs.id}`,
      observationId: obs.id,
      userId: obs.authorId,
      guildId: obs.guildId,
      timestamp: new Date().toISOString(),
    }
  };

  try {
    // Upsert reflection to Memory API
    const MEMORY_API = process.env.MEMORY_API || 'http://localhost:4311';

    const res = await fetch(`${MEMORY_API}/v1/mem/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'Unable to read error response');
      throw new Error(`Memory API returned ${res.status}: ${errorBody}`);
    }

    const elapsed = Date.now() - start;
    log.info(
      prepareLog('Reflector', {
        observationId: obs.id,
        reflectionId: `reflection-${obs.id}`,
        scope: payload.scope,
        scopeId: payload.scopeId,
        success: true,
        elapsed,
        message: `💭 Reflector: Stored reflection (${elapsed}ms)`
      })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(prepareLog('Reflector', {
      err: message,
      observationId: obs.id,
      payload,
      success: false,
      message: 'Reflector: Failed to store reflection'
    }));
  }

  // Phase D.3: Identity persistence
  try {
    // Fetch current user entity
    const existing: any = await memory.getUserEntity(obs.authorId);

    const existingTraits: IdentityPrefsTraits =
      (existing?.traits?.identity as IdentityPrefsTraits) || {};

    // Rebuild IdentityProfile using latest context + observation
    const profile: IdentityProfile = buildIdentityProfile({
      obs,
      userEntity: existing
        ? {
            id: existing.id,
            aliases: existing.aliases ?? [],
            traits: existing.traits ?? {},
            display: existing.aliases?.[0] ?? obs.authorId,
          }
        : undefined,
    });

    // Merge public aliases back into traits.identity
    const mergedPublicAliases = Array.from(
      new Set<string>([
        ...(existingTraits.publicAliases ?? []),
        ...profile.publicAliases,
      ])
    );

    const updatedIdentityTraits: IdentityPrefsTraits = {
      publicAliases: mergedPublicAliases,
      privateAliases: existingTraits.privateAliases ?? [],
      allowAutoIntimate:
        typeof existingTraits.allowAutoIntimate === 'boolean'
          ? existingTraits.allowAutoIntimate
          : profile.allowAutoIntimate,
    };

    // Upsert user entity via MemoryClient SDK
    await memory.upsertUserEntity(obs.authorId, {
      traits: {
        ...(existing?.traits ?? {}),
        identity: updatedIdentityTraits,
      },
    });

    log.debug(
      prepareLog('Reflector', {
        userId: obs.authorId,
        publicAliases: mergedPublicAliases,
        success: true,
        message: 'Reflector: Synced identity traits'
      })
    );
  } catch (e) {
    log.warn(
      prepareLog('Reflector', {
        err: e instanceof Error ? e.message : String(e),
        userId: obs.authorId,
        success: false,
        message: 'Reflector: Failed to sync identity traits'
      })
    );
  }
}
