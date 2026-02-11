/**
 * k6 Load Testing for Vi Runtime (Phase 8)
 * 
 * Scenarios:
 * - smoke: Minimal load validation
 * - load: Normal traffic pattern
 * - stress: Find breaking point
 * - spike: Sudden traffic surge
 * - soak: Sustained load over time
 * 
 * Usage:
 *   k6 run --env SCENARIO=load load-test.js
 *   k6 run --env SCENARIO=stress --env BASE_URL=https://vi.prod.tentai.dev load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const chatDuration = new Trend('chat_duration');
const streamDuration = new Trend('stream_duration');
const autonomyChimes = new Counter('autonomy_chimes');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SCENARIO = __ENV.SCENARIO || 'load';

// Test scenarios
const scenarios = {
  smoke: {
    executor: 'constant-vus',
    vus: 1,
    duration: '1m',
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 10 },  // Ramp up
      { duration: '5m', target: 10 },  // Steady state
      { duration: '2m', target: 0 },   // Ramp down
    ],
    gracefulRampDown: '30s',
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 20 },
      { duration: '5m', target: 20 },
      { duration: '2m', target: 50 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 100 },
      { duration: '5m', target: 100 },
      { duration: '5m', target: 0 },
    ],
    gracefulRampDown: '1m',
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },   // Normal load
      { duration: '10s', target: 100 },  // Spike!
      { duration: '1m', target: 100 },   // Sustain spike
      { duration: '30s', target: 10 },   // Recovery
      { duration: '1m', target: 10 },    // Steady
      { duration: '30s', target: 0 },    // Ramp down
    ],
    gracefulRampDown: '30s',
  },
  soak: {
    executor: 'constant-vus',
    vus: 20,
    duration: '30m',
  },
};

export const options = {
  scenarios: {
    [SCENARIO]: scenarios[SCENARIO],
  },
  thresholds: {
    'http_req_duration': ['p(95)<3000'], // 95% of requests must complete within 3s
    'http_req_failed': ['rate<0.05'],    // Error rate must be below 5%
    'errors': ['rate<0.05'],
    'chat_duration': ['p(95)<3000'],
    'stream_duration': ['p(95)<5000'],
  },
  setupTimeout: '60s',
  teardownTimeout: '60s',
};

// Test data
const testMessages = [
  'What is the meaning of life?',
  'Tell me a joke',
  'Explain quantum physics in simple terms',
  'What are the benefits of exercise?',
  'How does photosynthesis work?',
  'What is the capital of France?',
  'Recommend a good book to read',
  'How do I make pasta carbonara?',
  'What is machine learning?',
  'Explain the water cycle',
];

function getRandomMessage() {
  return testMessages[Math.floor(Math.random() * testMessages.length)];
}

// Setup: Health check
export function setup() {
  const healthRes = http.get(`${BASE_URL}/v1/health`);
  
  check(healthRes, {
    'health check passed': (r) => r.status === 200,
  });
  
  if (healthRes.status !== 200) {
    throw new Error(`Service unhealthy: ${healthRes.status}`);
  }
  
  console.log(`Starting ${SCENARIO} test against ${BASE_URL}`);
  return { startTime: Date.now() };
}

// Main test function
export default function (data) {
  const sessionId = `k6-session-${__VU}-${__ITER}`;
  
  // Test 1: Standard chat request
  testChatRequest(sessionId);
  
  sleep(1);
  
  // Test 2: Streaming chat (every 3rd iteration)
  if (__ITER % 3 === 0) {
    testStreamingChat(sessionId);
    sleep(1);
  }
  
  // Test 3: Metrics endpoint (every 10th iteration)
  if (__ITER % 10 === 0) {
    testMetrics();
    sleep(0.5);
  }
}

function testChatRequest(sessionId) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({
    message: getRandomMessage(),
    sessionId: sessionId,
    context: {
      recentHistory: [],
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Vi-Test-Mode': 'true',
    },
    tags: { name: 'ChatRequest' },
  };
  
  const res = http.post(`${BASE_URL}/v1/chat`, payload, params);
  
  const duration = Date.now() - startTime;
  chatDuration.add(duration);
  
  const success = check(res, {
    'chat status is 200': (r) => r.status === 200,
    'chat has output': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.output && body.output.length > 0;
      } catch {
        return false;
      }
    },
    'chat has recordId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.recordId;
      } catch {
        return false;
      }
    },
  });
  
  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
    
    // Track autonomy chimes if present
    try {
      const body = JSON.parse(res.body);
      if (body.autonomy?.chimes?.length > 0) {
        autonomyChimes.add(body.autonomy.chimes.length);
      }
    } catch {}
  }
}

function testStreamingChat(sessionId) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({
    message: getRandomMessage(),
    sessionId: sessionId,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-Vi-Test-Mode': 'true',
    },
    tags: { name: 'ChatStream' },
    timeout: '30s',
  };
  
  const res = http.post(`${BASE_URL}/v1/chat/stream`, payload, params);
  
  const duration = Date.now() - startTime;
  streamDuration.add(duration);
  
  const success = check(res, {
    'stream status is 200': (r) => r.status === 200,
    'stream has SSE data': (r) => r.body && r.body.includes('data:'),
  });
  
  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

function testMetrics() {
  const res = http.get(`${BASE_URL}/v1/metrics`, {
    tags: { name: 'Metrics' },
  });
  
  check(res, {
    'metrics status is 200': (r) => r.status === 200,
    'metrics has chat requests': (r) => r.body.includes('vi_chat_requests_total'),
  });
}

// Teardown: Report results
export function teardown(data) {
  const duration = ((Date.now() - data.startTime) / 1000 / 60).toFixed(2);
  console.log(`Test completed in ${duration} minutes`);
}

/*
 * Expected Performance Baselines (local development):
 * 
 * Scenario: smoke (1 VU, 1 minute)
 *   - p95 latency: <1s
 *   - Error rate: 0%
 *   - Throughput: ~60 req/min
 * 
 * Scenario: load (10 VUs, 9 minutes)
 *   - p95 latency: <2s
 *   - Error rate: <1%
 *   - Throughput: ~600 req/min
 * 
 * Scenario: stress (up to 100 VUs, 26 minutes)
 *   - Breaking point: Typically 50-80 VUs on standard hardware
 *   - p95 latency at breaking point: >5s
 *   - Error rate at breaking point: 5-10%
 * 
 * Scenario: spike (10→100 VUs spike, 3.5 minutes)
 *   - p95 latency during spike: <5s (should recover)
 *   - Error rate during spike: <5%
 *   - Recovery time: <30s after spike ends
 * 
 * Scenario: soak (20 VUs, 30 minutes)
 *   - p95 latency should remain stable (<2s)
 *   - Memory should not continuously grow (no leaks)
 *   - Error rate: <1%
 * 
 * Production targets (assuming scaled infrastructure):
 *   - p95 latency: <2s under normal load
 *   - p99 latency: <5s
 *   - Error rate: <0.1%
 *   - Availability: >99.9%
 *   - Concurrent users: 1000+ VUs
 */
