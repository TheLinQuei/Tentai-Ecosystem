# M8: LLM-Driven Planning

**Status:** In Progress  
**Date:** 2025-12-24

## Context
M7 provides a tools framework with built-in tools (list, time, calculate, search memory, user context). The Planner currently uses rule-based logic to map intents to plan steps. M8 upgrades the Planner to leverage LLM reasoning for dynamic, context-aware plan generation.

## Goals
- Enable the Planner to call an LLM (via `LLMGateway.generatePlan`) to produce multi-step plans.
- LLM receives: user intent, available tools, execution context (user ID, session history).
- LLM returns: structured JSON plan with steps (tool calls, policy checks, responses).
- Integrate with existing `ToolSelector` and `ToolRunner` for seamless tool invocation.
- Preserve fallback to rule-based planning when LLM is unavailable (stub mode).

## Design

### Input to LLM
```json
{
  "intent": {
    "category": "query",
    "confidence": 0.9,
    "reasoning": "User is asking about time"
  },
  "availableTools": ["list_tools", "get_current_time", "calculate", "search_memory", "get_user_context"],
  "context": {
    "userId": "uuid",
    "recentHistory": ["previous turn summaries"],
    "userPreferences": {}
  }
}
```

### Output from LLM
```json
{
  "steps": [
    {
      "id": "step-1",
      "type": "tool_call",
      "description": "Get current time",
      "toolName": "get_current_time",
      "toolParams": {},
      "reasoning": "User asked for the time"
    },
    {
      "id": "step-2",
      "type": "respond",
      "description": "Respond with the time",
      "dependencies": ["step-1"]
    }
  ],
  "reasoning": "Plan involves getting the current time and responding."
}
```

### Implementation
- Add `generatePlan` method to `OpenAIGateway` and `AnthropicGateway`.
- Update `Planner` to call `llmGateway.generatePlan(intent, context)` when LLM is available.
- Fallback to rule-based planning if LLM call fails or provider is "stub".
- Validate LLM-generated plan structure before execution (JSON schema check).
- Unit tests for plan generation with mock LLM responses.
- Integration test for end-to-end LLM planning flow.

## Constraints
- LLM must return valid JSON matching `Plan` schema.
- Plan must only reference tools that exist in the registry.
- Maximum plan complexity: 10 steps (prevent runaway LLM plans).
- Timeout: 30 seconds for LLM plan generation.

## Testing Strategy
- Unit test: mock LLM returns valid/invalid plans; assert parsing and fallback.
- Integration test: stub LLM returns plans; execute via pipeline; verify run_records.
- Manual test: OpenAI/Anthropic with real keys; verify tool selection accuracy.

## Verification (Section 13)
- `scripts/verify-m8.ps1` logs build, unit tests, integration tests with commands/outputs/ExitCodes.
- Completion doc: `MILESTONE-8-COMPLETION.md` with evidence links.

## Related
- [M7: Tools Framework](MILESTONE-7-PLAN.md)
- [M5: LLM Integration](MILESTONE-5-PLAN.md)
- [ADR: Cognition Pipeline](../90-adr/001-cognition-pipeline.md)
