# Alert Runbooks

Quick reference for responding to Vi runtime alerts.

---

## Service Availability

### ViServiceDown

**Severity:** Critical  
**Threshold:** Service unreachable for 1+ minutes

**Investigation:**
1. Check if process is running: `systemctl status vi` or `docker ps | grep vi`
2. Check recent logs: `journalctl -u vi -n 100` or `docker logs vi --tail 100`
3. Verify database connectivity: `psql -h localhost -U postgres -d vi -c 'SELECT 1'`
4. Check disk space: `df -h`
5. Check memory: `free -h`

**Resolution:**
- If crashed: restart service
- If OOM: increase memory limits or investigate memory leak
- If disk full: clear logs/temp files, expand volume
- If DB down: check PostgreSQL status and restart if needed

**Escalation:** Page on-call engineer after 5 minutes down

---

### ViHighErrorRate

**Severity:** Warning  
**Threshold:** >5% of requests failing for 2+ minutes

**Investigation:**
1. Check error breakdown: `curl http://localhost:3000/v1/metrics | grep error`
2. Review recent error logs: Filter for `"level":50` (error level)
3. Check LLM provider status (OpenAI/Anthropic status pages)
4. Verify database query performance: `SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10`

**Resolution:**
- If LLM provider issue: switch to fallback provider or enable retry logic
- If DB performance: identify slow queries and add indexes
- If specific endpoint: check recent code deployments, consider rollback

**Escalation:** Escalate to engineering team if >10 minutes

---

### ViCriticalErrorRate

**Severity:** Critical  
**Threshold:** >15% of requests failing for 1+ minutes

**Investigation:**
Same as ViHighErrorRate but prioritize immediate action

**Resolution:**
1. Immediate rollback if recent deployment
2. If external dependency: fail fast and return cached/degraded responses
3. If database: consider read-only mode or replica failover

**Escalation:** Immediate page

---

## Performance

### ViHighLatency

**Severity:** Warning  
**Threshold:** p95 >3s for 5+ minutes

**Investigation:**
1. Check current load: `curl http://localhost:3000/v1/metrics | grep chat_requests_total`
2. Review slow traces in OpenTelemetry/Jaeger
3. Check database connection pool: Look for connection exhaustion
4. Monitor memory: High GC pressure can cause latency spikes

**Resolution:**
- If high load: scale horizontally (add instances)
- If DB slow: check query plans, add indexes, or increase connection pool
- If memory pressure: restart to clear, then investigate leak
- If LLM provider slow: reduce timeout or switch providers

**Escalation:** Escalate if p95 >5s for 10 minutes

---

### ViCriticalLatency

**Severity:** Critical  
**Threshold:** p95 >10s for 2+ minutes

**Investigation:**
Same as ViHighLatency but expedited

**Resolution:**
1. Immediate scale-out if infrastructure capacity available
2. Enable circuit breaker for slow dependencies
3. Consider degraded mode (simpler responses, cached results)

**Escalation:** Immediate page

---

## Capacity

### ViHighRateLimiting

**Severity:** Warning  
**Threshold:** >10% of requests rate limited for 5+ minutes

**Investigation:**
1. Check if legitimate spike or attack: Review request patterns and IPs
2. Verify rate limit configuration: `grep RATE_LIMIT .env`
3. Check if specific users hitting limits: Query rate limit logs

**Resolution:**
- If legitimate traffic: increase rate limits or scale capacity
- If attack/abuse: tighten rate limits, block IPs, enable CAPTCHA
- If misconfiguration: adjust per-user limits

**Escalation:** Escalate if >20% rate limited

---

### ViAutonomyChimeStorm

**Severity:** Warning  
**Threshold:** >5 chimes/sec for 3+ minutes

**Investigation:**
1. Check autonomy policy configuration
2. Review event types triggering chimes
3. Check if legitimate high-urgency scenario or policy bug

**Resolution:**
- Adjust autonomy policy threshold (increase from default 0.45)
- Tune event scoring weights (reduce urgency/importance factors)
- Temporarily disable autonomy if causing user experience issues

**Escalation:** Non-critical, investigate during business hours

---

## Resources

### ViHighMemoryUsage

**Severity:** Warning  
**Threshold:** >2GB RSS for 5+ minutes

**Investigation:**
1. Heap snapshot: `node --inspect` and connect Chrome DevTools
2. Check for memory leaks: Look for growing heap over time
3. Review recent changes that might affect memory

**Resolution:**
- If leak: identify and patch, then restart
- If legitimate growth: increase memory limits or optimize code
- If burst: restart to clear, then monitor

**Escalation:** Escalate if trending toward OOM

---

### ViCriticalMemoryUsage

**Severity:** Critical  
**Threshold:** >4GB RSS for 2+ minutes

**Investigation:**
Expedited version of ViHighMemoryUsage

**Resolution:**
1. Immediate restart if approaching OOM
2. Scale out to distribute load
3. Emergency memory limit increase if infrastructure supports

**Escalation:** Immediate page

---

## Database

### ViDatabaseConnectionPoolExhausted

**Severity:** Warning  
**Threshold:** >80 active connections for 3+ minutes

**Investigation:**
1. Check connection pool configuration: `grep POOL_SIZE .env`
2. Identify long-running queries: `SELECT * FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start`
3. Check for connection leaks (not released properly)

**Resolution:**
- Increase connection pool size if DB can handle it
- Kill long-running queries if stuck
- Restart app to clear leaked connections
- Fix connection leak in code

**Escalation:** Escalate if queries start failing

---

### ViSlowQueries

**Severity:** Warning  
**Threshold:** Average query time >1000ms for 5+ minutes

**Investigation:**
1. Identify slow queries: `SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10`
2. Review query plans: `EXPLAIN ANALYZE <slow query>`
3. Check for missing indexes or sequential scans

**Resolution:**
- Add missing indexes
- Optimize query (reduce joins, add WHERE clauses)
- Consider query result caching
- Increase DB resources if consistently slow

**Escalation:** Escalate if impacting user experience

---

## SLO Breaches

### ViSLOAvailabilityBreach

**Severity:** Critical  
**Threshold:** <99.9% availability over 30-minute window

**Investigation:**
Follow ViHighErrorRate investigation steps

**Resolution:**
Priority: restore service availability immediately
- Rollback recent changes
- Failover to backup region/instance
- Enable degraded mode if needed

**Escalation:** Immediate page + executive notification

---

### ViSLOLatencyBreach

**Severity:** Warning  
**Threshold:** p95 >2s over 30-minute window

**Investigation:**
Follow ViHighLatency investigation steps

**Resolution:**
Priority: reduce latency to meet SLO
- Scale horizontally
- Optimize hot paths
- Enable caching for frequently accessed data

**Escalation:** Escalate to engineering lead if sustained breach

---

## General Response Checklist

1. ✅ Acknowledge alert
2. ✅ Check service health dashboard
3. ✅ Review recent deployments/changes
4. ✅ Follow runbook investigation steps
5. ✅ Apply resolution (or escalate)
6. ✅ Document incident in post-mortem if critical
7. ✅ Update runbook with learnings
