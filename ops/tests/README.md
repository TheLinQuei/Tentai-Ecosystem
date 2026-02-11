# Vi Runtime Load Testing

Performance and load testing harness for Vi runtime using k6.

## Prerequisites

```bash
# Install k6
winget install k6
# or
choco install k6
# or download from https://k6.io/docs/getting-started/installation/
```

## Quick Start

```bash
# Start Vi runtime locally
cd core/vi
npm start

# Run smoke test (quick validation)
cd ops/tests
k6 run --env SCENARIO=smoke load-test.js

# Run load test (normal traffic pattern)
k6 run --env SCENARIO=load load-test.js

# Run against remote environment
k6 run --env SCENARIO=load --env BASE_URL=https://vi.prod.tentai.dev load-test.js
```

## Available Scenarios

### 1. Smoke Test
**Purpose:** Quick validation that basic functionality works  
**Duration:** 1 minute  
**Load:** 1 virtual user  
**Use Case:** Pre-deployment sanity check

```bash
k6 run --env SCENARIO=smoke load-test.js
```

### 2. Load Test
**Purpose:** Validate performance under expected traffic  
**Duration:** 9 minutes  
**Load:** Ramp 0→10 VUs over 2m, hold 5m, ramp down  
**Use Case:** CI/CD performance regression testing

```bash
k6 run --env SCENARIO=load load-test.js
```

### 3. Stress Test
**Purpose:** Find breaking point and system limits  
**Duration:** 26 minutes  
**Load:** Ramp 0→20→50→100 VUs progressively  
**Use Case:** Capacity planning, infrastructure sizing

```bash
k6 run --env SCENARIO=stress load-test.js
```

### 4. Spike Test
**Purpose:** Validate graceful degradation under sudden load  
**Duration:** 3.5 minutes  
**Load:** Spike from 10→100 VUs for 1 minute  
**Use Case:** Black Friday, product launch scenarios

```bash
k6 run --env SCENARIO=spike load-test.js
```

### 5. Soak Test
**Purpose:** Identify memory leaks and performance degradation  
**Duration:** 30 minutes  
**Load:** Constant 20 VUs  
**Use Case:** Production readiness validation

```bash
k6 run --env SCENARIO=soak load-test.js
```

## Metrics & Thresholds

### Default Thresholds
- **p95 latency:** <3s (95% of requests complete within 3 seconds)
- **Error rate:** <5% (fewer than 5% of requests fail)
- **Chat duration:** p95 <3s
- **Stream duration:** p95 <5s

### Custom Metrics
- `errors`: Error rate across all requests
- `chat_duration`: Time to complete `/v1/chat` requests
- `stream_duration`: Time to complete `/v1/chat/stream` requests
- `autonomy_chimes`: Count of autonomy interruptions

### Viewing Results

```bash
# Terminal output shows real-time metrics
# HTML report (requires k6 cloud or custom reporter)
k6 run --out json=results.json load-test.js

# Prometheus integration
k6 run --out experimental-prometheus-rw load-test.js
```

## Performance Baselines

### Local Development (4-core laptop, 16GB RAM)

| Scenario | p95 Latency | Error Rate | Throughput |
|----------|-------------|------------|------------|
| Smoke    | <1s         | 0%         | ~60 req/m  |
| Load     | <2s         | <1%        | ~600 req/m |
| Stress   | Breaking point at 50-80 VUs | 5-10% | Variable |
| Spike    | <5s (recovers) | <5%     | Variable   |
| Soak     | <2s (stable) | <1%       | ~1200 req/m |

### Production (scaled infrastructure)

| Metric | Target |
|--------|--------|
| p95 latency | <2s |
| p99 latency | <5s |
| Error rate | <0.1% |
| Availability | >99.9% |
| Concurrent users | 1000+ VUs |

## Test Endpoints

The harness tests the following endpoints:

1. **`POST /v1/chat`** - Standard synchronous chat requests
2. **`POST /v1/chat/stream`** - Server-sent events streaming
3. **`GET /v1/metrics`** - Prometheus metrics endpoint
4. **`GET /v1/health`** - Health check (setup only)

## Integration with CI/CD

```yaml
# Example GitHub Actions workflow
- name: Run load test
  run: |
    npm start &
    sleep 10
    k6 run --env SCENARIO=smoke ops/tests/load-test.js
    if [ $? -ne 0 ]; then
      echo "Load test failed"
      exit 1
    fi
```

## Interpreting Results

### Good Results ✅
- All thresholds pass
- p95 latency trends flat or decreasing
- Error rate near 0%
- Memory usage stable (soak test)

### Warning Signs ⚠️
- p95 latency >2s under normal load
- Error rate >1%
- Increasing latency over time (soak test)
- HTTP 429 (rate limiting) responses

### Critical Issues 🚨
- Threshold failures
- Error rate >5%
- HTTP 5xx errors
- Timeouts or connection refused errors
- Memory continuously growing (leak)

## Troubleshooting

**High latency but low error rate:**
- Check database query performance
- Profile LLM API response times
- Review connection pool settings

**High error rate:**
- Check logs for exceptions
- Verify API keys and external service availability
- Review rate limiting configuration

**Memory leaks (soak test):**
- Enable heap snapshots
- Review EventEmitter listener registration
- Check for unclosed database connections

## Advanced Usage

### Custom VU Count
```bash
k6 run --vus 50 --duration 5m load-test.js
```

### Cloud Execution
```bash
k6 cloud load-test.js
```

### Distributed Load Generation
```bash
# Run on multiple machines, aggregate results
k6 run --out statsd load-test.js
```

## Related Documentation

- [k6 Documentation](https://k6.io/docs/)
- [Vi Metrics Guide](../../core/vi/docs/metrics.md)
- [Alert Runbooks](../alerts/RUNBOOKS.md)
- [Performance Tuning](../../core/vi/docs/performance.md)
