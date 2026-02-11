# Tentai 77EZ — Copilot Build Rules (Hard)

## 0) The End Goal
We are building **Vi**, a sovereign, modular AI system (Jarvis/Cortana/GRIOT/NATALIE-grade).
Every repo is a client or core component in the Tentai ecosystem.
All systems must be designed for long-term expansion without rewrites.

## 1) THE FREEZE (Until Vi Exists)

**Only two repos are active:**
- `vi-core` — Build the brain
- `vi-protocol` — Refine contracts as vi-core needs them

**All other repos are frozen:**
- No new code
- No new features
- No detailed docs (except governance)
- They get structure (folders, skeleton READMEs), but no implementation

**Why:** Building seven clients for a brain that doesn't exist = fantasy sprawl and rework.

See [FREEZE.md](../../FREEZE.md) for unfreeze milestones.

## 2) Contracts First (vi-protocol)
- All cross-repo communication must use `vi-protocol` schemas.
- No repo may invent its own canon schema, memory record schema, citation format, or tool interface.
- When vi-core needs a new contract, it updates vi-protocol first.

## 3) BOUNDARY POLICY (Not Stubs Policy)

This replaces "no stubs policy" with actual clarity.

### Phase Boundaries (ALLOWED)
Deliberate, documented boundaries where a subsystem is not yet implemented:

```typescript
throw new NotImplementedByDesign(
  'Memory consolidation is not yet implemented.',
  {
    phase: 'Phase 2',
    reason: 'Requires structured reasoning engine.',
    when: 'After Phase 2 cognition pipeline',
    ticket: 'https://github.com/...'
  }
);
```

**Rules:**
- ✅ Throw `NotImplementedByDesign` with context
- ✅ Explain the phase it's blocked by
- ✅ Link to tracking issue
- ✅ Provide workaround if available
- ✅ Document in `/docs/90-adr/`

### Fake Implementations (NOT ALLOWED)
Anything that pretends to work:

- ❌ `return [];` (empty arrays)
- ❌ `return null;` (silent failure)
- ❌ `// TODO: implement this` (hidden incompleteness)
- ❌ Mock data returned as real
- ❌ No-op implementations

**Instead:** Fail loudly with clear error.

See [UNIMPLEMENTED_BY_DESIGN.md](../../UNIMPLEMENTED_BY_DESIGN.md) for examples and the NotImplementedByDesign class.

## 4) Quality Gates (When Building)

For code you ARE implementing in vi-core or vi-protocol:

- Tests (unit + integration where applicable)
- Structured logging + telemetry events
- Strict types (no `any` except at validated boundaries)
- Clear errors (use NotImplementedByDesign for boundaries)
- Docs in `/docs` + reference in `README`

## 5) Architecture Rules
- Separate: domain logic, storage, API, UI
- No business logic inside route handlers.
- No direct DB calls from UI components.
- Repositories must map DB → domain models and back.

## 6) Documentation Discipline (Doc Sprawl Control)
- Do not create random documentation files.
- All docs go in `/docs` using this structure:
  - /docs/00-overview
  - /docs/10-architecture
  - /docs/20-modules
  - /docs/90-adr
- Global docs belong in `tentai-docs/playbooks` and `tentai-docs/brand`, not scattered.
- Frozen repos get skeleton READMEs only, no detailed docs.

## 7) Theme Discipline (77EZ)
- UI must use the canonical Tentai tokens.
- No hardcoded hex colors outside the theme file.
- The design language is: void-black + sovereign gold + controlled cyan, with purple as an approved accent.
- This only applies to active repos (vi-command-center is frozen anyway).

## 8) Doc Placement (NON-NEGOTIABLE)

**Rule: Documentation is written directly to its final location. Temporary or staging documents are forbidden.**

The repo root is a lobby. Do not create documentation files in the root directory.

### Allowed in root (exactly 4 files):
- `README.md` (entry point only)
- `FREEZE.md` (governance)
- `copilot-rules.md` (pointer to canonical)
- `vi.md` (philosophy declaration)

### All docs MUST go to their final home (no staging):
- **Ecosystem docs:** `ops/tentai-docs/00-ecosystem/` (phases, specs, structure, roadmaps)
- **Processes/Rules:** `ops/tentai-docs/playbooks/` (copilot-rules, doc-writing-rules)
- **Brand & Design:** `ops/tentai-docs/brand/` (design tokens, themes)
- **Repo docs:** `<repo>/docs/` (architecture, modules, guides, runbooks)
- **Architecture Decisions:** `ops/tentai-docs/90-adr/` or `<repo>/docs/90-adr/` (ADRs)

### Where Does This Doc Belong? (Decision Tree)

```
Q1: Is this about the whole ecosystem (roadmap, phases, structure)?
    YES → ops/tentai-docs/00-ecosystem/
    NO  → Q2

Q2: Is this a process/rule for building?
    YES → ops/tentai-docs/playbooks/
    NO  → Q3

Q3: Is this an architecture decision (why we chose X)?
    YES → ops/tentai-docs/90-adr/
    NO  → Q4

Q4: Is this specific to one repository (API, architecture, examples)?
    YES → <repo>/docs/
    NO  → Q5

Q5: Is this philosophy/vision/brand?
    YES → Root or ops/tentai-docs/brand/ (rare)
    NO  → Stop. This doesn't belong in docs. Use GitHub Issues instead.
```

### Examples (Correct Placement)

```
WRONG: root/IMPLEMENTATION_GUIDE.md
RIGHT: ops/tentai-docs/00-ecosystem/IMPLEMENTATION_GUIDE.md

WRONG: root/MILESTONE_1_COMPLETE.md
RIGHT: core/vi/docs/MILESTONE_1_COMPLETE.md

WRONG: ops/tentai-docs/00-ecosystem/ARCHITECTURE.md (repo-specific)
RIGHT: core/vi/docs/10-architecture.md

WRONG: ops/tentai-docs/playbooks/TODO.md
RIGHT: GitHub Issues instead

WRONG: core/vi/docs/TEMP_NOTES.md
RIGHT: Don't create it. All docs are permanent.

WRONG: core/vi/QUICKSTART.md (should be in docs/)
RIGHT: core/vi/docs/00-overview/QUICKSTART.md
```

### Never Create:
- Temp files (`TEMP_*.md`, `WIP_*.md`, `_*.md`)
- Staging docs (`DRAFT_*.md`, `STAGING_*.md`)
- Any doc in root except the 4 allowed files
- Reports in root (they go in ecosystem docs/)
- Completion tracking in root (goes in `<repo>/docs/`)

### If You're About to Create a Doc
1. Trace through the decision tree above
2. Write to the final location
3. Never move it again
4. If you're uncertain, ask in a DESIGN NOTE ADR first

### Enforcement
- **In code review:** Reject any doc placed in the wrong location
- **In CI/CD (future):** Lint fails if .md files exist outside approved locations
- **In this ruleset:** Follow or fix immediately

See [`doc-writing-rules.md`](doc-writing-rules.md) for how to write good docs once you've found the right home.

## 9) Approval & Canon Governance
- AI-generated canon content must be created as proposals.
- Only authorized humans can approve into canon (Kaelen, T'Kanda).
- Provenance and citations are mandatory.

## 10) Canonical Paths (NON-NEGOTIABLE)

One repository = one canonical path. No parallel maintenance, no old versions.

### Rule: Single Authoritative Path Per Repo
- Each repository has exactly one active canonical location
- Old/deprecated paths are deleted, not archived
- Code must never reference deleted paths
- Build tools must ignore deleted paths
- Violating this = fix before commit

### Canonical Structure (Locked)

**Core (Active):**
```
core/vi                    ← The brain
core/vi-protocol           ← Contracts
core/vi-sdk                ← SDKs
```

**Clients (Categorical, frozen until Phase 2 unfreeze):**
```
clients/command/sovereign     ← Web console
clients/lore/astralis-codex   ← Universe builder
clients/discord/vigil         ← Discord bot
```

**Systems (Frozen):**
```
systems/aegis              ← Auth service (Phase 3+)
systems/sereph             ← Hardware/runtime (Phase 4+)
```

**Ops (Active governance):**
```
ops/tentai-infra           ← Deployment, CI
ops/tentai-docs            ← Documentation hub
```

### Deprecated Paths (Deleted as of Milestone 1)
- ❌ `core/vi-core` → use `core/vi`
- ❌ `clients/vi-command-center` → use `clients/command/sovereign`
- ❌ `clients/astralis-codex` → use `clients/lore/astralis-codex`
- ❌ `clients/vibot` → use `clients/discord/vigil`

### When to Change a Canonical Path
- Requires ADR in `ops/tentai-docs/90-adr/`
- Requires tech lead approval
- Update all imports, documentation, configs
- Tag commit as breaking change
- Communicate in CHANGELOG

See [`ops/tentai-docs/00-ecosystem/CANONICAL_PATHS.md`](../../00-ecosystem/CANONICAL_PATHS.md) for full decision record.

## 11) Milestone Stability (NON-NEGOTIABLE)

Every milestone must be verified reproducible from a clean checkout before the next milestone begins.

### Stability Verification Sequence
```bash
# Start fresh
cd <repo>
rm -rf node_modules dist package-lock.json

# Install clean
npm install

# Type-check (zero errors, zero warnings)
npm run type-check

# Build (must succeed)
npm run build

# Test (if applicable)
npm run test

# Run (must start without errors)
npm start &
sleep 2
curl http://localhost:PORT/v1/health  # or appropriate health check
kill %1

# CLI (if applicable)
node dist/cli/cli.js --version
```

### Milestone Exit Criteria (ALL REQUIRED)
- ✅ All steps above succeed on fresh checkout
- ✅ Exact command sequence documented in `<repo>/docs/00-overview/QUICKSTART.md`
- ✅ Commit tagged `Milestone-N: Stable Foundation`
- ✅ That commit is a permanent rollback anchor

### ### If Any Verification Step Fails
**Rule: Fix root cause before proceeding. No workaround commits. No partial credit.**

A failed stability check is a blocker. Do not move to the next milestone until every step passes cleanly.

**Process:** See [`ops/tentai-docs/00-ecosystem/MILESTONE_VERIFICATION.md`](../../00-ecosystem/MILESTONE_VERIFICATION.md) for full verification process and troubleshooting.

## 12) Default Behavior
If uncertain:
- Stop and produce a DESIGN NOTE in `/docs/90-adr/` with tradeoffs and a recommendation.
- Then implement the recommended path fully (no half-build).
- If it's a boundary, use NotImplementedByDesign.
- If it's a frozen repo, don't touch it.

## 13) Completion Reports Are Verification Artifacts (NON-NEGOTIABLE)

A milestone completion report is not aspirational. It is a verification artifact. It describes what exists on disk, with proof.

### Every Completion Report MUST Include:
- **Canonical implementation:** Framework name, actual file path, actual code quote
- **Endpoints & ports:** From `config.ts` or runtime, quoted verbatim (not assumptions)
- **Exact command sequence:** Either embedded in report OR reference to a verification script
- **Actual output:** Captured from terminal execution, not placeholders like "SUCCESS"
- **Verification log file:** Path to timestamped `.log` file checked into repo (or generated and referenced)
- **Date & time:** When verification ran
- **Exit codes:** Must be 0 for success
- **Reproducibility:** Instructions for someone else to run the exact same sequence

### Logs Must Be Saved As Files (Non-Negotiable Sub-Rule)

**Logs in terminal history = not a completion report.**

Required:
- ✅ `docs/verification/<timestamp>-m1-verification.log` checked in or generated reproducibly
- ✅ Report links to the log file
- ✅ Log contains full transcript (not filtered output)
- ✅ Log timestamped in filename and content

Forbidden:
- ❌ "I ran the commands and they passed" (where are the outputs?)
- ❌ Embedded outputs without matching log file
- ❌ Terminal scrollback as proof (volatile, loses context)

**Rule:** If a human reads the report and can't find the log file, the report is incomplete and must be rejected.

### Forbidden in Completion Reports:
- ❌ "supports" language for untested features (e.g., "supports multi-modal interactions" if no handlers exist)
- ❌ Aspirational architecture ("intended to", "should", "planned for")
- ❌ Framework assumptions ("Express" when the code says Fastify)
- ❌ Port guesses ("localhost:3001" when config says 3000)
- ❌ Vague success language ("SUCCESS", "OK") — include actual JSON responses
- ❌ Features described but not tested

### Verification Validity Rule:
A completion report is only valid if:
1. A fresh checkout can reproduce it **exactly** by following the report step-by-step
2. The verification log file exists and contains actual outputs
3. A human can cross-check any claim against the log

If someone runs:
```bash
git checkout Milestone-N: <tag>
cd <repo>
[commands from report]
```

They must get the same outputs shown in the report AND the log file. If they don't, the report is false and must be corrected immediately.

### Before Submitting a Milestone:

1. **Create a verification script** (example: `scripts/verify-m1.ps1`)
   ```powershell
   # Runs clean → install → build → test → logs to docs/verification/
   pwsh scripts/verify-m1.ps1
   ```

2. **Run the script and save the output**
   - Script writes to `docs/verification/<timestamp>-m1-verification.log`
   - Commit both script and log to repo

3. **List actual file paths** (not concepts)
   ```markdown
   **File:** src/runtime/server.ts
   **Code:** [quote actual line]
   ```

4. **Quote config values** (not guesses)
   ```typescript
   // From src/config/config.ts:
   port: z.coerce.number().default(3000),
   ```

5. **Link to the verification log**
   ```markdown
   **Verification Log:** [docs/verification/2025-12-22_210827-m1-verification.log](../../../docs/verification/2025-12-22_210827-m1-verification.log)
   ```

6. **Date your verification**
   ```
   Verified: 2025-12-22 21:08 UTC
   ```

7. **Enable audit trails**
   Each report must be durable and auditable 12 months later.
   Log files stay in repo; humans can't accidentally delete them without a PR.

---

**This makes Copilot build like it's being audited, because it is.**

**And this freeze prevents sprawl by forcing focus.**
