/**
 * Prometheus Metrics Middleware
 * Phase 6: Ops Alignment - Basic observability
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getLogger } from '../telemetry/logger.js';

// Simple in-memory metrics (for production, use prom-client)
interface Metrics {
  requests_total: number;
  requests_active: number;
  requests_by_status: Map<number, number>;
  requests_by_path: Map<string, number>;
  request_duration_ms: number[];
  errors_total: number;
}

const metrics: Metrics = {
  requests_total: 0,
  requests_active: 0,
  requests_by_status: new Map(),
  requests_by_path: new Map(),
  request_duration_ms: [],
  errors_total: 0,
};

/**
 * Register metrics middleware
 */
export function registerMetricsMiddleware(app: FastifyInstance) {
  const logger = getLogger();
  // Pre-handler: Track request start
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    metrics.requests_total++;
    metrics.requests_active++;
    (request as any).startTime = Date.now();
  });

  // Post-handler: Track request completion
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    metrics.requests_active--;

    const duration = Date.now() - ((request as any).startTime || Date.now());
    metrics.request_duration_ms.push(duration);

    // Keep only last 1000 durations for p50/p95/p99
    if (metrics.request_duration_ms.length > 1000) {
      metrics.request_duration_ms.shift();
    }

    // Count by status
    const status = reply.statusCode;
    metrics.requests_by_status.set(status, (metrics.requests_by_status.get(status) || 0) + 1);

    // Count by path
    const path = request.routerPath || request.url;
    metrics.requests_by_path.set(path, (metrics.requests_by_path.get(path) || 0) + 1);

    // Count errors (4xx/5xx)
    if (status >= 400) {
      metrics.errors_total++;
    }
  });

  // Metrics endpoint
  app.get('/metrics', async (request, reply) => {
    const sorted = [...metrics.request_duration_ms].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;

    // Prometheus text format
    const lines: string[] = [
      '# HELP vi_requests_total Total number of requests',
      '# TYPE vi_requests_total counter',
      `vi_requests_total ${metrics.requests_total}`,
      '',
      '# HELP vi_requests_active Currently active requests',
      '# TYPE vi_requests_active gauge',
      `vi_requests_active ${metrics.requests_active}`,
      '',
      '# HELP vi_errors_total Total number of error responses (4xx/5xx)',
      '# TYPE vi_errors_total counter',
      `vi_errors_total ${metrics.errors_total}`,
      '',
      '# HELP vi_request_duration_ms Request duration in milliseconds',
      '# TYPE vi_request_duration_ms summary',
      `vi_request_duration_ms{quantile="0.5"} ${p50.toFixed(2)}`,
      `vi_request_duration_ms{quantile="0.95"} ${p95.toFixed(2)}`,
      `vi_request_duration_ms{quantile="0.99"} ${p99.toFixed(2)}`,
      `vi_request_duration_ms_sum ${(avg * sorted.length).toFixed(2)}`,
      `vi_request_duration_ms_count ${sorted.length}`,
      '',
    ];

    // Status code breakdown
    lines.push('# HELP vi_requests_by_status Requests by HTTP status code');
    lines.push('# TYPE vi_requests_by_status counter');
    for (const [status, count] of metrics.requests_by_status.entries()) {
      lines.push(`vi_requests_by_status{status="${status}"} ${count}`);
    }
    lines.push('');

    // Path breakdown (top 20)
    const topPaths = Array.from(metrics.requests_by_path.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    lines.push('# HELP vi_requests_by_path Requests by path (top 20)');
    lines.push('# TYPE vi_requests_by_path counter');
    for (const [path, count] of topPaths) {
      const safePath = path.replace(/"/g, '\\"');
      lines.push(`vi_requests_by_path{path="${safePath}"} ${count}`);
    }

    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return lines.join('\n');
  });

  logger.info('[Metrics] Prometheus metrics middleware registered');
}

/**
 * Get current metrics (for testing)
 */
export function getMetrics(): Metrics {
  return metrics;
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  metrics.requests_total = 0;
  metrics.requests_active = 0;
  metrics.requests_by_status.clear();
  metrics.requests_by_path.clear();
  metrics.request_duration_ms = [];
  metrics.errors_total = 0;
}
