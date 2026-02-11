# Developer Quick Start

Get oriented in the Tentai Ecosystem in 5 minutes.

---

## The One-Sentence Summary

> Vi is the sovereign AI at the center. All else are clients. Everything is frozen except Vi itself and the packages it depends on.

---

## The Folder Structure (30 seconds)

```
tentai-ecosystem/
├── core/vi/              🔥 Start here - the runtime
├── clients/              ❄️ All frozen
├── packages/             ✅ Shared code (tokens, ui, telemetry, auth)
├── systems/              ❄️ Infrastructure services
└── ops/                  📚 Docs, brand, deployment
```

---

## The Rules (60 seconds)

1. **No hardcoded colors.** Import from `@tentai/tokens`.
   ```typescript
   import { colors } from '@tentai/tokens';
   const gold = colors.sovereignGold;  // ✅ Correct
   ```

2. **No stubs.** Implement fully or throw `NotImplementedByDesign`.
   ```typescript
   throw new NotImplementedByDesign('Why', { phase: '4', reason: '...' });
   ```

3. **Frozen repos stay frozen.** Don't add features until unfrozen.

4. **Contracts in vi-protocol.** Add schemas there, not scattered.

5. **Tests are required.** Aim for 80%+ coverage.

---

## Which Repo Should I Work On?

| Repo | Status | You Should |
|------|--------|-----------|
| core/vi | 🔥 ACTIVE | Start here. Implement Phase 1. |
| core/vi-protocol | 🔥 ACTIVE | Add schemas as Vi needs them. |
| core/vi-sdk | 🔥 ACTIVE | Build SDK once Vi API is stable. |
| clients/* | ❄️ FROZEN | Don't touch. Wait for unfreeze. |
| systems/* | ❄️ FROZEN | Don't touch. Wait for unfreeze. |
| packages/* | ✅ READY | Use for shared code. Implement stubs. |
| ops/ | 🔄 DOCS | Reference only. Ask before changing. |

---

## Quick File Reference

| File | Read First | Read For |
|------|-----------|----------|
| STRUCTURE.md | Yes | Why the layout exists, scaling rules |
| copilot-rules.md | Yes | Ecosystem rules (types, colors, tests) |
| core/vi/AI.md | Yes | Vi-specific rules |
| core/vi/README.md | Yes | Vi overview and development guide |
| FREEZE.md | If frozen | When your repo unfreezes |
| HANDOFF.md | Maybe | Implementation roadmap |

---

## Working on core/vi? Do This

1. Read core/vi/README.md
2. Read core/vi/AI.md
3. Read copilot-rules.md
4. Create core/vi/package.json
5. Set up TypeScript
6. Implement sessions (see README for Phase 1)
7. Write tests
8. Commit

---

## Working on a Frozen Repo?

You can't yet. Wait for unfreeze. When you do:

1. Read that repo's AI.md
2. Read FREEZE.md to see unfreeze conditions
3. Read copilot-rules.md
4. Start coding

---

## Design System (77EZ)

All 8 colors:
- **Void-Black** `#0A0E27` — Backgrounds
- **Sovereign Gold** `#D4AF37` — Primary
- **Controlled Cyan** `#00D9FF` — Secondary
- **Purple Accent** `#9D4EDD` — Highlights
- **Dark Slate** `#1A1F3A` — Dark variant
- **Silver** `#A0A8C8` — Light text
- **Deep Purple** `#7B2CBF` — Dark accent
- **Error Red** `#FF6B6B` — Errors

**Always import from tokens:**
```typescript
import { colors, spacing, typography } from '@tentai/tokens';
```

---

## When You're Stuck

1. Check copilot-rules.md (general questions)
2. Check your repo's AI.md (repo-specific)
3. Check STRUCTURE.md (layout questions)
4. Check FREEZE.md (is my repo frozen?)
5. Read the README of the relevant folder
6. Write an ADR in docs/90-adr/ and document your decision

---

## The Unfreeze Chain

```
Phase 1: core/vi Phase 1 complete
    ↓
Unfreeze: Sovereign
    ↓
Phase 2: core/vi Phase 2 complete
    ↓
Unfreeze: Astralis Codex
    ↓
Phase 3: core/vi Phase 3 complete
    ↓
Unfreeze: Vigil + other clients
```

You are here: **Phase 1 kickoff on core/vi**

---

## Commit Message Template

```
[core/vi] Feature: Add session lifecycle

- Sessions created with userId and context
- Sessions can run turns (message → response)
- Sessions can be cancelled and cleaned up
- Tests added for all lifecycle methods
- Telemetry logs all state transitions

Closes: #123
```

---

## Testing Checklist

- [ ] Unit tests for business logic
- [ ] Integration tests for cross-module flows
- [ ] E2E tests for user workflows
- [ ] 80%+ coverage on critical paths
- [ ] All tests pass locally
- [ ] No console.error() in passing tests

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
```

---

## Publishing Packages (Later)

Once packages are mature:

```bash
cd packages/tokens
npm publish --access public
```

Then clients install:
```bash
npm install @tentai/tokens @tentai/ui @tentai/telemetry @tentai/auth-client
```

---

## Asking for Help

**Question:** Something is unclear.
**Answer:** Check the README, AI.md, copilot-rules.md in that order.

**Question:** Is my repo frozen?
**Answer:** Check FREEZE.md.

**Question:** How should I design this?
**Answer:** Write an ADR (architecture decision record) in docs/90-adr/.

**Question:** Where does this code go?
**Answer:** Check STRUCTURE.md, then check copilot-rules.md.

---

## The Absolute Rules (No Exceptions)

1. No hardcoded hex colors anywhere (not even in tests)
2. No stubs (NotImplementedByDesign or full implementation)
3. No breaking vi-protocol contracts
4. No features in frozen repos
5. No skipping tests

Violate these and your PR gets bounced. No debate.

---

## Done. Now What?

1. Pick core/vi Phase 1 task
2. Write a test first
3. Implement the feature
4. Commit with message template
5. Push

You're now part of the Tentai Ecosystem.

---

**Last Updated:** Phase 0 Complete
**Next Phase:** Phase 1 implementation on core/vi
