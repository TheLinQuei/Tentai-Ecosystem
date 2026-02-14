/**
 * Prometheus-compatible metrics exporter for Vi Brain
 *
 * Tracks:
 * - Pipeline latency (histogram)
 * - Tool execution errors (counter by tool)
 * - Tool execution latency (histogram by tool)
 * - Intent confidence / correctness
 * - Observer/pipeline latency
 */

import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from 'prom-client';

interface MetricRecord {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

/**
 * Lightweight internal metrics collector (JSON-style),
 * used by logs / diagnostics. Prometheus lives in metricsRegistry below.
 */
class MetricsCollector {
  private metrics: Map<string, MetricRecord> = new Map();
  private histograms: Map<string, number[]> = new Map();

  // Counter: increment a metric
  inc(name: string, labels?: Record<string, string>, value = 1) {
    const key = this.buildKey(name, labels);
    const existing = this.metrics.get(key);
    if (existing) {
      existing.value += value;
      existing.timestamp = Date.now();
    } else {
      this.metrics.set(key, {
        name,
        type: 'counter',
        value,
        labels,
        timestamp: Date.now(),
      });
    }
  }

  // Gauge: set a metric to an absolute value
  set(name: string, value: number, labels?: Record<string, string>) {
    const key = this.buildKey(name, labels);
    this.metrics.set(key, {
      name,
      type: 'gauge',
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  // Histogram: observe a value (we store recent samples, not full buckets here)
  observe(name: string, value: number, labels?: Record<string, string>) {
    const key = this.buildKey(name, labels);
    const bucketKey = `${key}:histo`;

    const existing = this.metrics.get(key);
    if (!existing) {
      this.metrics.set(key, {
        name,
        type: 'histogram',
        value: 0,
        labels,
        timestamp: Date.now(),
      });
    }

    const arr = this.histograms.get(bucketKey) ?? [];
    arr.push(value);

    // simple sliding window: keep last 100 samples
    if (arr.length > 100) arr.shift();
    this.histograms.set(bucketKey, arr);
  }

  // Export internal metrics as a flat array
  export() {
    const out: Array<MetricRecord & { samples?: number[] }> = [];
    for (const [key, metric] of this.metrics.entries()) {
      const bucketKey = `${key}:histo`;
      const samples = this.histograms.get(bucketKey);
      out.push({
        ...metric,
        ...(samples ? { samples: [...samples] } : {}),
      });
    }
    return out;
  }

  private buildKey(name: string, labels?: Record<string, string>) {
    if (!labels || Object.keys(labels).length === 0) return name;
    const parts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`);
    return `${name}{${parts.join(',')}}`;
  }
}

/**
 * === Prometheus Registry ===
 *
 * Single global registry for all Brain metrics.
 */
export const metricsRegistry = new Registry();

// Node process + GC, etc.
collectDefaultMetrics({ register: metricsRegistry });

/**
 * Internal collector – still used for JSON-style metrics and diagnostics.
 */
export const metrics = new MetricsCollector();

/**
 * Prometheus metric definitions
 */

// Requests per endpoint (can be expanded if needed)
const mRequestsTotal = new Counter({
  name: 'brain_requests_total',
  help: 'Total HTTP requests handled by Vi Brain',
  labelNames: ['route', 'method', 'status'] as const,
  registers: [metricsRegistry],
});

// Overall observer / pipeline latency
const mObserverLatencySeconds = new Histogram({
  name: 'brain_observer_latency_seconds',
  help: 'End-to-end observer pipeline latency in seconds',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
});

// Tool latency
const mToolLatencySeconds = new Histogram({
  name: 'brain_tool_latency_seconds',
  help: 'Tool execution latency in seconds',
  labelNames: ['tool'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

// Tool errors
const mToolErrorsTotal = new Counter({
  name: 'brain_tool_errors_total',
  help: 'Total tool execution errors',
  labelNames: ['tool'] as const,
  registers: [metricsRegistry],
});

// Tool correctness (0 / 1, tracked as histogram)
const mToolCorrectness = new Histogram({
  name: 'brain_tool_correctness',
  help: 'Tool correctness as 0 (fail) or 1 (success)',
  labelNames: ['tool'] as const,
  buckets: [0, 0.5, 1],
  registers: [metricsRegistry],
});

// Intent confidence & correctness
const mIntentConfidence = new Histogram({
  name: 'brain_intent_confidence',
  help: 'Intent resolution confidence scores',
  buckets: [0.1, 0.25, 0.5, 0.75, 0.9, 1.0],
  registers: [metricsRegistry],
});

const mIntentCorrectTotal = new Counter({
  name: 'brain_intent_correct_total',
  help: 'Total correctly resolved intents (where available)',
  registers: [metricsRegistry],
});

// Memory queries (hit/miss)
const mMemoryQueriesTotal = new Counter({
  name: 'brain_memory_queries_total',
  help: 'Memory query outcomes (hit/miss)',
  labelNames: ['result'] as const,
  registers: [metricsRegistry],
});

/**
 * Record a tool execution (used by executor / tool wrapper)
 */
export function recordToolExecution(tool: string, latencyMs: number, success: boolean) {
  // Internal collector
  metrics.observe('tool_latency_ms', latencyMs, { tool });
  if (!success) metrics.inc('tool_errors_total', { tool });

  const correct = success ? 1 : 0;
  metrics.observe('tool_correctness', correct, { tool });

  // Prometheus
  const seconds = latencyMs / 1000;
  mToolLatencySeconds.labels(tool).observe(seconds);
  if (!success) mToolErrorsTotal.labels(tool).inc();
  mToolCorrectness.labels(tool).observe(correct);
}

/**
 * Record a memory query result
 */
export function recordMemoryHit(hit: boolean) {
  // Internal collector
  metrics.inc('memory_queries_total', { result: hit ? 'hit' : 'miss' });

  // Prometheus
  mMemoryQueriesTotal.labels(hit ? 'hit' : 'miss').inc();
}

/**
 * Record observer / pipeline metrics
 */
export function recordObserverMetrics(opts: {
  route?: string;
  method?: string;
  status?: number;
  elapsedMs: number;
  intentConfidence?: number;
  intentCorrect?: boolean;
}) {
  const { route = 'pipeline', method = 'NATS', status = 200, elapsedMs, intentConfidence, intentCorrect } = opts;

  // Internal collector
  metrics.observe('observer_latency_ms', elapsedMs, { route, method, status: String(status) });
  if (intentConfidence !== undefined) {
    metrics.observe('intent_confidence', intentConfidence);
  }
  if (intentCorrect !== undefined) {
    metrics.inc('intent_correct_total', undefined, intentCorrect ? 1 : 0);
  }

  // Prometheus – HTTP-style requests
  mRequestsTotal.labels(route, method, String(status)).inc();
  mObserverLatencySeconds.observe(elapsedMs / 1000);
  if (intentConfidence !== undefined) {
    mIntentConfidence.observe(intentConfidence);
  }
  if (intentCorrect !== undefined && intentCorrect) {
    mIntentCorrectTotal.inc();
  }
}

/**
 * Export metrics in Prometheus text format.
 */
export async function exportPrometheusMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}
