# 77EZ CLOSURE SPECIFICATION

**Status:** Approved for Implementation  
**Date:** January 8, 2026  
**Scope:** Upgrade Vi from "well-governed chat runtime" to "looping, grounded, proactive operator"  
**Target:** 110% 77EZ Standard

---

## EXECUTIVE SUMMARY

Vi currently scores ~55% toward 77EZ readiness. This specification defines the concrete systems needed to reach 110% 77EZ: a system that demonstrates reliable multi-step reasoning, persistent identity, grounded memory, proactive intervention, and context-aware autonomy without hallucination.

**Not vibes. Systems.**

This document provides:
- Exact interface contracts
- Implementation order (phased to prevent repo destruction)
- Success criteria per pillar
- Integration points with existing architecture

---

## 77EZ+ DEFINITION (The Standard)

Vi must reliably deliver all of these capabilities, every time:

1. **Deep multi-step reasoning** with branching + constraint checking
2. **Reflection/self-correction loops** that actually change behavior
3. **Grounded memory + canon** enforced at generation time with citations
4. **Safe autonomy** with proactive triggers + guardrails
5. **Real-time interaction** with streaming + in-flight visibility
6. **Tool verification** with pre/post conditions + typed outputs + outcome checks
7. **Ops-grade observability** with metrics/tracing/alerts

---

## IMPLEMENTATION PILLARS

### PILLAR A — Reasoning Engine Upgrade (35 → 75)

**Goal:** Stop single-thread LLM "planning" and add real search + constraints.

#### A1: Branching Planner

**Interface Contract:**

```typescript
// core/vi/src/brain/planning/PlanGraph.ts
interface PlanCandidate {
  id: string;
  steps: PlanStep[];
  assumptions: string[];
  requiredTools: string[];
  estimatedCost: {
    tokens: number;
    toolCalls: number;
    timeSeconds: number;
  };
  failureModes: FailureMode[];
  score: PlanScore;
}

interface PlanScore {
  confidence: number;        // 0-1
  toolRisk: number;          // 0-1 (higher = riskier)
  dependencyDepth: number;   // steps with hard dependencies
  canonAlignment: number;    // 0-1 (canon mode compatibility)
  totalScore: number;        // weighted composite
}

interface FailureMode {
  condition: string;
  probability: number;
  mitigation: string;
  fallbackPlan?: string;     // ID of alternate plan
}

class BranchingPlanner {
  /**
   * Generate N candidate plans for a given intent
   * @param intent User intent from perception
   * @param context Current conversation/canon/memory state
   * @param N Number of candidates (default 3-5)
   */
  async generateCandidates(
    intent: Intent,
    context: PlanningContext,
    N: number = 5
  ): Promise<PlanCandidate[]>;

  /**
   * Score plans using deterministic rubric
   */
  scorePlan(plan: PlanCandidate, constraints: ConstraintSet): PlanScore;

  /**
   * Select best plan based on constraints and scores
   */
  selectBest(candidates: PlanCandidate[], constraints: ConstraintSet): PlanCandidate;
}
```

#### A2: Constraint Solver

**Interface Contract:**

```typescript
// core/vi/src/brain/planning/ConstraintSolver.ts
interface ConstraintSet {
  toolBudget: {
    maxCalls: number;
    maxCostUSD: number;
  };
  timeBudget: {
    maxSeconds: number;
  };
  citationRequirements: {
    requireCanon: boolean;        // Must cite canon entities
    requireMemory: boolean;       // Must cite memory sources
    minConfidence: number;        // 0-1
  };
  canonRules: {
    mode: CanonMode;              // brainstorm/commit/lock/export
    enforceConsistency: boolean;
    allowedDimensions: string[];
  };
  userContext: {
    permissionLevel: 'user' | 'operator' | 'admin';
    riskTolerance: number;        // 0-1
  };
}

interface ConstraintViolation {
  constraint: string;
  severity: 'fatal' | 'warning' | 'info';
  message: string;
  suggestedFix?: string;
}

class ConstraintSolver {
  /**
   * Check plan against constraint set
   * @returns violations (empty array = pass)
   */
  validate(plan: PlanCandidate, constraints: ConstraintSet): ConstraintViolation[];

  /**
   * Hard reject: fatal violations
   */
  isFatal(violations: ConstraintViolation[]): boolean;

  /**
   * Suggest plan modifications to satisfy constraints
   */
  suggestFixes(plan: PlanCandidate, violations: ConstraintViolation[]): PlanCandidate;
}
```

#### A3: Plan Execution With Backtracking

**Interface Contract:**

```typescript
// core/vi/src/brain/execution/BacktrackingExecutor.ts
interface ExecutionResult {
  success: boolean;
  evidence: Evidence[];
  confidence: number;
  nextAction: 'continue' | 'backtrack' | 'abort' | 'ask_user';
  reason?: string;
}

interface ExecutionBudget {
  maxRetries: number;
  maxTokenSpend: number;
  maxToolCalls: number;
  currentRetries: number;
  currentTokenSpend: number;
  currentToolCalls: number;
}

class BacktrackingExecutor {
  /**
   * Execute plan with backtracking support
   */
  async executePlan(
    plan: PlanCandidate,
    alternates: PlanCandidate[],
    budget: ExecutionBudget
  ): Promise<ExecutionResult>;

  /**
   * Evaluate step success
   */
  async evaluateStep(
    step: PlanStep,
    result: any,
    expectedEvidence: string[]
  ): Promise<StepEvaluation>;

  /**
   * Choose next action: continue, backtrack, or switch plan
   */
  chooseNextAction(
    evaluation: StepEvaluation,
    remainingBudget: ExecutionBudget,
    alternates: PlanCandidate[]
  ): ExecutionResult;
}
```

**Deliverable:** `PlanGraph` object + `PlanEvaluator` + `BacktrackingExecutor`

---

### PILLAR B — Reflection That Actually Works (Partial → Real)

**Goal:** Reflection is not a comment. It's a feedback controller.

#### B1: Structured Reflection Deltas

**Interface Contract:**

```typescript
// core/vi/src/brain/reflection/ReflectionDelta.ts
interface ReflectionDelta {
  timestamp: Date;
  executionId: string;
  
  errors: ReflectionError[];
  assumptions: AssumptionCheck[];
  missingData: MissingDataPoint[];
  corrections: CorrectionAction[];
  
  confidence: number;           // Overall confidence in execution
  shouldRetry: boolean;
  escalateToUser: boolean;
}

interface ReflectionError {
  type: 'tool_failure' | 'logic_error' | 'constraint_violation' | 'grounding_failure';
  step: string;
  message: string;
  severity: 'critical' | 'major' | 'minor';
}

interface AssumptionCheck {
  assumption: string;
  validated: boolean;
  evidence?: string[];
  failureReason?: string;
}

interface MissingDataPoint {
  what: string;                 // What data is missing
  source: 'memory' | 'canon' | 'tool' | 'user';
  retrievalStrategy: string;    // How to fetch it
  priority: number;             // 1-10
}

interface CorrectionAction {
  type: 'store_memory' | 'update_canon' | 'revise_plan' | 'ask_user' | 'run_tool';
  target: string;
  payload: any;
  reason: string;
}
```

#### B2: Self-Correction Loop

**Interface Contract:**

```typescript
// core/vi/src/brain/reflection/SelfCorrector.ts
interface CorrectionStrategy {
  action: CorrectionAction;
  estimatedConfidenceGain: number;
  cost: number;
}

class SelfCorrector {
  /**
   * Analyze reflection delta and determine correction strategy
   */
  async analyzeDelta(delta: ReflectionDelta): Promise<CorrectionStrategy[]>;

  /**
   * Execute single targeted user question (only if necessary)
   */
  async askTargetedQuestion(missing: MissingDataPoint): Promise<string>;

  /**
   * Run tool to fetch missing info
   */
  async fetchMissingData(missing: MissingDataPoint): Promise<any>;

  /**
   * Revise plan based on reflection
   */
  async revisePlan(
    originalPlan: PlanCandidate,
    delta: ReflectionDelta
  ): Promise<PlanCandidate>;

  /**
   * Apply corrections and continue or abort
   */
  async applyCorrections(
    strategies: CorrectionStrategy[],
    confidenceThreshold: number
  ): Promise<ExecutionResult>;
}
```

**Deliverable:** `Reflector` → `CorrectionAction[]` with loop integration

---

### PILLAR C — Grounding Enforcement (Canon + Memory) (30 → 80)

**Goal:** Vi becomes unable to answer ungrounded.

#### C1: Grounding Gate

**Interface Contract:**

```typescript
// core/vi/src/brain/grounding/GroundingGate.ts
interface GroundingRequirements {
  canonMode: CanonMode;
  requireCitations: boolean;
  minConfidence: number;
  allowUnknown: boolean;        // Can say "unknown in canon"
}

interface GroundingCheck {
  passed: boolean;
  citations: Citation[];
  missingGrounding: string[];   // What lacks grounding
  confidence: number;
  recommendation: 'allow' | 'block' | 'warn';
}

interface Citation {
  type: 'canon_entity' | 'memory' | 'tool_output' | 'user_input';
  id: string;                   // Entity ID or memory ID
  text: string;                 // Cited content
  confidence: number;
  timestamp?: Date;
}

class GroundingGate {
  /**
   * Check response for grounding before returning to user
   */
  async checkGrounding(
    response: string,
    context: ConversationContext,
    requirements: GroundingRequirements
  ): Promise<GroundingCheck>;

  /**
   * Enforce grounding or transform response
   */
  async enforceGrounding(
    response: string,
    check: GroundingCheck
  ): Promise<string>;

  /**
   * Extract citations from response
   */
  extractCitations(response: string, context: ConversationContext): Citation[];
}
```

#### C2: Canon-First Response Strategy

**Interface Contract:**

```typescript
// core/vi/src/brain/grounding/CanonFirstStrategy.ts
class CanonFirstStrategy {
  /**
   * Detect if query is lore-related
   */
  isLoreQuery(intent: Intent): boolean;

  /**
   * Resolve entities via Astralis
   */
  async resolveEntities(query: string, userId: string): Promise<ResolvedEntity[]>;

  /**
   * Compose response from resolved entities
   */
  composeCanonResponse(
    entities: ResolvedEntity[],
    query: string
  ): Promise<{ response: string; citations: Citation[] }>;

  /**
   * Attach citations in standard format
   */
  formatWithCitations(response: string, citations: Citation[]): string;
}
```

#### C3: Memory Expiry Bug Fix

**File:** `core/vi/src/db/repositories/MemoryInjectionRepository.ts`  
**Test:** `core/vi/tests/integration/phase-1.1-memory-injection.test.ts:147-167`

**Problem:** Expired injections intermittently returned by `listForSession`

**Fix Required:**
```typescript
// Ensure NOW() comparison is timezone-aware and uses consistent clock
// Add explicit test for edge cases around expiration boundary
// Consider adding a cleanup job or explicit expiry check
```

**Deliverable:** `GroundingGate` + citation format + fixed injection expiry

---

### PILLAR D — Safe Autonomy (25 → 70)

**Goal:** Vi can act without being asked, but only inside a controlled cage.

#### D1: Event Trigger Bus

**Interface Contract:**

```typescript
// core/vi/src/runtime/autonomy/EventBus.ts
type EventType = 
  | 'message.received'
  | 'codex.changed'
  | 'tool.completed'
  | 'schedule.tick'
  | 'anomaly.detected';

interface AutonomyEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  userId: string;
  sessionId: string;
  payload: any;
  metadata: Record<string, any>;
}

class EventBus {
  /**
   * Emit event to autonomy system
   */
  emit(event: AutonomyEvent): void;

  /**
   * Subscribe to event types
   */
  on(eventType: EventType, handler: (event: AutonomyEvent) => Promise<void>): void;

  /**
   * Unsubscribe
   */
  off(eventType: EventType, handler: Function): void;
}
```

#### D2: Relevance Scorer

**Interface Contract:**

```typescript
// core/vi/src/runtime/autonomy/RelevanceScorer.ts
interface RelevanceScore {
  urgency: number;              // 0-1 (how soon to act)
  importance: number;           // 0-1 (how critical)
  confidence: number;           // 0-1 (certainty of assessment)
  permissionLevel: 'user' | 'operator' | 'admin';
  risk: number;                 // 0-1 (potential for harm)
  shouldAct: boolean;
  reason: string;
}

class RelevanceScorer {
  /**
   * Score event for autonomous action
   */
  async scoreEvent(
    event: AutonomyEvent,
    context: ConversationContext
  ): Promise<RelevanceScore>;

  /**
   * Determine if autonomous action is permitted
   */
  isPermitted(score: RelevanceScore, policy: AutonomyPolicy): boolean;
}
```

#### D3: Autonomy Policies

**Interface Contract:**

```typescript
// core/vi/src/runtime/autonomy/AutonomyPolicy.ts
interface AutonomyPolicy {
  canonMode: CanonMode;
  
  actions: {
    brainstorm: {
      suggest: boolean;         // Can suggest ideas
      create: boolean;          // Can create drafts
      modify: boolean;          // Can modify existing
    };
    commit: {
      suggest: boolean;
      create: boolean;
      modify: boolean;
    };
    lock: {
      suggest: boolean;
      create: boolean;
      modify: boolean;
    };
    export: {
      suggest: boolean;
      create: boolean;
      modify: boolean;
    };
  };
  
  budgets: {
    maxActionsPerSession: number;
    maxToolCallsPerMinute: number;
    requireConfirmationAboveRisk: number;  // 0-1 threshold
  };
  
  interruptions: {
    ruleBreaks: boolean;        // Interrupt on rule violations
    suggestions: boolean;       // Interrupt with suggestions
    warnings: boolean;          // Interrupt with warnings
  };
}

class AutonomyPolicyEngine {
  /**
   * Get policy for current canon mode and user context
   */
  getPolicy(canonMode: CanonMode, userId: string): AutonomyPolicy;

  /**
   * Check if action is allowed
   */
  isActionAllowed(
    action: string,
    canonMode: CanonMode,
    score: RelevanceScore
  ): boolean;

  /**
   * Check if budget exceeded
   */
  isBudgetExceeded(sessionId: string): Promise<boolean>;
}
```

#### D4: Chime System

**Interface Contract:**

```typescript
// core/vi/src/runtime/autonomy/ChimeManager.ts
type ChimeType = 'warn' | 'block' | 'info' | 'suggest';

interface Chime {
  type: ChimeType;
  message: string;              // One line. That's it.
  source: 'validateDraft' | 'grounding_gate' | 'constraint_solver' | 'autonomy';
  severity: 'critical' | 'major' | 'minor' | 'info';
  actionable?: string;          // What user can do
}

class ChimeManager {
  /**
   * Emit chime to user
   */
  emit(chime: Chime, sessionId: string): void;

  /**
   * Get pending chimes for session
   */
  getPending(sessionId: string): Chime[];

  /**
   * Clear chimes after acknowledgment
   */
  clear(sessionId: string, chimeId: string): void;
}
```

**Deliverable:** `AutonomyLoop` with strict budget + `InterruptionManager`

---

### PILLAR E — Real-Time Presence (30 → 85)

**Goal:** Streaming responses and in-flight visibility so it feels alive.

#### E1: SSE Streaming

**Interface Contract:**

```typescript
// core/vi/src/runtime/streaming/StreamingService.ts
type StreamEventType =
  | 'token'
  | 'tool.start'
  | 'tool.complete'
  | 'plan.update'
  | 'citation'
  | 'warning'
  | 'complete';

interface StreamEvent {
  type: StreamEventType;
  timestamp: Date;
  data: any;
}

// New endpoint: /v1/chat/stream (alongside existing /v1/chat)
interface StreamingChatRequest {
  message: string;
  conversationId?: string;
  userId: string;
  sessionId: string;
}

class StreamingService {
  /**
   * Stream chat response via SSE
   */
  async streamChat(
    request: StreamingChatRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<void>;

  /**
   * Stream tokens as they're generated
   */
  streamTokens(tokens: AsyncIterable<string>, streamId: string): void;

  /**
   * Stream tool execution events
   */
  streamToolEvents(toolCall: ToolCall, streamId: string): void;

  /**
   * Stream plan updates
   */
  streamPlanUpdates(plan: PlanCandidate, streamId: string): void;
}
```

#### E2: In-Flight Debug View

**Interface Contract:**

```typescript
// Data structure for Sovereign debug panel
interface InFlightState {
  sessionId: string;
  currentPlan: {
    id: string;
    steps: PlanStep[];
    currentStepIndex: number;
  };
  toolCalls: {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'complete' | 'failed';
    result?: any;
  }[];
  canonStates: {
    entityId: string;
    state: any;
    appliedAt: Date;
  }[];
  citations: Citation[];
  warnings: Chime[];
}

// WebSocket or SSE endpoint: /v1/debug/state/:sessionId
class DebugStateService {
  /**
   * Get current in-flight state
   */
  async getState(sessionId: string): Promise<InFlightState>;

  /**
   * Subscribe to state updates
   */
  subscribeToUpdates(
    sessionId: string,
    onUpdate: (state: InFlightState) => void
  ): void;
}
```

**UI Component (Sovereign):**
```typescript
// Minimal but critical debug panel
interface DebugPanelProps {
  sessionId: string;
}

// Shows:
// - Current plan (which step)
// - Tool calls and results
// - Applied canon states
// - Grounding citations
// - Warnings (why Vi is interrupting)
```

**Deliverable:** SSE + event stream schema + Sovereign debug panel

---

### PILLAR F — Tool Verification Chains (45 → 80)

**Goal:** Tools are not "called." They are verified.

#### F1: Typed Tool Outputs

**Interface Contract:**

```typescript
// core/vi/src/tools/VerifiedToolResult.ts
interface VerifiedToolResult<T = any> {
  success: boolean;
  result: T;
  evidence: Evidence[];
  confidence: number;           // 0-1
  postconditionsMet: boolean;
  postconditionChecks: PostconditionCheck[];
  executionTime: number;
  warnings?: string[];
}

interface Evidence {
  type: 'db_record' | 'api_response' | 'file_content' | 'computation';
  source: string;
  data: any;
  timestamp: Date;
}

interface PostconditionCheck {
  condition: string;
  met: boolean;
  evidence?: Evidence;
  reason?: string;
}
```

#### F2: Pre/Post Conditions

**Interface Contract:**

```typescript
// core/vi/src/tools/verification/ToolVerifier.ts
interface Precondition {
  check: (input: any, context: any) => boolean | Promise<boolean>;
  message: string;
}

interface Postcondition {
  check: (result: any, input: any, context: any) => boolean | Promise<boolean>;
  message: string;
  evidence?: string;            // What to verify
}

interface VerifiableTool extends Tool {
  preconditions: Precondition[];
  postconditions: Postcondition[];
  
  /**
   * Execute with automatic verification
   */
  executeVerified(input: any, context: any): Promise<VerifiedToolResult>;
}

class ToolVerifier {
  /**
   * Check preconditions before execution
   */
  async checkPreconditions(
    tool: VerifiableTool,
    input: any,
    context: any
  ): Promise<{ passed: boolean; violations: string[] }>;

  /**
   * Check postconditions after execution
   */
  async checkPostconditions(
    tool: VerifiableTool,
    result: any,
    input: any,
    context: any
  ): Promise<{ passed: boolean; violations: string[] }>;

  /**
   * Retry with adjusted plan or fallback tool
   */
  async retryOrFallback(
    tool: VerifiableTool,
    result: VerifiedToolResult,
    fallbacks: VerifiableTool[]
  ): Promise<VerifiedToolResult>;
}
```

#### F3: Outcome Checks

**Interface Contract:**

```typescript
// core/vi/src/tools/verification/OutcomeChecker.ts
class OutcomeChecker {
  /**
   * Verify claimed entity creation
   */
  async verifyEntityCreated(entityId: string, repo: any): Promise<boolean>;

  /**
   * Verify claimed relationship addition
   */
  async verifyRelationship(
    entityId: string,
    relationshipType: string,
    targetId: string,
    repo: any
  ): Promise<boolean>;

  /**
   * Verify claimed data modification
   */
  async verifyModification(
    target: string,
    expectedState: any,
    repo: any
  ): Promise<boolean>;

  /**
   * Generic outcome verification
   */
  async verifyOutcome(
    claim: string,
    verificationFn: () => Promise<boolean>
  ): Promise<{ verified: boolean; evidence?: any }>;
}
```

**Deliverable:** `ToolVerifier` + `OutcomeChecker` integrated into executor

---

### PILLAR G — Ops & Robustness (50 → 85)

**Goal:** Production-grade visibility and failure containment.

#### G1: Metrics

**Interface Contract:**

```typescript
// core/vi/src/telemetry/MetricsCollector.ts
interface Metrics {
  requests: {
    total: Counter;
    latency: Histogram;
    errors: Counter;
  };
  tools: {
    calls: Counter;
    latency: Histogram;
    failures: Counter;
  };
  memory: {
    retrievals: Counter;
    retrievalLatency: Histogram;
  };
  tokens: {
    input: Counter;
    output: Counter;
    cost: Gauge;
  };
  pipeline: {
    stageLatency: Histogram;
    reflectionLoops: Counter;
  };
}

class MetricsCollector {
  /**
   * Record request
   */
  recordRequest(latency: number, status: number, endpoint: string): void;

  /**
   * Record tool execution
   */
  recordTool(name: string, latency: number, success: boolean): void;

  /**
   * Record memory retrieval
   */
  recordMemoryRetrieval(latency: number, resultsCount: number): void;

  /**
   * Export metrics (Prometheus format)
   */
  export(): string;
}
```

#### G2: Tracing

**Interface Contract:**

```typescript
// core/vi/src/telemetry/TracingService.ts
// OpenTelemetry integration
interface Span {
  name: string;
  startTime: Date;
  endTime?: Date;
  attributes: Record<string, any>;
  events: SpanEvent[];
  status: 'ok' | 'error';
}

interface SpanEvent {
  name: string;
  timestamp: Date;
  attributes: Record<string, any>;
}

class TracingService {
  /**
   * Start span for pipeline stage
   */
  startSpan(name: string, attributes?: Record<string, any>): Span;

  /**
   * End span
   */
  endSpan(span: Span, status: 'ok' | 'error'): void;

  /**
   * Add event to span
   */
  addEvent(span: Span, event: SpanEvent): void;

  /**
   * Export traces (OpenTelemetry format)
   */
  export(): any;
}
```

#### G3: Alerts

**Alert Rules:**

```yaml
# core/vi/config/alerts.yml
alerts:
  - name: high_error_rate
    condition: error_rate > 0.05
    duration: 5m
    severity: critical
    
  - name: db_connection_failure
    condition: db_pool_available == 0
    duration: 1m
    severity: critical
    
  - name: qdrant_unavailable
    condition: vector_store_health == false
    duration: 2m
    severity: major
    
  - name: high_tool_failure_rate
    condition: tool_failure_rate > 0.10
    duration: 5m
    severity: major
    
  - name: reflection_loop_excessive
    condition: reflection_loops_per_request > 3
    duration: 10m
    severity: warning
```

#### G4: Load Test Harness

**k6 Scenario:**

```javascript
// core/vi/tests/load/chat-scenario.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up
    { duration: '5m', target: 50 },   // Steady load
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% under 2s
    http_req_failed: ['rate<0.05'],    // Error rate under 5%
  },
};

export default function () {
  const payload = JSON.stringify({
    message: 'Tell me about Akima',
    userId: `user-${__VU}`,
    sessionId: `session-${__VU}-${__ITER}`,
  });

  const res = http.post('http://localhost:3100/v1/chat', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has response': (r) => r.json('response') !== undefined,
  });

  sleep(1);
}
```

**Deliverable:** Prometheus + OpenTelemetry traces + alert rules + k6 load test

---

## IMPLEMENTATION ORDER (Locked)

**Do NOT "do everything at once." Sequence matters to keep the system stable.**

### Phase 1: Foundation Fixes (Week 1)
1. **Fix memory expiry bug** (C3)
   - File: `core/vi/src/db/repositories/MemoryInjectionRepository.ts`
   - Test: `core/vi/tests/integration/phase-1.1-memory-injection.test.ts:147-167`
   - **Why first:** Autonomy with zombie memory = "why did Vi do that?" forever

### Phase 2: Grounding (Week 1-2)
2. **Grounding Gate + canon-first** (C1, C2)
   - Implement `GroundingGate`
   - Implement `CanonFirstStrategy`
   - Integrate into response pipeline
   - Add citation format
   - **Why now:** Enforcement layer must exist before reasoning gets smarter

### Phase 3: Smart Planning (Week 2-3)
3. **Branching planner + constraint solver** (A1, A2)
   - Implement `BranchingPlanner`
   - Implement `ConstraintSolver`
   - Generate N candidate plans
   - Score and select best plan
   - **Why now:** Real reasoning foundation

### Phase 4: Self-Correction (Week 3-4)
4. **Backtracking executor + reflection deltas** (A3, B1, B2)
   - Implement `BacktrackingExecutor`
   - Implement structured `ReflectionDelta`
   - Implement `SelfCorrector`
   - Wire reflection loop
   - **Why now:** Planning + correction = reliable reasoning

### Phase 5: Verified Actions (Week 4-5)
5. **Tool verification + outcome checks** (F1, F2, F3)
   - Add typed tool outputs (`VerifiedToolResult`)
   - Implement `ToolVerifier` with pre/post conditions
   - Implement `OutcomeChecker`
   - Integrate into executor
   - **Why now:** Trustworthy actions before autonomy

### Phase 6: Real-Time Feel (Week 5-6)
6. **SSE streaming + debug view** (E1, E2)
   - Add `/v1/chat/stream` endpoint
   - Implement `StreamingService`
   - Build Sovereign debug panel
   - Stream tokens, tools, plans, citations
   - **Why now:** Jarvis feel requires visibility

### Phase 7: Safe Autonomy (Week 6-7)
7. **Autonomy loop** (D1, D2, D3, D4)
   - Implement `EventBus`
   - Implement `RelevanceScorer`
   - Implement `AutonomyPolicyEngine`
   - Implement `ChimeManager`
   - Wire autonomy triggers
   - **Why now:** Now safe to enable (grounding + verification in place)

### Phase 8: Production Ops (Week 7-8)
8. **Ops stack** (G1, G2, G3, G4)
   - Add Prometheus metrics
   - Add OpenTelemetry tracing
   - Configure alert rules
   - Create k6 load tests
   - **Why last:** You'll regret it if you skip, but it doesn't block features

---

## SUCCESS CRITERIA

### Per Pillar

**A - Reasoning (35 → 75):**
- [ ] Generate 5 candidate plans for complex queries
- [ ] Score plans with deterministic rubric
- [ ] Reject plans violating constraints
- [ ] Backtrack to alternate plan on failure
- [ ] Max 3 retries per execution

**B - Reflection (Partial → Real):**
- [ ] Reflection outputs structured deltas
- [ ] Self-correction loop converges in max 2 iterations
- [ ] Stores corrections to memory/canon
- [ ] Asks targeted questions (not vague ones)

**C - Grounding (30 → 80):**
- [ ] All lore responses cite canon entities
- [ ] Grounding gate blocks ungrounded responses in lock/export mode
- [ ] Memory expiry test passes consistently
- [ ] Citations include entity IDs + ledger changes

**D - Autonomy (25 → 70):**
- [ ] Autonomy loop fires on relevant events
- [ ] Respects canon mode policies
- [ ] Stays within budget (max actions per session)
- [ ] Chimes on rule breaks and suggestions

**E - Real-Time (30 → 85):**
- [ ] SSE streaming delivers tokens in <100ms chunks
- [ ] Debug panel shows current plan/step
- [ ] Tool events stream in real-time
- [ ] Citations appear as they're generated

**F - Verification (45 → 80):**
- [ ] All tools return `VerifiedToolResult`
- [ ] Preconditions checked before execution
- [ ] Postconditions checked after execution
- [ ] Failed tools retry or fallback

**G - Ops (50 → 85):**
- [ ] Prometheus metrics exported on `/metrics`
- [ ] OpenTelemetry traces exported
- [ ] Alert rules configured and firing
- [ ] k6 load test passes with p95 < 2s

### Overall 77EZ Standard

**Vi must demonstrate (in live use):**

✅ **Multi-step reasoning:** Generate plan → execute → reflect → correct → complete  
✅ **Grounded responses:** All lore answers cite canon, all memory refs cite sources  
✅ **Safe autonomy:** Suggest improvements without breaking canon mode rules  
✅ **Real-time feel:** Stream responses, show in-flight state  
✅ **Verified actions:** Tools verify outcomes, retry on failure  
✅ **Ops visibility:** Metrics, traces, alerts active

---

## EXAMPLE: What 110% 77EZ Feels Like

**User:** "Vi, build Akima's new form."

**Vi (streaming):**
```
[PLAN] Generated 4 candidate plans, selecting safest...
[CANON] Querying existing Akima entities...
[WARN] Conflict detected: Akima (id:akm-001) already has locked form in Era 3.
[CHIME] ⚠️  That violates your rule: no retroactive form changes in locked eras.
[SUGGEST] Options:
  1. Switch canonMode to 'brainstorm' to draft alternate timeline
  2. Create new form in Era 4 (post-lock)
  3. Create variant entity (Akima-Alt)
  
Waiting for your choice...
```

**User:** "Option 2."

**Vi:**
```
[PLAN] Creating form in Era 4...
[TOOL] astralis.create_or_update (entity: Akima, era: 4, facet: form)
[VERIFY] Postcondition met: entity exists in DB
[CANON] Ledger entry created (id: lch-7742)
[EXPORT] Writer packet ready
[EXPORT] Art packet ready

✅ Created Akima's Era 4 form.

Citations:
- Entity: Akima (akm-001)
- Era: Era 4 (era-004)
- Change: Form Update (lch-7742)
- Constraints: Locked era rules respected
```

**That's Jarvis behavior.** Not because of swagger, because the system forces correctness.

---

## FINAL NOTES

### To Kaelen
You're not missing "more features." You're missing **loops + enforcement.**

### To Copilot
Your architecture already supports this. **Do not refactor the world.** Add the missing controllers.

### Integration Points
All interfaces above integrate with existing:
- `CognitionPipeline` (add stages)
- `ToolRunner` (wrap with verification)
- `CodexService` (query for grounding)
- `PolicyEngine` (add autonomy policies)
- `server.ts` (add streaming endpoint)

### Testing Strategy
Each pillar gets:
- Unit tests for core logic
- Integration test for end-to-end flow
- Load test for performance validation

### Documentation Updates
After implementation, update:
- `COMPREHENSIVE_AUDIT.md` (new capabilities)
- `core/vi/docs/API.md` (new endpoints)
- `ops/tentai-docs/00-ecosystem/ROADMAP.md` (phase completion)

---

**End of 77EZ Closure Specification**
