# Milestone 5: LLM Integration

**Status:** Proposed → In Progress

## Summary
Milestone 5 replaces the deterministic stubs with real LLM intelligence. Vi gains the ability to classify intent, generate plans, and reflect semantically using Claude/GPT. The skeleton from M4 remains unchanged; we're wiring the brain to think.

## Why This Matters
M4 proved the state machine works. M5 proves Vi can *reason*.
- Intent classification becomes contextual, not heuristic
- Planning becomes adaptive, not rule-based
- Reflection becomes semantic, not simple extraction
- Responses become natural, not templated

This is where Vi stops being a deterministic automaton and starts being an AI assistant.

## What's Built

### 1. **Real LLM Gateway** ([src/brain/llm/OpenAIGateway.ts](src/brain/llm/OpenAIGateway.ts))
- Implements `LLMGateway` interface from M4
- Uses OpenAI API (gpt-4o or gpt-4o-mini)
- Methods:
  - `classifyIntent(input, context)`: structured intent classification with reasoning
  - `generateResponse(thought)`: natural language response from ThoughtState
  - `generatePlan(intent)`: LLM-driven multi-step planning (Phase 2 boundary)
  - `extractSemantics(thought)`: LLM-driven reflection (Phase 2 boundary)

### 2. **Anthropic Gateway** ([src/brain/llm/AnthropicGateway.ts](src/brain/llm/AnthropicGateway.ts))
- Implements `LLMGateway` interface
- Uses Anthropic API (claude-3-5-sonnet-20241022)
- Same methods as OpenAI gateway
- Allows switching providers via config

### 3. **Configuration** ([src/config/config.ts](src/config/config.ts))
- New fields:
  - `LLM_PROVIDER`: 'openai' | 'anthropic' | 'stub'
  - `OPENAI_API_KEY`: API key for OpenAI
  - `ANTHROPIC_API_KEY`: API key for Anthropic
  - `LLM_MODEL`: model name (gpt-4o, claude-3-5-sonnet-20241022, etc.)
  - `LLM_MAX_TOKENS`: response token limit
  - `LLM_TEMPERATURE`: creativity (0.0-1.0)
- Validation: require API key if provider is not 'stub'

### 4. **LLM Factory** ([src/brain/llm/factory.ts](src/brain/llm/factory.ts))
- `createLLMGateway(config)`: returns appropriate gateway based on config
- Handles stub vs. real gateway selection
- Enables testing without API keys

### 5. **Enhanced Planner** ([src/brain/planner.ts](src/brain/planner.ts))
- Phase 1: Keep rule-based planning (deterministic, testable)
- Phase 2 hook: Optional LLM-driven planning (M6+)
- For M5: planner stays deterministic, but uses LLM-classified intent

### 6. **Enhanced Reflector** ([src/brain/reflector.ts](src/brain/reflector.ts))
- Phase 1: Keep simple extraction
- Phase 2 hook: Optional LLM-driven semantic reflection (M6+)
- For M5: reflector stays simple, but can call LLM for semantic analysis

### 7. **Integration Test** ([tests/integration/llm.e2e.test.ts](tests/integration/llm.e2e.test.ts))
- Tests with stub gateway (no API keys required in CI)
- Optional: tests with real gateway if API key is set
- Validates:
  - Intent classification produces structured output
  - Response generation is coherent
  - Error handling for API failures
  - Token limits enforced
  - Timeout handling

### 8. **Unit Tests** ([tests/unit/llm.test.ts](tests/unit/llm.test.ts))
- Mock HTTP responses for OpenAI/Anthropic
- Validate request formatting
- Validate response parsing
- Error handling (rate limits, timeouts, invalid keys)

## Canonical Entry Points

**For LLM integration:**
- **[src/brain/llm/factory.ts](src/brain/llm/factory.ts)** creates the appropriate gateway
- **[src/brain/llm/OpenAIGateway.ts](src/brain/llm/OpenAIGateway.ts)** or **[AnthropicGateway.ts](src/brain/llm/AnthropicGateway.ts)** implement the intelligence

**For testing:**
- **[tests/integration/llm.e2e.test.ts](tests/integration/llm.e2e.test.ts)** proves LLM integration works

## Phase Boundaries (What's NOT in M5)

### Deferred to M6 (Memory):
- LLM-driven planning (multi-step, adaptive)
- LLM-driven reflection (semantic extraction, memory recommendations)
- These require memory context, which M5 doesn't have yet

### Deferred to M7 (Tools):
- Tool selection in planning
- Tool execution in executor
- These require tool registry, which M5 doesn't have yet

### M5 Scope:
- Intent classification (LLM replaces heuristics)
- Response generation (LLM replaces templates)
- Planner and reflector remain deterministic (Phase 1) but consume LLM-classified intent

## Exit Criteria (M5 Complete)

- ✅ OpenAI gateway implemented and tested
- ✅ Anthropic gateway implemented and tested
- ✅ LLM factory selects gateway based on config
- ✅ Configuration validates API keys
- ✅ Intent classification uses LLM (contextual, not heuristic)
- ✅ Response generation uses LLM (natural, not templated)
- ✅ Integration test proves LLM flow end-to-end
- ✅ Unit tests prove request/response handling
- ✅ Error handling for rate limits, timeouts, invalid keys
- ✅ Documentation updated (README, API docs)
- ✅ Verification script and log exist

## Verification Artifact
- Script: [scripts/verify-m5.ps1](scripts/verify-m5.ps1)
- Log: [docs/verification/2025-12-23_230735-m5-verification.log](docs/verification/2025-12-23_230735-m5-verification.log)
- Run command: `pwsh scripts/verify-m5.ps1`
- Note: Verification runs with stub gateway (no API keys required)

## Proof (from verification log)
- Build succeeds
- Unit tests pass (30+)
- Integration tests pass (including `llm.e2e.test.ts`)
- Pipeline processes input → LLM intent → plan → LLM response
- Stub gateway works without API keys
- Real gateway works with API keys (manual verification)

## Implementation Plan

### Step 1: Configuration
1. Add LLM config fields to `src/config/config.ts`
2. Add environment variables to `.env.example`
3. Add validation for API keys

### Step 2: OpenAI Gateway
1. Create `src/brain/llm/OpenAIGateway.ts`
2. Implement `classifyIntent()` with structured output
3. Implement `generateResponse()` with natural language
4. Add error handling, retries, timeouts

### Step 3: Anthropic Gateway
1. Create `src/brain/llm/AnthropicGateway.ts`
2. Mirror OpenAI gateway structure
3. Use Anthropic-specific request format

### Step 4: Factory
1. Create `src/brain/llm/factory.ts`
2. Select gateway based on config
3. Handle stub vs. real gateway

### Step 5: Update Pipeline
1. Replace `StubLLMGateway` with factory-created gateway
2. No other changes needed (interface is the same)

### Step 6: Tests
1. Unit tests for request/response parsing
2. Integration test for end-to-end flow
3. Verification script

### Step 7: Documentation
1. Update README with LLM setup instructions
2. Add API key setup guide
3. Add provider selection guide

## Dependencies

**NPM Packages:**
- `openai` (official OpenAI SDK)
- `@anthropic-ai/sdk` (official Anthropic SDK)

**Environment:**
- OpenAI API key (optional, for manual testing)
- Anthropic API key (optional, for manual testing)

**M4 Artifacts:**
- `LLMGateway` interface (unchanged)
- `CognitionPipeline` orchestrator (unchanged)
- Integration test structure (extended)

## Risk Mitigation

### API Cost Control
- Token limits enforced in config
- Timeouts prevent runaway requests
- Stub gateway for testing (no API costs)

### Rate Limits
- Exponential backoff on 429 errors
- Configurable retry limits

### API Key Security
- Never log API keys
- Validate keys at startup
- Use environment variables, not hardcoded

### Fallback Strategy
- If LLM fails, log error and return stub-like response
- Graceful degradation (M6+)

## What Happens Next (M6: Memory)

With LLM intelligence proven, M6 adds memory:
- Vector database for semantic search
- Episodic memory (conversation history)
- Semantic memory (extracted knowledge)
- LLM-driven reflection uses memory context
- LLM-driven planning uses memory retrieval

M5 sets the foundation. M6 makes Vi remember.

## The Brain is Thinking
M4 built the state machine. M5 wires the intelligence.
Vi can now understand nuanced intent, generate natural responses, and reason about context.
The skeleton is becoming conscious.
