# UNIMPLEMENTED_BY_DESIGN: Boundaries vs Stubs

This document explains the difference between **phase boundaries** (allowed) and **fake implementations** (not allowed).

## The Problem Statement

"No stubs" is easy to say, hard to practice. So we need clarity:

- **Phase boundaries** (ALLOWED) — Deliberate, documented, return clear errors
- **Fake implementations** (NOT ALLOWED) — Pretend something works when it doesn't

## Phase Boundaries (Allowed)

A phase boundary is when:

1. **A subsystem is deliberately incomplete** for the current phase
2. **The boundary is explicit** (not hidden, not pretending)
3. **It returns a clear, reasoned error** with next steps
4. **The error message explains why** and when it will be implemented

### Example: Memory Consolidation (Phase 1)

In Phase 1, vi-core has short-term + long-term memory, but **consolidation (pruning/merging) is not yet implemented**.

```typescript
// In src/memory/consolidation/consolidation.ts

export class MemoryConsolidation {
  async consolidate(sessionId: string): Promise<void> {
    throw new NotImplementedByDesign(
      'Memory consolidation is not yet implemented.',
      {
        phase: 'Phase 2',
        reason: 'Requires structured reasoning over memory to detect redundancy.',
        blocked_by: 'Reasoning engine',
        when: 'After Phase 2 cognition pipeline is complete',
        workaround: 'Memory grows unbounded in Phase 1. Monitor size. Manual pruning on request.',
        ticket: 'https://github.com/tentai/vi-core/issues/342'
      }
    );
  }
}
```

### Example: Voice Input (Phase 2+)

Command Center doesn't have voice input in Phase 1. It's deliberate.

```typescript
// In src/pages/chat/VoiceButton.tsx

export function VoiceButton() {
  return (
    <button 
      disabled 
      title="Voice input is not yet implemented. See UNIMPLEMENTED_BY_DESIGN.md for timeline."
      onClick={() => {
        throw new NotImplementedByDesign(
          'Voice input is not yet implemented.',
          {
            phase: 'Phase 2',
            reason: 'Requires speech-to-text integration and streaming response handling.',
            blocked_by: 'Real-time response pipeline',
            when: 'After Phase 2 text pipeline is proven stable',
            ticket: 'https://github.com/tentai/vi-command-center/issues/201'
          }
        );
      }}
    >
      🎤 (Phase 2)
    </button>
  );
}
```

## Fake Implementations (Not Allowed)

A fake implementation is when:

1. **Something looks like it works** but doesn't
2. **The code hides the incompleteness** (not obvious)
3. **It returns fake data or empty results** silently
4. **Future devs can't tell it's incomplete** without reading comments

### ❌ Example: Tool Execution (Wrong)

```typescript
// DO NOT DO THIS

export class ToolExecutor {
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    // TODO: implement actual tool execution
    return {
      toolId: toolCall.toolId,
      output: [],  // Empty array looks like it worked
      error: null,
      // ^ Caller thinks this succeeded. It didn't.
    };
  }
}
```

**Problem:** Code that calls this will silently do nothing and appear to succeed.

### ✅ Example: Tool Execution (Correct)

```typescript
// DO THIS

export class ToolExecutor {
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    throw new NotImplementedByDesign(
      'Tool execution is not yet implemented.',
      {
        phase: 'Phase 1',
        reason: 'Requires safe execution framework and guardrails.',
        blocked_by: 'Tool registry and security model',
        when: 'Mid-Phase 1 after tool registry is stable',
        workaround: 'Clients can call tools directly (not recommended). See docs/40-tools.',
        ticket: 'https://github.com/tentai/vi-core/issues/104'
      }
    );
  }
}
```

**Why this is better:**

- Code fails loudly, not silently
- Error message explains the situation
- Dev knows what's blocked and what's next
- No confusion

## The Rule

### Allowed (Phase Boundaries)
✅ Interfaces that throw `NotImplementedByDesign`  
✅ Clear, documented reasons  
✅ Explicit phase when it will be implemented  
✅ Workarounds if available  
✅ Tracking issue link  

### Not Allowed (Stubs)
❌ Fake data (empty arrays, mock objects)  
❌ Silent no-ops  
❌ TODO comments  
❌ "We'll fill this in later"  
❌ Return null silently  

## NotImplementedByDesign Class

Use this everywhere:

```typescript
// src/errors/NotImplementedByDesign.ts

export interface NotImplementedContext {
  phase: string;           // When this will be implemented
  reason: string;          // Why it's not done yet
  blocked_by?: string;     // What's blocking it
  when?: string;           // Timeline
  workaround?: string;     // Can you do something else?
  ticket?: string;         // GitHub issue
}

export class NotImplementedByDesign extends Error {
  constructor(message: string, context: NotImplementedContext) {
    const details = Object.entries(context)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    
    super(`${message}\n\n${details}`);
    this.name = 'NotImplementedByDesign';
  }
}
```

## In Tests

Test that the boundary throws correctly:

```typescript
describe('ToolExecutor', () => {
  it('throws NotImplementedByDesign for tool execution', async () => {
    const executor = new ToolExecutor();
    const toolCall = { toolId: 'test', params: {} };
    
    expect(() => executor.execute(toolCall))
      .toThrow(NotImplementedByDesign);
  });
});
```

## In Docs

Document every boundary:

In `/docs/90-adr/001-phase-boundaries.md`:

```markdown
# ADR: Phase Boundaries and NotImplementedByDesign

## Context
We need to distinguish between "not yet implemented" and "broken".

## Decision
Use NotImplementedByDesign for deliberate phase boundaries.

## Boundaries (Phase 1)
- Memory consolidation (Phase 2)
- Voice input (Phase 2)
- Tool execution (Phase 1, mid-phase)
- Reasoning engine (Phase 2)

See UNIMPLEMENTED_BY_DESIGN.md for each boundary.
```

## Summary

| | Phase Boundary | Stub |
|---|---|---|
| **Throws error** | ✅ Yes | ❌ Returns fake data |
| **Explains why** | ✅ Yes | ❌ Silent or TODO |
| **Clear next phase** | ✅ Yes | ❌ Vague |
| **Tracked** | ✅ Issue link | ❌ No |
| **Tests** | ✅ Verify error | ❌ Mock pass |

**Be explicit. Fail loudly. Document boundaries.**
