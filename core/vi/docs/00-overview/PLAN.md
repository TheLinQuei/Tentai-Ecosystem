# Vi Delivery Plan

This plan captures the prioritized fix path for Vi. Phases are ordered to maximize impact and minimize rewrites.

## Phase 0: Telemetry and Control Truthfulness

### 0.1 Event Integrity (stop losing truth between SSE and Evidence)
- Enforce `userId` + `sessionId` at `ObservabilityRepository.emit()`; auto-fill from request context; if still missing, emit as system-scoped without masquerading as user-scoped.
- Update evidence queries to filter by both `user_id` and `session_id`; avoid mixing sessions.
- Remove/raise the evidence `LIMIT 20` cap; add paging.
- Goal: every event that hits SSE can be found in Evidence consistently.

### 0.2 Overseer Truthfulness (health polling + start commands)
- Health polling loop: hit each service `/health` on interval; mark healthy/degraded/down based on response/latency/timeout.
- Honor per-service `startCmd` (no hardcoded `npm run dev`).
- Hung-process detection: if health fails N intervals, restart or flag critical.
- Goal: ecosystem status reflects reality, not just process presence.

## Phase 1: Close the Broken Plumbing Gap

### 1.1 `/v1/admin/memory/inject` (Vi Core)
- Add route in Vi Core runtime (Sovereign already proxies).
- Payload: `memory` (string); optional `injectionLabel`, `dimension` (episodic|semantic|relational|commitment|working), `ttl` (number).
- Persist to `memory_injections` keyed by userId/sessionId; ensure Evidence returns `injected[]` for console display.

### 1.2 God Console Auth and User Naming
- Use existing JWT auth in Vi Core; implement Sovereign login UI, store access token securely, attach to requests.
- Evidence vault displays `user.displayName` (not generic "User").
- Add user list + session browser.

## Phase 2: Jarvis Switch (Agency)

### 2.1 Persistent Task Queue + Execution Engine
- Tables: `goals(goalId,userId,status,priority,createdAt,updatedAt)`, `tasks(taskId,goalId,stepIndex,state,retries,backoffUntil,lastError,verificationStatus)`, `task_events(taskId,eventType,payload)`.
- TaskExecutor: resumable, retries with backoff, branches on tool failure, writes progress each step.
- Open-loop tracker: unfinished goals visible in Evidence/console; next chat turn can auto-continue when relevant.

### 2.2 Verification Layer
- Step types gain verify hooks; tools can declare verifiers (or generic verify by expected outputs).
- Add `verificationStatus` to task steps.

## Phase 3: Iteration Engine

### 3.1 Evaluation + Regression Harness
- Golden conversation suite with labels: intent, stance, required memory recall, tool usage correctness, refusal correctness.
- Scoring: identity correctness, memory precision/recall, tool success rate, tone adherence, latency and cost budgets.
- Console buttons: good/bad, tag issue (memory/tone/refusal/tool/hallucination), JSONL exporter for training/evals.

## Brain Additions (Must-Have Modules)
- World model (service/project/environment state).
- Goal/task engine (persistent, resumable).
- Verification layer.
- Eval/regression harness.
- Identity + relationship model (trust level, relationship type, voice profile, social linking).
- Memory consolidation + conflict resolution (design now, implement later).

## Console Additions (Must-Have)
- Auth + user management (real users, sessions, roles).
- Trace inspector (prompt pieces, retrievals, stance) — "why did you say that?".
- Memory browser (view/delete/lock/merge + injected blobs).
- Live cognition controls (clamp tone, safe mode, no-tools, no-writes).
- Goal/task dashboard (open loops, active goals, step progress).
- Response tagging + dataset export.

## Readiness Snapshot (Jarvis-Class)
- Vi Core (Brain): Tool framework ~90%; Memory plumbing ~80% (missing consolidation/suppression/conflict handling); Stance/persona ~75% (missing mood arc/relationship behavior); Identity ~60% (missing trust/voice/social graph); World model ~15%; Goal/task engine ~10%; Eval harness ~5%. Overall Brain readiness ~45–50% (autonomy missing).
- God Console (Sovereign): Evidence/events/export ~70–80%; Ecosystem control ~60% (needs health truth + startCmd); Operator UX (users, sessions, memory browser, trace inspector) ~30–40%. Overall Console readiness ~45–55%.

## Core Loop Reminder
Perceive (events, state, memory) → Decide (stance, goals, policy) → Act (tools) → Verify (did it work) → Learn (evals + consolidation) → Persist (tasks + world model). Current system is strong on Perceive/Decide for reactive chat; missing Act→Verify→Learn as a persistent loop.
