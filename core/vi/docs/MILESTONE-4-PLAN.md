# Milestone 4: Cognition Skeleton

**Status:** Proposed → In Progress → Complete (upon verification)

## Summary
Milestone 4 implements the deterministic brain—the internal state machine that routes perception → intent → planning → execution → reflection. No LLM calls or tools yet, but structured such that Phase 2 can wire them in without spaghetti.

## Why This Matters
Until now, Vi was infrastructure: API, persistence, auth, testing.
From M4 onward, Vi is a *brain*: it takes input, reasons about it, makes decisions, and learns.

## What's Built

### 1. **Type System** ([src/brain/types.ts](src/brain/types.ts))
- `ThoughtState`: immutable state object through one cognition cycle
- `Perception`, `Intent`, `Plan`, `Execution`, `Reflection`: each stage
- `RunRecord`: complete artifact from one interaction (for audit/replay)

### 2. **Interface Contracts** ([src/brain/interfaces.ts](src/brain/interfaces.ts))
- `LLMGateway`: abstraction for intent classification + response generation
- `MemoryStore`: episodic/semantic memory (Phase 2+)
- `ToolRunner`: safe tool execution (Phase 2+)
- `PolicyEngine`: guardrails and boundaries
- `RunRecordStore`: persistence for run records

### 3. **Pipeline Stages** (Deterministic Phase 1 Implementations)

#### Planner ([src/brain/planner.ts](src/brain/planner.ts))
- Input: classified `Intent`
- Output: `Plan` (list of steps with dependencies)
- Phase 1: rule-based routing (query → respond, command → policy check + respond, etc.)
- Phase 2: LLM-driven planning

#### Executor ([src/brain/executor.ts](src/brain/executor.ts))
- Input: `Plan`, userId, policy engine
- Output: `Execution` (results of steps)
- Phase 1: mock respond / policy check steps
- Phase 2: wires to real tools, memory access

#### Reflector ([src/brain/reflector.ts](src/brain/reflector.ts))
- Input: completed `ThoughtState`
- Output: `Reflection` (summary, key findings, memory storage recommendations)
- Phase 1: simple extraction
- Phase 2: LLM-driven semantic extraction

#### Orchestrator ([src/brain/pipeline.ts](src/brain/pipeline.ts))
- Coordinates: perception → intent → plan → execution → reflection → response
- Returns: output + recordId for audit trail
- Saves run record to DB for replay and learning

### 4. **Phase 1 Stubs** ([src/brain/stubs.ts](src/brain/stubs.ts))
- `StubLLMGateway`: deterministic intent classification based on heuristics
- `StubPolicyEngine`: permissive (no blocks yet)
- `PostgresRunRecordStore`: persists run records for audit/replay

### 5. **Database Migration** ([src/db/migrations.ts](src/db/migrations.ts))
- `0004_add_run_records`: creates `run_records` table with JSONB columns for artifacts

### 6. **Integration Test** ([tests/integration/cognition.e2e.test.ts](tests/integration/cognition.e2e.test.ts))
- Proves: input → output + stored run record
- Validates: intent classification, plan generation, execution, reflection, storage

## Canonical Entry Points

**For developers new to the brain:**
- **[src/brain/pipeline.ts](src/brain/pipeline.ts)** is the single orchestration surface
  - `CognitionPipeline.process()` is where the full cognition cycle happens
  - All other modules (planner, executor, reflector) are called from here
  - Start here to understand the flow

**For testing:**
- **[tests/integration/cognition.e2e.test.ts](tests/integration/cognition.e2e.test.ts)** proves the end-to-end pipeline

## Verification Artifact
- Script: [scripts/verify-m4.ps1](scripts/verify-m4.ps1)
- Log: [docs/verification/2025-12-23_191449-m4-verification.log](docs/verification/2025-12-23_191449-m4-verification.log)
- Run command: `pwsh scripts/verify-m4.ps1`

## Proof (from verification log)
- Build succeeds
- Migrations apply cleanly (including run_records table)
- Unit tests pass (27/27)
- Integration tests pass, including new `cognition.e2e.test.ts`:
  - Pipeline processes query → outputs response
  - Intent is classified (query vs command)
  - Plan is generated with steps
  - Execution records results
  - Reflection summarizes findings
  - Run record is persisted to DB for audit

## Exit Criteria (M4 Complete)
- ✅ Brain type system defined and enforced
- ✅ Interfaces established for LLM, memory, tools, policy (boundaries ready for Phase 2)
- ✅ One-turn cognition pipeline working end-to-end
- ✅ Deterministic Phase 1 implementations (stubs)
- ✅ Run records persisted (audit + replay)
- ✅ Integration test proves the flow
- ✅ Verification script and log exist

## What's NOT In M4 (Phase Boundaries)
- No real LLM calls (`NotImplementedByDesign` enforced in Phase 2)
- No memory consolidation strategy (vector DB later)
- No tool registry or execution (executor returns 'not yet implemented')
- No semantic extraction from user input (Phase 2 LLM-driven)

These are all explicitly marked as Phase 2 boundaries and will be implemented in their proper milestones.

## What Happens Next (Phase 2)
M5: Wire LLM (real intent classification, planning, reflection)
M6: Memory consolidation (vector DB, semantic extraction, retrieval)
M7: Tool layer (registry, permissions, audit, execution)
M8: Knowledge base (vi-protocol contracts, cross-boundary safety)

## The Brain is Forming
This milestone proves that Vi is not just an API anymore. It's a reasoning system.
It takes input, thinks about it, makes decisions, and remembers.
The mechanism is simple (Phase 1), but the skeleton is sound.
