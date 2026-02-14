/*
 * Memory Load & Retrieval Benchmark
 * ---------------------------------
 * Ingest N synthetic episodic events into the Memory API and benchmark hybrid search latency & precision@10.
 *
 * Usage (PowerShell):
 *   $env:COUNT=10000; $env:MEMORY_API=http://localhost:4311; pnpm exec tsx scripts/perf/memoryLoadTest.ts
 *
 * Environment Variables:
 *   MEMORY_API  - Base URL of Memory API (default http://localhost:4311)
 *   COUNT       - Number of events to ingest (default 10000)
 *   BATCH       - Batch size per parallel wave (default 200)
 *   CONCURRENCY - Parallel batches in flight (default 5)
 *
 * Methodology:
 *   - Generate clustered synthetic documents across topic families ("astronomy", "cooking", etc.).
 *   - Write events via /v1/mem/upsert with scope=user and randomized scopeId per cluster.
 *   - After ingestion, run representative queries (one per topic) against /v1/mem/searchHybrid.
 *   - Record per-query latency; compute p50/p95.
 *   - Compute precision@10 approximated: fraction of top 10 whose assigned topic == query topic.
 *
 * NOTE: This is an initial harness; real precision requires labeled relevance judgments.
 */

const MEMORY_API = process.env.MEMORY_API || 'http://localhost:4311';
const TOTAL = Number(process.env.COUNT || 10000);
const BATCH = Number(process.env.BATCH || 200);
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);

interface SyntheticDoc { topic: string; text: string; scopeId: string; }

const TOPICS = [
  'astronomy', 'cooking', 'history', 'gaming', 'music', 'literature', 'fitness', 'technology', 'travel', 'psychology'
];

function makeDocs(count: number): SyntheticDoc[] {
  const docs: SyntheticDoc[] = [];
  for (let i = 0; i < count; i++) {
    const topic = TOPICS[i % TOPICS.length];
    const scopeId = `user-${(i % 500).toString().padStart(4, '0')}`; // repeat scopeIds to simulate user histories
    // Slight variation tokens to help embeddings & BM25 differentiate
    const variants = [
      `Deep dive into ${topic} concepts and practical applications`,
      `Casual notes about ${topic} trends today`,
      `Observational log related to ${topic} project progress`,
      `Opinionated reflection on modern ${topic} challenges`,
      `Checklist for improving ${topic} skills and workflow`
    ];
    const text = `${topic} :: ${variants[i % variants.length]} (#${i})`;
    docs.push({ topic, text, scopeId });
  }
  return docs;
}

async function upsert(doc: SyntheticDoc) {
  const payload = { scope: 'user', scopeId: doc.scopeId, text: doc.text, meta: { topic: doc.topic } };
  const res = await fetch(`${MEMORY_API}/v1/mem/upsert`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Upsert failed ${res.status}: ${t}`);
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function ingestAll(docs: SyntheticDoc[]) {
  console.log(`[INGEST] Starting ingestion of ${docs.length} docs (batch=${BATCH}, concurrency=${CONCURRENCY})`);
  const batches = chunk(docs, BATCH);
  let completed = 0;
  const start = Date.now();
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map(async (b) => {
      for (const d of b) {
        try { await upsert(d); } catch (e) { console.error('[INGEST] Error:', (e as any).message); }
      }
    }));
    completed += slice.reduce((acc, b) => acc + b.length, 0);
    if (completed % 1000 === 0) {
      console.log(`[INGEST] ${completed}/${docs.length} (${(completed / docs.length * 100).toFixed(1)}%)`);
    }
  }
  const elapsed = Date.now() - start;
  console.log(`[INGEST] Complete in ${(elapsed/1000).toFixed(2)}s (${(docs.length / (elapsed/1000)).toFixed(1)} docs/sec)`);
}

async function queryHybrid(q: string) {
  const body = { q, limit: 10 };
  const t0 = performance.now();
  const res = await fetch(`${MEMORY_API}/v1/mem/searchHybrid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t1 = performance.now();
  if (!res.ok) throw new Error(`searchHybrid failed ${res.status}`);
  const json: any = await res.json();
  return { ms: t1 - t0, items: json.items || json.results || [] };
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

async function benchmark() {
  // Representative queries: use topic keyword
  console.log('[BENCH] Running topic queries...');
  const latencies: number[] = [];
  interface Result { topic: string; precision10: number; latencyMs: number; }
  const results: Result[] = [];
  for (const topic of TOPICS) {
    const { ms, items } = await queryHybrid(topic);
    latencies.push(ms);
    // Approximate precision@10: count items whose text starts with topic prefix
    const matchCount = items.filter((it: any) => typeof it.text === 'string' && it.text.startsWith(topic + ' ::')).length;
    const precision10 = matchCount / 10;
    results.push({ topic, precision10, latencyMs: ms });
    console.log(`[BENCH] ${topic.padEnd(12)} → latency=${ms.toFixed(1)}ms precision@10=${precision10.toFixed(2)}`);
  }
  const p50 = quantile(latencies, 0.50);
  const p95 = quantile(latencies, 0.95);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  console.log('\n[BENCH] Summary');
  console.log(`  Queries: ${latencies.length}`);
  console.log(`  Avg: ${avg.toFixed(1)}ms  P50: ${p50.toFixed(1)}ms  P95: ${p95.toFixed(1)}ms`);
  const meanPrecision = results.reduce((a, r) => a + r.precision10, 0) / results.length;
  console.log(`  Mean precision@10: ${meanPrecision.toFixed(2)}`);
  return { p50, p95, avg, meanPrecision, perTopic: results };
}

(async () => {
  try {
    // Quick health pre-check
    const health = await fetch(`${MEMORY_API}/health`).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!health) {
      console.error(`[ERROR] Memory API not reachable at ${MEMORY_API}`);
      process.exit(1);
    }
    console.log('[HEALTH] Memory API OK');

    const docs = makeDocs(TOTAL);
    await ingestAll(docs);
    const bench = await benchmark();

    console.log('\n[RESULT] JSON summary:');
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), total: TOTAL, batch: BATCH, concurrency: CONCURRENCY, ...bench }, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('[FATAL]', (e as any).stack || (e as any).message || e);
    process.exit(1);
  }
})();
