# Sovereign / Overseer Runtime Audit (Windows)

## 1) Process & Port Truth Table (commands to run)
- Use PowerShell to see owners of 3000/3001/3200 (IPv4 vs IPv6):
  ```powershell
  $ports = 3000,3001,3200
  foreach ($p in $ports) {
    "`n=== PORT $p ==="
    $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
    if (-not $conns) { Write-Host "(no listeners)"; continue }
    $conns | Select-Object LocalAddress,LocalPort,State,OwningProcess | Format-Table -AutoSize
    $pids = $conns.OwningProcess | Select-Object -Unique
    foreach ($pid in $pids) {
      Get-Process -Id $pid -ErrorAction SilentlyContinue |
        Select-Object Id,ProcessName,Path,StartTime | Format-List
    }
  }
  ```
- Current evidence: the above command returned **“(no listeners)”** for all three ports, meaning the services were not bound when tested (see terminal output). This explains timeouts to 3001.
- Host binding defaults:
  - Overseer binds explicitly to **127.0.0.1** only: [core/overseer/src/main.ts#L782-L786](core/overseer/src/main.ts#L782-L786).
  - Sovereign binds to **0.0.0.0**: [clients/command/sovereign/src/server.ts#L403-L408](clients/command/sovereign/src/server.ts#L403-L408).
  - Vi host is configurable; built output shows Fastify listen using `config.server.host` (dist) — not confirmed in this audit (see [core/vi/dist/runtime/server.js#L982](core/vi/dist/runtime/server.js#L982)).
- IPv6 consideration: not yet validated; if localhost resolves to ::1 and the server binds 127.0.0.1, requests to localhost can hang. Tests with **127.0.0.1** are required to rule this out.

## 2) Sovereign Startup Path
- Entry: `npm run dev` → `tsx src/server.ts` per [clients/command/sovereign/package.json#L6-L12](clients/command/sovereign/package.json#L6-L12).
- Server created at top of [clients/command/sovereign/src/server.ts](clients/command/sovereign/src/server.ts#L1-L12); `app.listen(PORT, '0.0.0.0', ...)` at [L403-L408](clients/command/sovereign/src/server.ts#L403-L408).
- No top-level awaits; startup is synchronous. The only long-lived timer is a `setInterval` heartbeat at [L426-L429](clients/command/sovereign/src/server.ts#L426-L429) which does not block.

## 3) Request Handling & Route Order (Sovereign)
Route registration order in [clients/command/sovereign/src/server.ts](clients/command/sovereign/src/server.ts):
1. CORS / JSON / URL-encoded / static [L12-L17](clients/command/sovereign/src/server.ts#L12-L17)
2. Logging middleware [L19-L27](clients/command/sovereign/src/server.ts#L19-L27)
3. `/health` [L29-L32](clients/command/sovereign/src/server.ts#L29-L32)
4. `/api/chat` proxy to Vi [L34-L147](clients/command/sovereign/src/server.ts#L34-L147)
5. `/api/evidence` [L149-L214](clients/command/sovereign/src/server.ts#L149-L214)
6. `/api/events/stream` SSE [L216-L257](clients/command/sovereign/src/server.ts#L216-L257)
7. `/overseer/*` proxy [L259-L308](clients/command/sovereign/src/server.ts#L259-L308) — **registered before** SPA fallback
8. `/api/debug-identity` [L310-L346](clients/command/sovereign/src/server.ts#L310-L346)
9. SPA fallback `app.get('*')` [L348-L357](clients/command/sovereign/src/server.ts#L348-L357)
10. Error handler [L359-L365](clients/command/sovereign/src/server.ts#L359-L365)
11. `app.listen` [L403-L408](clients/command/sovereign/src/server.ts#L403-L408)

Because `/overseer/*` is defined before the catch-all, requests should reach the proxy if the process is actually bound.

## 4) Sovereign /overseer Proxy Implementation
- Proxy handler: [clients/command/sovereign/src/server.ts#L259-L308](clients/command/sovereign/src/server.ts#L259-L308).
- Target URL: `OVERSEER_URL` default `http://localhost:3200` [L8-L10](clients/command/sovereign/src/server.ts#L8-L10); path is `req.url` preserving `/overseer/...` [L265-L271](clients/command/sovereign/src/server.ts#L265-L271).
- Method, headers forwarded; `host` and `content-length` are reset [L273-L280](clients/command/sovereign/src/server.ts#L273-L280).
- Body piping only for POST/PUT/PATCH; others `proxyReq.end()` [L302-L307](clients/command/sovereign/src/server.ts#L302-L307).
- Error handling: `error` → 503 JSON, `timeout` → 504 JSON [L282-L299](clients/command/sovereign/src/server.ts#L282-L299). No missing `res.end` paths; proxy response is piped to client [L278-L281](clients/command/sovereign/src/server.ts#L278-L281).

## 5) Overseer Server Behavior
- Entry: `core/overseer/src/main.ts`.
- Listen: Fastify `listen({ port: PORT, host: '127.0.0.1' })` [core/overseer/src/main.ts#L782-L786](core/overseer/src/main.ts#L782-L786). Binding is IPv4 loopback only.
- Routes:
  - `/health` [core/overseer/src/main.ts#L646-L651](core/overseer/src/main.ts#L646-L651)
  - `/overseer/ecosystem/status` [core/overseer/src/main.ts#L692-L696](core/overseer/src/main.ts#L692-L696)
  - `/overseer/audit/log` [core/overseer/src/main.ts#L707-L716](core/overseer/src/main.ts#L707-L716)
  - God Console UI served at `/` [core/overseer/src/main.ts#L723-L733](core/overseer/src/main.ts#L723-L733)
- CORS: not configured here (Fastify default). Sovereign calls Overseer from the same host/port so CORS isn’t relevant to the proxy.

## 6) Corruption / Foot-gun Scan
- No patch markers (`@@`, conflict markers) found in Sovereign source now (search across clients/command/sovereign showed none).
- Sovereign binds 0.0.0.0 while Overseer binds 127.0.0.1. If requests use `localhost` and the resolver prefers IPv6 (::1), Overseer would be unreachable; testing with 127.0.0.1 is advised (see Step 3 commands above).
- Port conflicts: recent `Get-NetTCPConnection` showed **no listeners** on 3000/3001/3200, so timeouts stem from services not bound at test time.

## 7) Minimal Repro Tests (place in ops/tests when allowed)
Express (port 3001):
```javascript
const express = require('express');
const app = express();
app.get('/test', (_req, res) => res.json({ ok: true }));
app.listen(3001, '0.0.0.0', () => console.log('express 3001 ready'));
```
Fastify (port 3001):
```javascript
const fastify = require('fastify')();
fastify.get('/test', async () => ({ ok: true }));
fastify.listen({ port: 3001, host: '0.0.0.0' }, () => console.log('fastify 3001 ready'));
```
Run (in separate window):
```powershell
node express-3001.js
# or
node fastify-3001.js
```
Verify:
```powershell
irm http://127.0.0.1:3001/test -TimeoutSec 3
```

## Key Findings
1) Services were not bound on 3000/3001/3200 at time of test (no listeners). This alone explains request timeouts to Sovereign.
2) Overseer binds to 127.0.0.1 only; Sovereign proxies to localhost:3200. If clients resolve localhost to ::1, Overseer becomes unreachable. Testing with 127.0.0.1 is required.
3) Sovereign route order is correct; `/overseer/*` is registered before the SPA fallback. If the process is listening, requests should hit the proxy.
4) Proxy implementation handles errors/timeouts and ends responses; no evident hang inside the code.
5) No current code corruption markers in Sovereign; prior “@@” artifacts appear resolved.

## Next Actions (evidence-driven)
- Re-run the port ownership script and keep results; start each service in its own dedicated window, then retest via 127.0.0.1 to separate IPv6/localhost issues.
- If 127.0.0.1 works but localhost hangs, adjust bindings (e.g., bind Overseer to :: or use 127.0.0.1 everywhere).
- If ports still show no listeners, capture process startup output/errors for each service window.

## IPv6 Localhost Root Cause Verification
Hypothesis: `localhost` resolves to IPv6 (`::1`) while Overseer binds IPv4-only (`127.0.0.1`), causing Sovereign’s proxy to fail. Prove or disprove with the commands below, then apply the minimal fix.

### Proof commands (run in PowerShell)
```powershell
[System.Net.Dns]::GetHostAddresses("localhost") | % IPAddressToString
netsh interface ipv6 show prefixpolicies
Get-NetTCPConnection -LocalPort 3200 -ErrorAction SilentlyContinue | ft LocalAddress,LocalPort,State,OwningProcess -AutoSize
curl.exe -v http://localhost:3200/health
curl.exe -v http://127.0.0.1:3200/health
```

### Decision logic
- If `localhost` → `::1` and `localhost:3200/health` fails while `127.0.0.1:3200/health` succeeds, the IPv6/IPv4 mismatch is the bug.
- If both fail, Overseer is not listening or is on a different port.
- If both succeed but Sovereign proxy still fails, fix Sovereign’s proxy base URL.

### Minimal fix (preferred)
- Set Sovereign default to IPv4 loopback: change `OVERSEER_URL` default to `http://127.0.0.1:3200` in [clients/command/sovereign/src/server.ts#L8-L10](clients/command/sovereign/src/server.ts#L8-L10) and align any internal fetch/base URLs that point to Overseer.
- Keep Sovereign binding on `0.0.0.0`; Overseer may stay on `127.0.0.1`.

### Alternative fix (wider blast radius)
- Bind Overseer to `0.0.0.0` or `::` to accept both families. Only do this if IPv4-only binding is undesirable.

### Post-fix verification sequence
1. Start Overseer.
2. Start Sovereign.
3. `curl.exe http://127.0.0.1:3001/overseer/ecosystem/status`
4. Load Sovereign UI and confirm Overseer-backed panels populate.

### What to capture
- Outputs of the proof commands above.
- The specific file/line where `OVERSEER_URL` was set to `127.0.0.1` (see link above) or the updated Overseer listen host if you choose the alternative fix.
