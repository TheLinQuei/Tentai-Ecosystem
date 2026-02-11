# Phase 1 Implementation Guide

This file breaks down the Phase 1 spec into actionable, ordered development tasks.

Start with the [PHASE1_SPEC.md](../../ops/tentai-docs/00-ecosystem/PHASE1_SPEC.md) for the complete picture.

---

## Before You Start

1. Read [PHASE1_SPEC.md](../../ops/tentai-docs/00-ecosystem/PHASE1_SPEC.md) (the master spec)
2. Set up the project structure (see below)
3. Install dependencies
4. Verify CI/CD passes on empty project
5. Then start Milestone 1

---

## Project Structure (Scaffolding)

Create these directories first:

```
core/vi/
├── src/
│   ├── runtime/
│   │   ├── engine.ts          # Session engine + turn loop
│   │   ├── session.ts         # Session lifecycle
│   │   └── server.ts          # HTTP server (Fastify)
│   │
│   ├── perception/
│   │   ├── normalizer.ts      # Normalize input
│   │   └── entity-extractor.ts # Extract entities
│   │
│   ├── intent/
│   │   ├── router.ts          # Route to intent
│   │   └── intents.ts         # Intent definitions
│   │
│   ├── context/
│   │   ├── builder.ts         # Build context packet
│   │   ├── retrieval.ts       # Memory retrieval
│   │   └── types.ts           # ContextPacket shape
│   │
│   ├── planning/
│   │   ├── planner.ts         # Generate action plan
│   │   └── types.ts           # Plan shape
│   │
│   ├── reasoning/
│   │   ├── core.ts            # Reasoning orchestration
│   │   └── model-call.ts      # Actual reasoning step
│   │
│   ├── tools/
│   │   ├── registry.ts        # Tool registry
│   │   ├── executor.ts        # Execution sandbox
│   │   ├── builtin/           # Built-in tools
│   │   │   ├── memory-query.ts
│   │   │   ├── memory-write.ts
│   │   │   ├── filesystem-read.ts (optional)
│   │   │   └── shell-exec.ts (optional)
│   │   └── types.ts           # Tool interface
│   │
│   ├── memory/
│   │   ├── store.ts           # Memory operations
│   │   ├── retrieval.ts       # Ranked retrieval
│   │   ├── consolidation.ts   # STM → LTM merge
│   │   └── types.ts           # Memory item shape
│   │
│   ├── identity/
│   │   ├── policy.ts          # Policy engine
│   │   ├── identity.ts        # Identity state
│   │   └── audit.ts           # Audit log
│   │
│   ├── llm/
│   │   ├── gateway.ts         # LLM abstraction
│   │   ├── providers/         # Provider adapters
│   │   │   └── openai.ts
│   │   └── types.ts           # Provider interface
│   │
│   ├── telemetry/
│   │   ├── logger.ts          # Structured logging
│   │   ├── tracer.ts          # Tracing
│   │   ├── metrics.ts         # Metrics collection
│   │   └── types.ts           # Event shapes
│   │
│   ├── storage/
│   │   ├── prisma-client.ts   # Prisma setup
│   │   ├── migrations.ts      # DB migrations
│   │   └── seed.ts            # Seed data
│   │
│   ├── config/
│   │   ├── config.ts          # Configuration
│   │   └── secrets.ts         # Secret handling
│   │
│   ├── cli/
│   │   ├── cli.ts             # CLI entry
│   │   ├── chat-command.ts    # `vi chat` command
│   │   ├── ask-command.ts     # `vi ask` command
│   │   └── debug-command.ts   # `vi debug` command
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── chat.ts        # POST /v1/chat
│   │   │   ├── sessions.ts    # GET /v1/sessions/*
│   │   │   ├── memory.ts      # POST /v1/memory/*
│   │   │   ├── tools.ts       # POST /v1/tools/run
│   │   │   ├── health.ts      # GET /v1/health
│   │   │   ├── debug.ts       # GET /v1/debug/*
│   │   │   └── metrics.ts     # GET /metrics
│   │   └── middleware/
│   │       ├── auth.ts        # Identity check
│   │       └── errors.ts      # Error handling
│   │
│   ├── types/
│   │   ├── index.ts           # Re-export all types
│   │   └── loops.ts           # Canonical loop artifacts
│   │
│   ├── errors/
│   │   └── errors.ts          # Custom error classes
│   │
│   ├── utils/
│   │   ├── validators.ts      # Validation helpers
│   │   ├── formatters.ts      # Output formatting
│   │   └── debug.ts           # Debug utilities
│   │
│   └── main.ts                # Entry point
│
├── tests/
│   ├── unit/
│   │   ├── perception.test.ts
│   │   ├── intent.test.ts
│   │   ├── memory.test.ts
│   │   ├── tools.test.ts
│   │   ├── policy.test.ts
│   │   └── (etc. for each module)
│   │
│   ├── integration/
│   │   ├── turn-flow.test.ts      # Full turn with mocked LLM
│   │   ├── session-lifecycle.test.ts
│   │   ├── memory-retrieval.test.ts
│   │   └── (etc. for workflows)
│   │
│   ├── e2e/
│   │   ├── live-turn.test.ts     # Against real provider (flag gated)
│   │   └── (etc. for end-to-end)
│   │
│   ├── golden/
│   │   ├── intent-routing.golden.json    # Expected outputs
│   │   ├── memory-retrieval.golden.json
│   │   └── (etc.)
│   │
│   └── fixtures/
│       ├── mock-llm.ts              # Mock LLM adapter
│       ├── test-data.ts             # Shared test data
│       └── db-setup.ts              # Test database
│
├── docs/
│   ├── 00-overview.md           # Start here
│   ├── 10-architecture.md       # Architecture deep-dive
│   ├── 20-modules/              # Module-specific docs
│   │   ├── runtime.md
│   │   ├── perception.md
│   │   ├── intent.md
│   │   ├── context.md
│   │   ├── planning.md
│   │   ├── reasoning.md
│   │   ├── tools.md
│   │   ├── memory.md
│   │   ├── identity.md
│   │   ├── llm.md
│   │   └── telemetry.md
│   ├── 30-api.md                # API reference
│   ├── 40-testing.md            # Test strategy
│   ├── 50-examples.md           # Code examples
│   ├── 60-troubleshooting.md
│   ├── 70-runbook.md            # Ops runbook
│   └── 90-adr/                  # Architecture decisions
│       ├── 001-session-lifecycle.md
│       ├── 002-memory-architecture.md
│       └── (etc.)
│
├── prisma/
│   └── schema.prisma            # Database schema
│
├── scripts/
│   ├── dev.sh                   # Start dev server
│   ├── test.sh                  # Run tests
│   ├── build.sh                 # Build for prod
│   ├── seed-db.ts              # Seed database
│   └── load-test.ts            # Load testing
│
├── .env.example
├── package.json
├── tsconfig.json
├── jest.config.js
├── eslint.config.js
├── prettier.config.js
├── README.md
├── AI.md
└── Makefile (optional)
```

---

## Milestone-by-Milestone Checklist

### Milestone 1: Skeleton that runs

**Goal:** Get the infrastructure in place.

- [ ] Create project structure (directories above)
- [ ] Initialize package.json with dependencies (see PHASE1_SPEC.md section E)
- [ ] Set up TypeScript, ESLint, Prettier, Vitest
- [ ] Create config system (read from .env + env vars)
- [ ] Create logger (Pino with structured output)
- [ ] Create telemetry collector (local JSONL)
- [ ] Create Fastify server with `/v1/health` endpoint
- [ ] Create CLI skeleton with `vi --help`
- [ ] CI/CD: Fresh clone → install → test passes
- [ ] Verify lint + type checks pass

**Tests to write**
- Config loads correctly
- Logger writes structured JSON
- Telemetry collector starts
- API server boots and responds to /health
- CLI --help works

**Exit criteria**
- [ ] `npm run build` produces runnable binary
- [ ] `npm run test` passes (even if just framework checks)
- [ ] CI green

---

### Milestone 2: One-turn cognition (no tools)

**Goal:** User → response, full trace stored, no tools yet.

- [ ] Perception module (text normalization + entity extraction)
- [ ] Intent router (routes input to 8 intent classes)
- [ ] Context builder (gathers session, conversation, rules)
- [ ] LLM gateway (abstract provider, start with OpenAI)
- [ ] Reasoning core (perception → intent → context → llm → response)
- [ ] Turn storage (write turn record with trace)
- [ ] Response formatter (JSON + plain text)

**Tests to write**
- Perception: entity extraction golden tests
- Intent: 8 intent classes with regression examples
- Context: context packet shape + completeness
- LLM: mock provider returns expected outputs
- Integration: full flow perception → response

**Exit criteria**
- [ ] `vi ask "question"` returns response
- [ ] `/v1/chat` POST returns session + response
- [ ] Turn record has full trace (perception, intent, context, llm output, response)
- [ ] Tests pass with deterministic mock

---

### Milestone 3: Memory write + retrieval

**Goal:** System learns from turns.

- [ ] Database schema (sessions, turns, memories)
- [ ] Memory store (write + retrieve operations)
- [ ] Retrieval ranking (BM25 or simple keyword)
- [ ] Consolidation rules (define STM → LTM merge logic)
- [ ] Export/import (JSON round-trip)

**Tests to write**
- Write item to STM, retrieve it
- Query returns relevant items
- Consolidation deterministic (golden data)
- Export/import round-trips

**Exit criteria**
- [ ] Ask question, system writes to memory
- [ ] Ask similar question later, retrieval improves response
- [ ] Consolidation defined + tested

---

### Milestone 4: Tool system

**Goal:** Vi can take actions.

- [ ] Tool registry (define tool schema, version, permissions)
- [ ] Tool executor (validate + run + sandbox)
- [ ] Build 2 tools minimum: `memory.query`, `filesystem.read`
- [ ] Tool audit log (who called what when)
- [ ] Tool error handling (graceful failure)

**Tests to write**
- Tool registry validation
- Executor calls tool + captures result
- Tool denies invalid inputs
- Audit log records all calls
- Tool result chunking + summarization

**Exit criteria**
- [ ] `vi ask "find [something]"` can invoke filesystem.read
- [ ] Tool results summarized before LLM sees them
- [ ] Audit log shows tool invocation

---

### Milestone 5: Planning + tool-assisted response

**Goal:** System chooses and uses tools intelligently.

- [ ] Planning module (decide: direct response vs tool-assisted)
- [ ] Tool calling (model decides which tool + args)
- [ ] Tool integration (execute + integrate result into response)
- [ ] Response with citations (show which tool was used + result source)

**Tests to write**
- Golden tests: prompt → expected plan
- Model chooses appropriate tool
- Tool result integrated into final response
- Citations show tool source

**Exit criteria**
- [ ] `vi ask "search for [thing]"` invokes tool, response cites tool
- [ ] Multi-turn: follow-up question uses tool result from prior turn
- [ ] Golden tests compare expected vs actual plans

---

### Milestone 6: Consolidation

**Goal:** Memory consolidates automatically.

- [ ] Consolidation scheduler (run periodically or on trigger)
- [ ] Consolidation rules (merge STM items into LTM summary)
- [ ] Deterministic tests (known input → known output)
- [ ] Verify LTM grows sensibly (no duplication)

**Tests to write**
- Consolidation deterministic (fixed input → fixed output)
- Golden data: 5 STM items → expected LTM summary
- No duplication after consolidation
- LTM retrieval still works post-consolidation

**Exit criteria**
- [ ] Consolidation runs automatically after N turns
- [ ] Deterministic tests pass
- [ ] Golden data verified

---

### Milestone 7: Identity + policy gating

**Goal:** System respects access control.

- [ ] Identity system (know operators + trust levels)
- [ ] Policy engine (rule-based gating)
- [ ] Tool gating (role-based access)
- [ ] Memory gating (privacy classifications)
- [ ] Audit log (explain why actions allowed/denied)

**Tests to write**
- Operator can call restricted tool
- Guest denied restricted tool (error logged)
- Policy decisions explainable
- Audit log present + queryable

**Exit criteria**
- [ ] Attempting unauthorized tool returns error + logs
- [ ] Policy explanation available via API
- [ ] Audit log shows decisions

---

### Milestone 8: Evaluation suite + exit

**Goal:** Phase 1 complete.

- [ ] Golden tests (intent, planning, responses)
- [ ] Integration suite (full turns with mocked LLM)
- [ ] Load test (100+ turns without corruption)
- [ ] Architecture docs (module docs + ADRs)
- [ ] Runbook (how to deploy, debug, monitor)
- [ ] Type checks clean
- [ ] Lint clean
- [ ] Coverage >= 85% core modules

**Tests to write**
- Golden test suite (all canonical artifacts)
- Integration tests (5+ full turn scenarios)
- Load test (100 turns, verify memory + audit log)
- Deterministic suite with fixed seeds

**Exit criteria**
- ALL items in "DONE" section of PHASE1_SPEC.md true
- [ ] Fresh clone → install → test → run works
- [ ] CI green
- [ ] All docs present + linked
- [ ] README updated for developers

---

## Implementation Order (Do these first)

1. **Skeleton (Milestone 1)** — Get infrastructure working
2. **One-turn cognition (Milestone 2)** — Prove end-to-end flow
3. **Memory (Milestone 3)** — System learns
4. **Tools (Milestone 4)** — System acts
5. **Planning (Milestone 5)** — System decides on actions
6. **Consolidation (Milestone 6)** — System forgets cleanly
7. **Policy (Milestone 7)** — System respects control
8. **Evaluation (Milestone 8)** — System is done

---

## "No Stubs" Audit

Before merging any PR:

- [ ] No `TODO` comments in core path (only in future-phase code)
- [ ] No `return null` without explaining via NotImplementedByDesign
- [ ] No `catch (e) {}` without handling
- [ ] No `any` types except at validated boundaries
- [ ] All functions tested

---

## Golden Test Data (Create these)

Create JSON fixtures for deterministic testing:

**intent-routing.golden.json**
```json
{
  "cases": [
    {
      "input": "What do we know about project X?",
      "expectedIntent": "memory.query",
      "confidence": 0.95
    },
    {
      "input": "Remember that Alice is the tech lead",
      "expectedIntent": "memory.write"
    }
  ]
}
```

**planning.golden.json**
```json
{
  "cases": [
    {
      "intent": "task.execute",
      "context": {...},
      "expectedPlan": "ToolAssistedResponse",
      "expectedTools": ["filesystem.read"]
    }
  ]
}
```

Create these fixtures as you go through milestones.

---

## Next Steps

1. Read [PHASE1_SPEC.md](../../ops/tentai-docs/00-ecosystem/PHASE1_SPEC.md) in full
2. Create project structure (directories + package.json)
3. Start Milestone 1
4. Return here to track progress

---

**Version:** 1.0  
**Last updated:** 2025-01-01  
**Next:** Start Milestone 1
