# VI 77EZ DELIVERY PLAN

Jarvis-Class Intelligence with Operator-Grade Control

This plan assumes current repo reality is accurate. Existing shipped pieces are locked, not “future work.” Clean, layered, inevitable; each phase unlocks the next without rework.

PHASE 0 — TRUTH FIRST (Non-Negotiable Reality Alignment)

0.1 Observability Truth Contract
- Enforce userId + sessionId at all event emissions; ObservabilityRepository.emit auto-fills from request context; if still missing, scope=system.
- Evidence queries filter by user_id and session_id; default to latest session, allow explicit cross-session view; no hard-coded limits, add paging/cursors.
- SSE ↔ Evidence parity: if it streams, it persists; add regression test for parity.
- Exit: SSE, Evidence Vault, exports, and DB rows agree.

0.2 Control Plane Truth (Overseer)
- Health polling interval /health per service with latency/timeout/failure streaks; state resolution healthy→degraded→hung→down.
- Hung detection with restart policy (configurable); emit audit + alert.
- Honor startCmd strictly (locked).
- Exit: Console cannot show green while a service is broken.

PHASE 1 — IDENTITY IS NOT OPTIONAL

1.1 Sovereign Auth (Real Humans)
- Sovereign login UI backed by Vi Core JWT auth; roles: owner, operator, viewer, auditor (read-only).
- Secure token storage + refresh; every console call attaches identity.
- Console session browser: active sessions, IP/device, last action.
- Exit: Every console action is attributable to a real person.

1.2 Relational Identity Model (Brain-Level)
- Add to users: trust_level (0.0–1.0), relationship_type (ally|neutral|risk|restricted|trusted), voice_profile (tone, verbosity, confrontation tolerance), social_links (discord, github, email, internal).
- Wire into stance selection, tool permissions, response tone, and engagement gating.
- Exit: Same message from two users yields intentionally different behavior.

PHASE 2 — WORLD MODEL (THE MISSING ORGAN)

2.1 Canonical World State
- One event-sourced object for current reality: services (status/config/deps), projects (Tentai, Vi V2, SERAPH, deadlines), active goals/tasks, env flags (test mode, cost clamp, provider availability).
- Queryable, mutable via verified actions, snapshot-able.
- Exit: Vi can answer “what’s going on right now?” without guessing.

PHASE 3 — AGENCY LOOP (JARVIS SWITCH)

3.1 Goals & Tasks (Present → Harden)
- Existing: persistent goals, task executor, verifier registry, audit trail.
- Harden: lifecycle proposed→active→blocked→completed→failed→archived; branching on failure; cross-turn continuation detection; user-visible open loops in Console.
- Exit: Vi continues unfinished work without re-prompting.

3.2 Verification as First-Class Logic
- Tools declare preconditions, verification method, optional compensating action.
- Executor enforces verify→retry→branch→escalate; failures emit critical events.
- Exit: No hallucinated success.

PHASE 4 — MEMORY GOVERNANCE

4.1 Memory Injection (Lock It In)
- /v1/admin/memory/inject finalized; dimensions: episodic, semantic, relational, commitment, working; TTL, source, confidence, label; full visibility in Evidence + Console.

4.2 Memory Discipline
- Consolidation scheduler (episodic→semantic), conflict detection, suppression/redaction flags, dedupe guardrails, confidence decay.
- Exit: Memory improves signal, never entropy.

PHASE 5 — EVALUATION AS A WEAPON

5.1 CI + Regression Enforcement
- Golden tests in CI; regression thresholds fail builds.
- Dimension dashboards: identity, memory, tone, accuracy, tool success; cost/latency budgets enforced.
- Exit: You can prove Vi improved.

PHASE 6 — GOD CONSOLE = OPERATOR COCKPIT

6.1 Trace Inspector
- One click: prompt assembly, retrieved memories (raw/filtered/suppressed), stance decision + signals, tools (inputs/outputs redacted), task state + verification, governor interventions.
- Exit: No black boxes.

6.2 Live Cognition Controls
- From Console: force stance, clamp tone, disable tools, disable memory writes, safe mode, cost ceiling, provider failover.
- Exit: Operator overrides without stopping Vi.

6.3 Memory Browser
- View/delete/redact, lock, merge duplicates, adjust confidence, see injection sources.
- Exit: Surgical memory control.

PHASE 7 — ACTION PROTOCOL + SDK (Future-Ready)
- Typed action contracts with pre/post conditions, verification, rollback; external SDK (Discord, CLI, devices, services).
- Exit: Vi acts beyond chat.

FINAL READINESS SNAPSHOT (HONEST)
- Vi Core: Reactive intelligence A; observability A; memory plumbing A-; agency loop B+; world awareness D (next); trust/identity C; evaluation A+; overall ~65–70% Jarvis-class.
- God Console: Telemetry/evidence A-; feedback/eval UI A; control plane B+; operator UX C; introspection C-; overall ~60% operator-grade.

CORE LOOP (LOCK IT IN)
Perceive → Decide → Act → Verify → Learn → Persist.
Dominant today: Perceive, Decide. This plan finishes Act (real actions), Verify (truth), Learn (evaluation + consolidation), Persist (world model + goals).
## Readiness Snapshot (Jarvis-Class)
