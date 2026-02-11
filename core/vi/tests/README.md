# Vi Test Suite

Comprehensive test suite for the Vi runtime system.

## Test Categories

### Unit Tests (`tests/unit/`)
Fast, isolated tests for individual components.

```bash
npm run test:unit
```

**Coverage:**
- Configuration loading and validation
- Policy engine rules
- Repository CRUD operations
- Memory consolidation logic
- Planning schema validation
- Provider configuration
- Reflection pipeline
- Self-model regeneration

### Integration Tests (`tests/integration/`)
Tests for complete workflows and component interactions.

```bash
npm run test:integration
```

**Coverage:**
- Authentication flow (register, login, token management)
- Chat endpoint (full cognition pipeline)
- Conversation CRUD operations
- Memory injection and retrieval
- Policy enforcement
- Tool execution and grounding
- Bond system (relationship tracking)
- Event integrity and isolation

### Load Tests (`tests/load/`)
Performance and stress tests under various load conditions.

```bash
npm run test:load
```

**Tests:**
- **Chat Load:** 10-50 concurrent requests, sequential load, rate limiting
- **Memory Stress:** 10K-60K memory consolidation, duplicate detection
- **Error Recovery:** Retry logic, failure handling

**Metrics Tracked:**
- Response times (avg, min, max)
- Success rates under load
- Memory usage patterns
- Concurrent request handling
- Rate limit effectiveness

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### With UI (interactive)
```bash
npm run test:ui
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Configuration

Tests use the following environment variables:
- `DATABASE_URL` - PostgreSQL connection (default: `postgresql://postgres:postgres@localhost:5432/vi`)
- `VI_API_URL` - Vi-core API endpoint (default: `http://localhost:3100`)
- `NODE_ENV` - Set to `test` for test runs

## Writing New Tests

### Unit Test Template
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup
  });

  describe('Feature', () => {
    it('should behave correctly', () => {
      // Arrange
      // Act
      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

### Integration Test Template
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, Pool } from 'pg';

describe('Feature E2E', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should complete workflow', async () => {
    // Test complete user journey
  });
});
```

### Load Test Template
```typescript
import { describe, it, expect } from 'vitest';

describe('Performance Test', () => {
  it('should handle load', async () => {
    const startTime = Date.now();
    
    // Perform load test
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(threshold);
  }, 120000); // Extended timeout
});
```

## Continuous Integration

Tests run automatically on:
- Pull request creation
- Push to main branch
- Scheduled nightly builds

## Test Data Management

**Important:** Always clean up test data in `afterAll()` hooks to prevent database pollution.

```typescript
afterAll(async () => {
  await pool.query('DELETE FROM table WHERE id = $1', [testId]);
  await pool.end();
});
```

## Performance Benchmarks

Current performance targets:
- **Unit tests:** Complete in <5s
- **Integration tests:** Complete in <30s
- **Load tests:** Complete in <5 minutes
- **Chat response (10 concurrent):** <30s total
- **Memory consolidation (10K records):** <60s
- **Individual chat request:** <5s (p95)

## Troubleshooting

### Database Connection Errors
Ensure PostgreSQL is running:
```bash
npm run db:up
```

### Vi Server Not Running
Start the dev server:
```bash
npm run dev
```

### Rate Limit Errors in Tests
Increase timeout or reduce concurrent requests in load tests.

### Flaky Tests
Check for:
- Race conditions in async code
- Insufficient cleanup in afterEach/afterAll
- Database state dependencies
- Network timeouts

## Future Test Coverage

### Planned (Phase 3+)
- [ ] Advanced reasoning tests
- [ ] Vision/multimodal tests
- [ ] Knowledge graph tests
- [ ] Streaming response tests
- [ ] WebSocket connection tests
- [ ] Real-time collaboration tests

### Nice to Have
- [ ] Chaos engineering tests
- [ ] Security penetration tests
- [ ] Cross-browser compatibility (Sovereign)
- [ ] Mobile responsiveness tests
- [ ] Accessibility (a11y) tests

---

**Last Updated:** January 4, 2026  
**Test Coverage:** ~75% (target: 85%)
