/**
 * OpenTelemetry Tracing Setup (Phase 8)
 * 
 * Provides distributed tracing for Vi runtime operations.
 * Traces cognition pipeline stages, tool executions, and HTTP requests.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
// import { Resource } from '@opentelemetry/resources';  // Not using due to type issues
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;

export function initializeTracing(serviceName = '@tentai/vi-core'): void {
  if (sdk) {
    console.warn('Tracing already initialized');
    return;
  }

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  try {
    // Skip resource creation due to import type issues - use minimal config
    /*
    const resource = new OTResource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
    });
    */

    let traceExporter = new ConsoleSpanExporter();
    if (otlpEndpoint) {
      try {
        const parsed = new URL(otlpEndpoint);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error(`Unsupported OTLP protocol: ${parsed.protocol}`);
        }
        traceExporter = new OTLPTraceExporter({ url: otlpEndpoint });
      } catch (error) {
        console.warn({ error, otlpEndpoint }, 'Invalid OTEL exporter endpoint; using console exporter');
      }
    }

    sdk = new NodeSDK({
      // resource,
      spanProcessor: new SimpleSpanProcessor(traceExporter),
      instrumentations: [
        new HttpInstrumentation(),
        new FastifyInstrumentation(),
      ],
    });

    sdk.start();

    process.on('SIGTERM', () => {
      sdk?.shutdown()
        .then(() => console.log('Tracing terminated'))
        .catch((error) => console.error('Error terminating tracing', error))
        .finally(() => process.exit(0));
    });
  } catch (error) {
    console.warn('Failed to initialize tracing:', error);
  }

  console.log(`✓ OpenTelemetry tracing initialized (exporter: ${otlpEndpoint || 'console'})`);
}

export function shutdownTracing(): Promise<void> {
  return sdk?.shutdown() ?? Promise.resolve();
}

/**
 * Create a new span for manual instrumentation
 */
export function createSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  const tracer = trace.getTracer('@tentai/vi-core');
  const span = tracer.startSpan(name);
  
  if (attributes) {
    span.setAttributes(attributes);
  }
  
  return span;
}

/**
 * Execute a function within a traced context
 */
export async function traceOperation<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const span = createSpan(name, attributes);
  const ctx = trace.setSpan(context.active(), span);

  try {
    const result = await context.with(ctx, () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message || 'Unknown error',
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add event to current active span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Set attribute on current active span
 */
export function setSpanAttribute(key: string, value: string | number | boolean): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}
