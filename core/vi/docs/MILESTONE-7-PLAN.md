# Milestone 7: Tools Framework

**Status:** Proposed → (In Progress)

## Summary
Milestone 7 implements Vi's tool execution layer—the bridge between reasoning (M4 cognition) and action (actually doing things). Tools enable Vi to:
- Execute calculations, searches, API calls
- Access external services (weather, email, automation)
- Perform file operations (read, write, list)
- Run system commands (with sandboxing)

Phase 1 focuses on infrastructure: tool registry, selection mechanism, sandboxed execution, audit trail.
Phase 2 (M7.2) wires tools into the cognition pipeline and planner.

## Why This Matters
Until M7, Vi can reason but not act. With tools, Vi becomes useful:
- Query weather → call weather API
- Calculate taxes → run math tool
- Search knowledge → query API
- Remember important facts → store to memory

## What Gets Built

### 1. **Tool Type System** ([src/tools/types.ts](src/tools/types.ts))
- `Tool`: interface defining tool contract
  - `name`: unique identifier (e.g., "search_web", "get_weather")
  - `description`: what it does (for LLM selection)
  - `parameters`: JSON Schema for inputs
  - `execute()`: async function doing the work
  - `rateLimit`: calls/minute allowed
  - `cost`: credits/execution (prevent abuse)
  - `permissions`: required capabilities (file, network, etc.)

- `ToolResult`: execution outcome
  - `success`: boolean
  - `data`: result payload
  - `error`: exception message if failed
  - `executionTime`: milliseconds
  - `costApplied`: credits deducted

- `ToolRegistry`: mapping of tool name → Tool instance

- `ToolSelection`: which tool to use
  - `toolName`: selected tool
  - `parameters`: validated inputs
  - `reasoning`: why this tool was chosen

### 2. **Tool Registry** ([src/tools/registry.ts](src/tools/registry.ts))
- Central catalog of all tools
- Registration API: `register(tool)`, `get(name)`, `list()`, `search(keyword)`
- Metadata: categorize tools (search, compute, file, system, api, memory)
- Validation: JSON Schema validation on register

### 3. **Tool Selection** ([src/tools/selector.ts](src/tools/selector.ts))
- Deterministic Phase 1: match intent → tool (query "weather" → weather tool)
- Phase 2: LLM-based selection ("I need the current temperature" → embeddings → find weather tool)
- Confidence scoring (exact match vs semantic match)
- Fallback when tool not found

### 4. **Tool Runner** ([src/tools/runner.ts](src/tools/runner.ts))
- `ToolRunner` interface: sandboxed execution
- `LocalToolRunner`: execute registered tools locally
  - Input validation (JSON Schema)
  - Rate limiting (reject if limit exceeded for user)
  - Cost tracking (deduct from user credit)
  - Timeout enforcement (prevent hanging tools)
  - Error handling (graceful failure)
  - Audit logging (who, what, when, success/failure)

### 5. **Built-In Tools (Phase 1)** ([src/tools/builtins/](src/tools/builtins/))
Start with safe, deterministic tools:
- `search_memory`: semantic search of user's memory
- `get_current_time`: system time (trivial but proves execution)
- `calculate`: safe math (eval in restricted sandbox)
- `list_tools`: enumerate available tools (meta)
- `get_user_context`: fetch user profile info (with privacy checks)

Phase 2 adds:
- `search_web`: call search API
- `call_external_api`: generic HTTP with allowlist
- `run_shell_command`: sandboxed bash/pwsh

Phase 3 adds:
- `send_email`: SendGrid/SMTP integration
- `create_calendar_event`: calendar system integration
- `access_file_system`: read/write with permission checks

### 6. **Sandboxing & Security** ([src/tools/sandbox.ts](src/tools/sandbox.ts))
- **Input Validation**: JSON Schema + type coercion
- **Output Sanitization**: remove sensitive data before returning
- **Rate Limiting**: per-user, per-tool quotas
- **Cost Enforcement**: credit system prevents abuse
- **Timeout**: kill long-running executions
- **Audit Trail**: log all executions (user, tool, params, result, status)
- **Permissions**: tool declares what it needs; system checks before execution

### 7. **Integration with Cognition Pipeline** ([src/brain/executor.ts](src/brain/executor.ts) Phase 2)
- Executor calls tool runner: `toolRunner.execute(toolSelection, userId)`
- Tool results become execution results
- Failures propagate to reflector (handle gracefully)
- Memory integration: tool results stored as episodic memory

### 8. **Database Schema** ([src/db/migrations.ts](src/db/migrations.ts))
- `0008_add_tool_execution_log`:
  - `id`, `user_id` (FK), `tool_name`, `parameters` (JSONB), `result` (JSONB), `status` (success|failure|timeout), `execution_time_ms`, `cost_applied`, `created_at`
  - Index on user_id + created_at for audit queries

- `0009_add_user_credits`:
  - `id`, `user_id` (FK), `credits_balance`, `credits_spent`, `last_reset`, `reset_cycle` (monthly|daily)
  - Track credit spending for rate limiting

### 9. **Configuration** ([src/config/config.ts](src/config/config.ts) Phase 1)
- `tools.enabled`: true/false
- `tools.rateLimit.defaultCallsPerMinute`: 10
- `tools.costTracking.enabled`: true/false
- `tools.costTracking.creditsPerExecution`: 1
- `tools.sandboxing.timeout`: 30000ms
- `tools.sandboxing.memory`: 256MB (Phase 2)

### 10. **Integration Test** ([tests/integration/tools.e2e.test.ts](tests/integration/tools.e2e.test.ts))
- Register a test tool
- Validate it appears in registry
- Execute it successfully
- Check execution log is stored
- Rate limiting prevents overage
- Cost tracking deducts correctly
- Audit trail is complete

## Canonical Entry Points

**For developers adding tools:**
- **[src/tools/types.ts](src/tools/types.ts)**: Understand `Tool` interface
- **[src/tools/registry.ts](src/tools/registry.ts)**: How to register your tool
- **[src/tools/builtins/](src/tools/builtins/)**: Copy a built-in tool as template

**For understanding execution:**
- **[src/tools/runner.ts](src/tools/runner.ts)**: Sandboxing + rate limiting + cost tracking
- **[src/tools/selector.ts](src/tools/selector.ts)**: How tools are chosen

**For testing:**
- **[tests/integration/tools.e2e.test.ts](tests/integration/tools.e2e.test.ts)**: End-to-end tool execution proof

## Verification Artifact (Upon Completion)
- Script: [scripts/verify-m7.ps1](scripts/verify-m7.ps1)
- Log: [docs/verification/2025-12-24_xxxxxxxx-m7-verification.log](docs/verification/2025-12-24_xxxxxxxx-m7-verification.log)
- Run command: `pwsh scripts/verify-m7.ps1`

## Exit Criteria (M7.1 Complete)
- ✅ Tool type system defined (Tool, ToolResult, ToolRegistry, ToolSelection)
- ✅ Tool registry implemented with registration API
- ✅ Tool selection mechanism (deterministic Phase 1)
- ✅ Tool runner with sandboxing, rate limiting, cost tracking
- ✅ 5 built-in tools registered (search_memory, get_current_time, calculate, list_tools, get_user_context)
- ✅ Database migrations for execution log + credits
- ✅ Integration test proves end-to-end execution
- ✅ Configuration system for tool feature flags
- ✅ Verification script and log exist

## What's NOT In M7.1 (Phase Boundaries)

### Deferred to M7.2 (Planner Integration):
- LLM-based tool selection (needs LLM to recommend tools)
- Planner rewiring to include tool steps in Plan
- Multi-step tool orchestration

### Deferred to Phase 3 (Advanced Tools):
- External API integrations (weather, search, email)
- Sandboxed shell execution (bash, pwsh)
- File system access with permission checks
- Custom user tools (allow users to add tools)

### Deferred to Phase 4+ (Knowledge Tools):
- Knowledge base search integration
- Cross-system tool chaining
- Advanced cost modeling
- ML-based tool selection

## Implementation Order

1. **types.ts**: Tool interface, ToolResult, ToolSelection, ToolRegistry
2. **registry.ts**: Register, get, list, search functions
3. **selector.ts**: Deterministic matching (intent → tool)
4. **runner.ts**: Execution with validation, rate limiting, cost, timeout, audit
5. **builtins/**: Implement 5 built-in tools
6. **sandbox.ts**: Input validation, output sanitization (shared with runner)
7. **migrations.ts**: Add tool_execution_log, user_credits tables
8. **config.ts**: Add tools.* settings
9. **executor.ts** (M7.2): Update to use tool runner
10. **tools.e2e.test.ts**: Comprehensive integration test

## Risk Mitigation

**Risk:** Tools execute arbitrary code (security)
- **Mitigation:** Explicit sandbox layer, JSON Schema validation, timeout enforcement, user credits prevent abuse

**Risk:** Tool results poison the cognition pipeline
- **Mitigation:** ToolResult always includes success flag; executor handles failures gracefully (falls back to "tool unavailable" response)

**Risk:** Tools become bottleneck if external API slow
- **Mitigation:** Timeout enforcement (default 30s); async/await prevents blocking

**Risk:** Users spawn N tools simultaneously, exhaust resources
- **Mitigation:** Rate limiting per user, cost system with credits, concurrent execution limits in Phase 2

## The Tools Enable Agency
Without tools, Vi is a thoughtful chatbot.
With tools, Vi becomes an agent: it can observe (memory), reason (cognition), and act (tools).
M7 makes agency possible.

## Brain Progress Upon Completion
- ✅ M4: Cognition Skeleton (45%)
- ✅ M5: LLM Integration (55%)
- ✅ M6: Memory & Consolidation (65%)
- ⏳ M7: Tools Framework (75%)
- ⏳ M8: Knowledge Base (85%)
- ⏳ M9: Safety & Guardrails (95%)
- ⏳ M10: Continuous Learning (100%)

## Next Phases
- **M7.2**: Planner integration (tools become part of plan steps)
- **M7.3**: Advanced tool categories (API, shell, file system)
- **M8**: Knowledge base (long-term reasoning with facts)
- **M9**: Safety & guardrails (additional checks, policy engine)
- **M10**: Continuous learning (reward signals, online finetuning)
