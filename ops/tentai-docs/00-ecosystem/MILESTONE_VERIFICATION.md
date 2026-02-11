# Milestone Verification Process

**Location:** `ops/tentai-docs/00-ecosystem/`  
**Purpose:** Ensure every milestone is reproducible from a fresh checkout before the next begins.  
**Authority:** [copilot-rules.md § 11](../playbooks/copilot-rules.md#11-milestone-stability-non-negotiable)

This is **NON-NEGOTIABLE** per [copilot-rules.md](../playbooks/copilot-rules.md) §11.

---

## Why Verification Matters

- Catches undocumented dependencies early
- Prevents "works on my machine" failures
- Ensures clean hand-off between milestones
- Creates rollback anchors for emergency hotfixes

---

## Standard Verification Sequence

For any repository (e.g., core/vi):

```bash
# 1. Start completely fresh
cd <repo>
rm -rf node_modules dist package-lock.json build

# 2. Install dependencies
npm install

# 3. Type-check (must be zero errors)
npm run type-check
# Exit code: 0

# 4. Build (must succeed)
npm run build
# Exit code: 0
# Output: dist/ created

# 5. Test (if applicable)
npm run test
# Exit code: 0

# 6. Start server (if applicable)
npm start &
sleep 2

# 7. Health check (prove it's listening)
# Use the ACTUAL endpoint from the repo's config
curl http://localhost:PORT/ENDPOINT
# Exit code: 0

# 8. CLI (if applicable)
node dist/cli.js --version
# Exit code: 0

# Kill server
kill %1
```

---

## Milestone 1: Foundation Setup

**Repository:** `core/vi`  
**Framework:** Fastify  
**Port:** 3000 default (override with `VI_PORT=3100`)  
**Health Endpoint:** GET `/v1/health`

### Verification Commands

```powershell
# Windows-friendly verification (single-quoted -Command, correct port)
pwsh -NoProfile -Command 'Set-Location "E:\Tentai Ecosystem\core\vi"; npm install'
pwsh -NoProfile -Command 'Set-Location "E:\Tentai Ecosystem\core\vi"; npm run type-check'
pwsh -NoProfile -Command 'Set-Location "E:\Tentai Ecosystem\core\vi"; npm run build'
pwsh -NoProfile -Command 'Set-Location "E:\Tentai Ecosystem\core\vi"; ./start-vi.ps1'
pwsh -NoProfile -Command 'Invoke-RestMethod -Uri "http://localhost:3100/v1/health" | ConvertTo-Json -Depth 3'

# Optional: tee harness output to temp log with env override
pwsh -NoProfile -Command '
  $env:VI_BASE_URL="http://localhost:3100";
  Set-Location "E:\Tentai Ecosystem\ops\tests";
  $date = Get-Date -Format "yyyyMMdd-HHmmss";
  $log  = Join-Path $env:TEMP ("77ez-test-" + $date + ".txt");
  .\77ez-test.ps1 2>&1 | Tee-Object -FilePath $log | Select-Object -Last 120;
  "`nLog: $log"
'
```

### Expected Outcomes (ALL Required)

- ✅ `npm install` — completes without errors
- ✅ `npm run type-check` — 0 type errors (exit code 0)
- ✅ `npm run build` — success (exit code 0), `dist/` created
- ✅ Server starts and listens on configured port (e.g., 3100 via `VI_PORT`)
- ✅ `/v1/health` responds with JSON (status: ok) on that port
- ✅ CLI executes and displays version
- ✅ No file permission issues
- ✅ No port conflicts
- ✅ No missing dependencies

### Exit Criteria (ALL Required)

- [x] Fresh install succeeds
- [x] Type-check: 0 errors
- [x] Build succeeds
- [x] Server starts on correct port (respect `VI_PORT` override)
- [x] Health endpoint works with correct framework (Fastify)
- [x] CLI functional
- [x] QUICKSTART.md verified with actual commands
- [x] Commit tagged `Milestone-1: Foundation Setup`

### Documentation

- **Completion Report:** [core/vi/docs/MILESTONE-1-COMPLETION.md](../../../core/vi/docs/MILESTONE-1-COMPLETION.md)
- **Verification Date:** 2025-12-22

---

## Milestone 2: Data Persistence (Future)

**Repository:** `core/vi`  
**New Dependencies:** pg, zod, winston  
**New Components:** Database layer, validation schemas, structured logging  

### Verification Commands (When Ready)

```bash
cd core/vi

# Fresh state
rm -rf node_modules dist package-lock.json

# Install
npm install

# Type-check
npm run type-check

# Build
npm run build

# Database setup
npm run db:setup
# Creates schema

# Start server
node dist/main.js &
sleep 2

# Health check (still works)
curl http://localhost:3000/v1/health

# New endpoint test
curl -X POST http://localhost:3000/v1/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "test"}'

# Kill server
kill %1

# CLI
node dist/cli/cli.js --version
```

### Expected Outcomes

- ✅ All Milestone 1 checks still pass
- ✅ Database schema created
- ✅ New endpoints functional
- ✅ Validation rejects bad input (400 status)
- ✅ Logging captures structured events
- ✅ Clean database teardown on shutdown

### Exit Criteria (When Applicable)

- [ ] All M1 criteria still pass
- [ ] Database layer: working
- [ ] Validation: tested with valid + invalid inputs
- [ ] Logging: events recorded to disk
- [ ] New endpoints: tested and functional
- [ ] QUICKSTART.md updated with new setup steps
- [ ] Commit tagged `Milestone-2: Data Persistence`

---

## How to Run Verification Before Committing

### For Developers

1. **Create feature branch:**
   ```bash
   git checkout -b feature/milestone-N
   ```

2. **Make changes and test normally**

3. **Before opening PR, simulate fresh checkout:**
   ```bash
   cd /tmp
   git clone <your-repo> verify-<repo>
   cd verify-<repo>
   # Run full verification sequence above
   ```

4. **If any step fails:**
   - Fix root cause in your branch (don't commit workarounds)
   - Re-run verification until all steps pass

5. **When verification passes:**
   ```bash
   git tag Milestone-N: <Description>
   git push --tags origin <branch>
   ```

### For Code Review

Before approving a milestone PR:

1. Check the commit is tagged `Milestone-N: ...`
2. Verify tag points to correct commit
3. Run verification sequence in a clean clone
4. Approve only if all steps pass

---

## Troubleshooting Verification Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `npm install` fails | Missing dependency declaration | Add to `package.json` |
| Type-check fails | Untyped import or wrong types | Add `@types/*` or fix import |
| Build fails | Syntax or compilation error | Fix TypeScript source |
| Server won't start | Port in use or missing config | Free port or adjust env vars |
| Health endpoint fails | Route not registered or wrong path | Check `src/runtime/server.ts` |
| CLI not found | Build didn't generate dist/ | Run `npm run build` |
| Database setup fails | Schema error or missing migration | Check SQL syntax or permissions |

**Core Rule:** Fix the root cause. Do not commit workarounds or partial fixes.

---

## Documentation Requirements for Each Milestone

Every milestone completion report MUST be in `<repo>/docs/MILESTONE-N-COMPLETION.md` and include:

```markdown
# Milestone N: [Name] — Completion Report

**Status:** ✅ COMPLETE
**Verified:** [YYYY-MM-DD HH:MM UTC]
**Reproducible:** YES

## Canonical Implementation
[Framework, endpoints, ports confirmed against source code]

## Verification Sequence (Reproducible)
[Exact commands used, actual output captured, not "SUCCESS"]

## Deliverables
[File paths, confirmed against filesystem]

## Exit Criteria (ALL VERIFIED)
- [x] Fresh install succeeds
- [x] Type-check: 0 errors
- [x] Build succeeds
- [x] [Component name]: verified

## How to Reproduce

[Copy of exact command sequence from Verification Sequence]

## Rollback Anchor

git checkout Milestone-N: [Description]
```

---

## Versioning & Git Tags

Milestone tags are rollback anchors:

```bash
git tag Milestone-1: Foundation Setup     # v0.1.0 equivalent
git tag Milestone-2: Data Persistence      # v0.2.0 equivalent
git tag Milestone-3: Advanced Reasoning    # v0.3.0 equivalent
```

Each tag guarantees:
- Fresh install passes
- Type-check passes
- Build succeeds
- All endpoints functional
- Can be checked out and verified 6 months from now

**Never rebase or delete a milestone tag.** If you need a hotfix, create a new tag.

---

## CI/CD Integration (Future)

Once implemented, GitHub Actions will automate verification:

```yaml
on: [pull_request]
jobs:
  verify-milestone:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Fresh install
        run: npm install
      - name: Type-check
        run: npm run type-check
      - name: Build
        run: npm run build
      - name: Health endpoint
        run: |
          npm start &
          sleep 2
          curl http://localhost:3000/v1/health
      - name: CLI
        run: node dist/cli/cli.js --version
```

---

## Q&A

**Q: Can I skip verification steps?**  
A: No. Every step ensures the next milestone's foundation. Skipping breaks everything downstream.

**Q: What if the server is slow to start?**  
A: Increase the `sleep` timeout (e.g., `sleep 5`). But investigate why it's slow.

**Q: What if I need to override config (dev database, custom port)?**  
A: Verification must work with **default config**. Use `.env.example` for documentation, but verification uses defaults.

**Q: Can I modify this process?**  
A: Only with an ADR in `ops/tentai-docs/90-adr/`. Changes must be approved by tech lead and documented.

---

**This is how we build for audits, because we are being audited.**
