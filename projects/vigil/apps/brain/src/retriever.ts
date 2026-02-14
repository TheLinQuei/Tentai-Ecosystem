import type { MemoryClient } from '@vi/sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { Observation } from './observer.js';
import { prepareLog } from './utils/logContract.js';

export interface RetrievedContext {
  recent: Array<{ content: string; timestamp: string }>;
  relevant: Array<{ content: string; score: number }>;
  userEntity?: {
    id: string;
    aliases: string[];
    traits: Record<string, any>;
    display: string;
  };
}

export async function fetchContext(
  obs: Observation,
  memory: MemoryClient,
  log: FastifyBaseLogger
): Promise<RetrievedContext> {
  const start = Date.now();
  
  try {
    // Use hybrid search endpoint (v2 Memory API)
    const MEMORY_API = process.env.MEMORY_API || 'http://localhost:4311';
    const res = await fetch(`${MEMORY_API}/v1/mem/searchHybrid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: obs.content, limit: 10 })
    });

    if (!res.ok) {
      throw new Error(`Memory API returned ${res.status}`);
    }

    const data: any = await res.json();
    const results = data.items || data.results || [];

    const elapsed = Date.now() - start;
    log.info(
      prepareLog('Retriever', {
        observationId: obs.id,
        query: obs.content,
        resultCount: results.length,
        topScore: results[0]?.score ?? 0,
        durationMs: elapsed,
        message: `📚 Retriever: Fetched context (${elapsed}ms)`
      })
    );

    // Phase D.3: Hydrate userEntity from Memory
    let userEntity: RetrievedContext['userEntity'] | undefined = undefined;

    try {
      // Canonical entity ID format expected by integration tests: user:<id>
      const canonicalId = obs.authorId.startsWith('user:')
        ? obs.authorId
        : `user:${obs.authorId.replace(/^user[-:]/,'').replace(/[^0-9a-zA-Z]/g,'')}`;
      const raw: any = await memory.getUserEntity(canonicalId);
      if (raw) {
        userEntity = {
          id: raw.id,
          aliases: raw.aliases ?? [],
          traits: raw.traits ?? null,
          display: raw.aliases?.[0] ?? obs.authorId,
        };
      }
    } catch (e) {
      log.warn(prepareLog('Retriever', {
        err: e instanceof Error ? e.message : String(e),
        observationId: obs.id,
        message: 'Retriever: Failed to fetch user entity'
      }));
    }

    return {
      recent: results.slice(0, 5).map((r: any) => ({
        content: r.text || '',
        timestamp: r.timestamp || new Date().toISOString(),
      })),
      relevant: results.map((r: any) => ({
        content: r.text || '',
        score: r.score || 0,
      })),
      userEntity,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(prepareLog('Retriever', {
      err: message,
      observationId: obs.id,
      query: obs.content,
      message: 'Context retrieval failed'
    }));
    return { recent: [], relevant: [] };
  }
}
