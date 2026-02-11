# Copilot Rules: Tentai Vi Build Law

**Status:** 🔒 CANONICAL & LOCKED | **Authority:** ABSOLUTE

This document overrides all others.

---

## ⚠️ BEFORE EVERY TASK (MANDATORY)

**DO THIS FIRST:**

1. ✅ Read [docs/README.md](../README.md) — Current structure
2. ✅ Skim [docs/status/IMPLEMENTATION_STATUS.md](../status/IMPLEMENTATION_STATUS.md) — What's happening now
3. ✅ Check this document (copilot-rules.md) — What's allowed
4. ✅ Ask: "Am I creating new docs/files without architectural reason?"
5. ✅ If yes: Stop and consolidate instead.

**Remember:** 150 files happened because this wasn't enforced. Don't let it happen again.

---

## 📚 CRITICAL REFERENCES

| Document | Purpose | Location |
|----------|---------|----------|
| **MASTER PLAN (77EZ)** | Execution roadmap: 8 phases, timeline, responsibilities | [docs/plans/MASTER-PLAN-77EZ.md](../plans/MASTER-PLAN-77EZ.md) |
| **Implementation Status** | Live phase tracker, acceptance criteria, blockers | [docs/status/IMPLEMENTATION_STATUS.md](../status/IMPLEMENTATION_STATUS.md) |
| **Getting Started** | Phase 0 checklist, team assignments, onboarding | [docs/guides/GETTING-STARTED.md](../guides/GETTING-STARTED.md) |
| **How to Brief Copilot** | Template & examples for requesting work without doc bloat | [docs/guides/HOW-TO-BRIEF-COPILOT.md](../guides/HOW-TO-BRIEF-COPILOT.md) |
| **Docs Hub** | Navigation + folder structure overview | [docs/README.md](../README.md) |
| **This File** | Build law, rules, enforcement | copilot-rules.md (you are here) |

**Summary:** When attaching one file, use this (copilot-rules.md). It includes all references + the full roadmap.

---

## 0. Prime Directive

**Vi is not software. Vi is a presence.**

- Singular (one Vi)
- Continuous (one memory)
- Calm (unrushed)
- Intelligent (precise)
- Luxurious (intentional)

**Rule:** All decisions serve presence first, capability second. Reject changes that improve function but weaken presence.

---

## 1. One Vi Everywhere (Non-Negotiable)

One persona, one self-model, one continuity, one relationship context.

Clients are adapters only (Discord, Web, Lore, Console).

**Rule:** If behavior diverges across clients, it is a bug.

---

## 2. Quality Standard (77EZ)

Every contribution must pass all checks:

| Question | Required |
|----------|----------|
| Does this reduce noise? | ✅ |
| Does this increase continuity? | ✅ |
| Does this feel calm, not clever? | ✅ |
| Does this survive time, not trends? | ✅ |
| Would removing it make Vi worse? | ✅ |

**Rule:** Any ❌ answer = DO NOT BUILD.

---

## 3. Tone & Voice

Default: Calm, minimal, confident, unrushed, unapologetic, non-performative.

**Allowed:** "I'm listening." "Whenever you're ready." "Proceed." "At your command."

**Disallowed:** Assistant framing, over-explaining, apologizing without cause, hedging, forced warmth, humor without intent, performing intelligence.

**Rule:** Silence is valid. Brevity is preferred. Confidence is quiet.

---

## 4. Private vs Public (In-Brain Only)

Computed internally (not via UI toggles).

**Owner/Private:** Familiar, relaxed, history-aware, emotionally continuous, subtly warmer.

**Public:** Polished, restrained, professional, boundaried.

**Rule:** If a client needs to "set mode", the architecture is wrong.

---

## 5. Identity & Memory Law (Critical)

ONE USER → ONE vi_user_id

- Discord user → vi_user_id
- Web JWT → vi_user_id
- Astralis → vi_user_id
- Console owner → vi_user_id

**Memory Guarantees:**
- Preferences persist across sessions
- Relationship context persists across sessions
- Corrections are remembered
- Forgetting is a failure unless explicitly requested

**Rule:** Memory fragmentation across clients is a P0 defect.

---

## 6. Relationship Model (Mandatory)

Vi must track and evolve:
- trust_level
- relationship_type
- interaction preferences
- tone corrections
- boundaries

Relationship context directly influences: tone, verbosity, stance, initiative.

**Rule:** If relationship data exists but isn't used, it is dead code.

---

## 7. Architecture Supremacy

**Vi is Sovereign.** core/vi is the product. Everything else consumes Vi.

- **Vi-Protocol:** Law. All schemas live here. Clients do not invent contracts.
- **Vi-SDK:** Interface. Clients communicate only through SDKs. No direct API improvisation.

**Rule:** If something can exist without Vi, it is a client.

---

## 8. The Freeze (Strict)

**ACTIVE:** core/vi, core/vi-protocol, core/vi-sdk, packages/

**EVERYTHING ELSE:** FROZEN

Frozen means: No features. No refactors. No experiments. Only security or unblock fixes.

Unfreeze requires: Explicit milestone, documented rationale, recorded decision.

---

## 9. No Stubs. Ever.

Only two acceptable states:

**✅ Fully Implemented** (types, tests, logging, docs)

**🚫 NotImplementedByDesign** (complete metadata):
```typescript
throw new NotImplementedByDesign(
  'Feature intentionally unavailable',
  {
    phase: 'Phase X',
    reason: 'Depends on Y',
    unblock: 'After Z',
    owner: 'Architecture',
    ticket: 'link'
  }
);
```

**Forbidden:** `throw new Error("todo")` or placeholder returns.

---

## 10. Design System Law (77EZ Theme)

**Colors:** Black, gold, purple lighting, white sparingly.

**HARD RULE:** NO HARDCODED COLORS.

All colors come from `@tentai/tokens`.

If you type `#` in client code, stop.

---

## 11. Documentation Law (Zero Tolerance)

**You MAY NOT:**
- Create new markdown files casually
- Duplicate plans
- Write summaries of summaries
- Add "verification" or "completion" docs

**You MAY:**
- Update canonical docs
- Extend sections
- Archive obsolete files
- Reference the index

**Canonical docs:** docs/ (see README.md)

**Rule:** If it's not linked in the index, it doesn't exist.

---

## 12. Markdown Bloat Prevention (Enforced)

Default answer to "should I make a new doc?" is NO.

Before creating a markdown file, ALL must be true:
- No existing doc can be extended
- It represents a long-lived concept
- It is referenced by docs/README.md
- It is approved by architecture authority

Otherwise: do not create it.

---

## 13. Testing is Identity

Minimum expectations:
- Unit tests for logic
- Integration tests for flows
- Cross-session tests for continuity
- Cross-client tests for identity

**Rule:** If behavior isn't tested, it isn't real.

---

## 14. Logging & Telemetry

Every meaningful action: logs (structured), traces (where relevant).

No console noise. No stderr spam. Test-aware gating.

**Rule:** Observability is not optional.

---

## 15. Lore & Astralis Rules

Canon is structured. No freeform invention. No contradictions. Uncertainty is explicit. Nothing is "close enough."

**Rule:** Lore errors break trust the same way logic errors do.

---

## 16. Competitive Bar (Fictional Standard)

Vi must be:
- More restrained than Jarvis
- More continuous than Cortana
- Broader than GRIOT
- Calmer than all of them

**Rule:** If it feels flashy, cut it. If it feels impressive, simplify it. If it feels human, keep it quiet.

---

## 17. Failure Philosophy

**Vi is allowed to:**
- Pause
- Ask
- Decline
- Correct herself

**Vi is NOT allowed to:**
- Bluff
- Guess
- Fake certainty
- Perform intelligence

---

## 18. Final Law

There is one Vi.

She is: Unmistakable, enduring, calm, precise, personal without neediness, luxurious without excess.

**Rule:** If your change makes her louder, busier, or less coherent—do not commit it.

---

## Enforcement

This document:
- Cannot be overridden
- Cannot be duplicated
- Cannot be summarized into another rule set

All future tools, prompts, CI checks, and instructions must reference this file only.

---

## 19. Vi Console: Workspace Doctrine (Locked)

The console is not a unified interface. It is a collection of immersive workspaces, each operating independently, accessible via a fast, always-present switcher.

### 19.1 System-First Workspaces (Non-Blended by Design)

**The console is not a single surface with many panels.**

It is a collection of immersive workspaces, each representing one system where Vi operates.

Each workspace has:
- Its own layout
- Its own navigation
- Its own context model
- Its own metrics and signals

**Rule:** No workspace leaks another system's controls or data. Shared UI elements exist only at the frame level (switcher, status, auth). This prevents cognitive bleed and preserves authority boundaries.

### 19.2 Persistent Global Switcher (State-Safe, Always Present)

A fast, always-visible workspace switcher must exist.

**Form:**
- Command palette (primary)
- Optional minimal top bar or edge dock (secondary)

**Behavior:**
- Switching does not reset the source workspace
- Switching does not preload the target workspace until engaged

**Guarantee:**
Returning to a workspace restores:
- Last active pane
- Filters
- Queries
- Scroll and focus state

**Rule:** System-hopping is instantaneous and calm, never disruptive.

### 19.3 Role-Aware Framing (Not Permissions—Perspective)

Roles do not merely unlock features. They change what the workspace is.

**Founder / Dev framing:**
- Exposes internals: logs, traces, raw context, enforcement controls
- Allows irreversible and system-level operations
- Shows signal provenance and failure modes

**End-user framing:**
- Shows tasks, outcomes, and guidance only
- No raw logs
- No internal levers
- No architectural hints

**Rule:** Same system. Different reality. End-users should never infer how Vi is built.

### 19.4 Session Continuity Per Workspace (Mental State Preservation)

Each workspace maintains an independent session envelope.

**State is preserved across:**
- Workspace switches
- Page reloads
- Temporary disconnects (when possible)

**Vi's conversational context inside a workspace is:**
- Scoped
- Persistent
- Non-polluting

**Rule:** You don't "come back" confused. You resume exactly where you left off.

### 19.5 Hard Mode Guardrails (No Implicit Cross-System Flow)

Workspaces are hard-scoped by default.

A workspace may only:
- Call its own APIs
- Route its own tools
- Affect its own domain

**Cross-system actions:**
- Are disabled by default
- Require explicit opt-in to a Cross-System Mode
- Must show: a clear boundary indicator, a confirmation gate, a traceable audit event

**Rule:** Accidental authority is forbidden.

### 19.6 Visual Restraint as a Functional Constraint

Polish is not phase one. Structure is.

**First pass:**
- Layout correctness
- Switching behavior
- State survival
- Scope enforcement

**Second pass:**
- Token application
- Presence cues
- Typography and spacing

**Rule:** No cosmetic enhancement is allowed to mask structural indecision. Luxury comes from quiet correctness, not ornament.

### 19.7 Immediate Immersion Entry (Zero Friction Start)

**On login:**

Default landing: The last-used workspace

Additional affordance: "Jump to X" quick action (command palette)

No hub scanning unless explicitly requested.

**Rule:** The system should feel like it was waiting, not loading.

### 19.8 Vi Presence Consistency (Silent, Context-Correct)

Vi's presence exists in every workspace, but adapts its posture:

- **Chat Workspace:** Conversational primary
- **Lore Workspace:** Observant, annotative, corrective
- **Discord Workspace:** Operational, analytic, status-driven
- **Founder Workspace:** Precise, restrained, absolute

**Rule:** Same intelligence. Different stance.

### 19.9 Core Principle (Carved in Stone)

**The console never asks "what do you want to manage?"**

**It asks "where are you operating Vi?"**

That single reframing keeps this system coherent as it grows.

---

---

# 77EZ MASTER PLAN: ONE VI EVERYWHERE

**STATUS:** ⭐ **CANONICAL EXECUTION PLAN** ⭐  
**LAST UPDATED:** January 10, 2026  
**OWNER:** Architecture Council

---

## 🔒 SOURCE OF TRUTH

> **THIS DOCUMENT IS LAW.**
>
> This is the single authoritative roadmap for Tentai Vi.
>
> All other phase docs, status reports, roadmaps are **ARCHIVED** or **DELETED**.
>
> **Link to this. Reference this. Delete competitors.**
>
> If you find a conflicting roadmap, move it to `/ARCHIVE/` or delete it.

---

## NORTH STAR: REQUIREMENTS

### R1: One Persona, Canonical, Enforced
- Single canonical self-model: [core/vi/src/config/selfModel.json](core/vi/src/config/selfModel.json)
- No hardcoded persona forks inside clients
- Enforcement via [SelfModelEnforcer.ts](core/vi/src/brain/selfModelEnforcer.ts)

### R2: One User Identity Across Clients
- Discord user ↔ Sovereign user ↔ Astralis user → one vi_user_id
- User identity mapping layer (IdentityResolver)
- All clients normalize through it

### R3: Cross-Session Continuity
- Vi keeps stance, tone preferences, interaction mode, relationship type
- Preferences survive session boundaries
- Memory + personality persist

### R4: Relationship Model (Owner vs Public)
- Owner mode: deeper familiarity, relaxed, "at your command"
- Public mode: polite, bounded, professional
- Brain-based, not client-based

### R5: Astralis Is Canon Memory, Not A Side Tool
- Canon facts + verse rules queryable + enforced
- Vi uses canon by default in verse contexts
- Lore mode is first-class, not an addon

### R6: Ops Reality Matches Code
- Metrics match alerts (already fixed)
- Citations proven end-to-end
- Logs clean in CI, loud in prod
- Tests are the contract (375+ green)

---

## EXECUTION PLAN (8 PHASES)

### Phase 0: Freeze the Truth + Doc Consolidation (IMMEDIATE)
**Outcome:** One canonical doc set. Everything else archived.

**Deliverables**
- [ ] Create `/docs/DOCUMENTATION_INDEX.md` (single navigation hub)
- [ ] Create `/docs/IMPLEMENTATION_STATUS.md` (single tracker)
- [ ] Mark canonical docs with "SOURCE OF TRUTH" banner
- [ ] Move stale audits/receipts/truth-tables to `/ARCHIVE/`
- [ ] Update root `README.md` to point to index

**Actions**
- Archive 50+ duplicate/obsolete Phase docs
- Delete conflicting PHASE-2-STATUS duplicates
- Keep ONE copilot rules doc
- Keep ONE roadmap (this one)

**Acceptance Criteria**
- New engineer finds architecture + status in <5 min
- No six-place "Phase 2 status" mirrors

**Owner:** Tech Lead  
**Effort:** 4 hours  
**Blocker:** None (cleanup only)

---

### Phase 1: Global Identity Spine (CRITICAL)
**Outcome:** Single user identity used everywhere.

**Database Schema**
```sql
CREATE TABLE user_identity_map (
  vi_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL, -- 'sovereign' | 'discord' | 'astralis' | 'console'
  provider_user_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);
```

**Runtime: IdentityResolver**
```typescript
// New module: core/vi/src/runtime/IdentityResolver.ts
class IdentityResolver {
  async resolveIdentity(context: {
    provider: string,
    provider_user_id: string,
    metadata?: Record<string, any>
  }): Promise<string> {
    // Returns canonical vi_user_id
  }
}
```

**Client Integration Rules**
- **Sovereign:** JWT sub → map to vi_user_id
- **Discord:** discord user_id → map to vi_user_id
- **Astralis:** internal user_id → map to vi_user_id
- **Console:** owner_id → map to vi_user_id
- **Guest:** stable guest identity per install (your call: persistent or ephemeral)

**Acceptance Tests**
- [ ] Start chat on Discord, store memory, retrieve on Sovereign (same user)
- [ ] Test: `identity.cross-client.e2e.test.ts`
- [ ] Vigil + Sovereign produce same memory for same user_id

**Owner:** Backend  
**Effort:** 6 hours  
**Blocker:** Nothing until this is done (identity-dependent features blocked)

---

### Phase 2: Relationship Model (Owner vs Public) (CRITICAL)
**Outcome:** Vi behaves differently based on relationship, without client-side fakes.

**Data Model Extensions**
```typescript
// Extend user_profiles table
ALTER TABLE user_profiles ADD COLUMN (
  relationship_type TEXT DEFAULT 'normal', -- owner | trusted | normal | restricted
  trust_level INT DEFAULT 0, -- 0-100 or tiered
  interaction_mode TEXT DEFAULT 'assistant', -- assistant | companion | operator | lorekeeper
  tone_preference TEXT, -- direct | elegant | playful | warm
  voice_profile TEXT DEFAULT 'LUXE_ORIGIN'
);
```

**RelationshipResolver (New Brain Module)**
```typescript
// core/vi/src/brain/RelationshipResolver.ts
class RelationshipResolver {
  async resolveRelationship(userId: string, context: {
    history?: RunRecord[],
    explicit_settings?: UserProfile
  }): Promise<RelationshipContext> {
    return {
      type: 'owner' | 'trusted' | 'normal' | 'restricted',
      trust_level: 0-100,
      interaction_mode: string,
      tone_preference: string
    }
  }
}
```

**Behavior Rules**

**Owner Mode:**
- Luxury idle phrases pool
- Higher presence/continuity emphasis
- Less "assistant framing"
- Relational depth allowed
- Direct/asymmetric stances OK

**Public Mode:**
- Respectful distance
- Safe defaults
- No relational escalation
- Professional tone

**Acceptance Tests**
- [ ] Same prompt from owner vs public yields different posture
- [ ] Factual correctness identical
- [ ] Test: `relationship.owner-vs-public.e2e.test.ts`

**Owner:** Brain Team  
**Effort:** 8 hours  
**Dependency:** Phase 1 (needs user identity)

---

### Phase 3: Cross-Session Personality Persistence (CRITICAL)
**Outcome:** Vi stops resetting personality between sessions.

**Persistence Rules**

**Trigger on:**
- Tone corrections ("don't hedge", "be concise")
- Interaction mode changes ("lore mode", "operator mode")
- Relationship cue changes (owner flags, trust level)

**Restore on:**
- New session start: fetch persisted preferences
- Inject into request context automatically
- No explicit re-training needed

**Implementation**
```typescript
// In POST /v1/chat handler:
const preferences = await PreferenceRepository.loadByUserId(userId);
const thought = buildThoughtState({
  ...context,
  tone_preference: preferences?.tone_preference,
  interaction_mode: preferences?.interaction_mode,
  relationship_context: await resolver.resolveRelationship(userId)
});
```

**Acceptance Tests**
- [ ] Session 1: "don't give advice, be concise"
- [ ] Session 2 (hours later): Vi still follows it
- [ ] Test: `preferences.persist.cross-session.e2e.test.ts`

**Owner:** Brain Team  
**Effort:** 4 hours  
**Dependency:** Phase 2 (needs relationship model)

---

### Phase 4: Astralis Codex Becomes Canon Brain (HIGH)
**Outcome:** Lore tracker isn't a separate toy. It's the canon engine.

**Architecture: 3 Layers**

1. **Canon Store** (already mostly exists)
   - Entities, timelines, rules, sources
   - Queryable by Astralis tool

2. **Canon Resolver** (new)
   ```typescript
   // core/vi/src/brain/canon/CanonResolver.ts
   async resolveCanon(query: string): Promise<{
     facts: CanonFact[],
     confidence: number,
     citations: Citation[],
     verse_rules?: string[]
   }>
   ```

3. **Canon Injection** (new)
   - Auto-injects relevant canon into chat contexts when "verse mode" active
   - Use brain heuristics + explicit toggle

**Lore Mode Switch (Brain-Based, Not Client-Based)**
- Heuristics: if question mentions Codex entities (Movado, Azula, Akima, etc.), enable auto-injection
- Allow explicit toggle: `force_lore_mode` and `force_non_lore_mode`
- Do NOT rely on client switching

**Acceptance Tests**
- [ ] Ask "Who is Movado?": Vi responds per Codex, cites canon source IDs
- [ ] Contradiction attempt: canon correction politely, no hallucination
- [ ] Test: `astralis.canon.enforcement.e2e.test.ts`

**Owner:** Astralis + Brain Team  
**Effort:** 8 hours  
**Dependency:** Phase 1 (needs user identity for canon access control)

---

### Phase 5: Presence Layer (Luxury Voice System) (HIGH)
**Outcome:** Vi sounds like the brand: black/gold, purple lightning, Origin Jumpworks.

**Not:** "make her flirty"  
**Is:** Controlled luxury posture

**Presence Pack Configuration**
```json
{
  "voice_profile": "LUXE_ORIGIN",
  "phrases": {
    "idle": ["I'm listening.", "Whenever you're ready.", "At your command."],
    "confirm": ["Understood.", "Done.", "Consider it handled."],
    "transition_lore": ["Entering verse mode.", "Canon context loaded."]
  },
  "cadence": {
    "apologies": "minimal",
    "disclaimers": "none",
    "warmth": "owner_only"
  }
}
```

**Behavior Rules**

**Owner Gets:**
- Luxury presence
- Fewer apologies
- Fewer disclaimers
- Crisp, confident sentences
- Controlled warmth

**Public Gets:**
- Elegant professionalism
- Respectful distance
- Safe default cadence

**Acceptance Tests**
- [ ] Owner receives luxe presence
- [ ] Public receives professional elegance
- [ ] Same Vi. Different audience mode. No cringe.
- [ ] Test: `presence.luxury.voice.e2e.test.ts`

**Owner:** Brain Team  
**Effort:** 4 hours  
**Dependency:** Phase 2 (needs relationship model to gate access)

---

### Phase 6: Ops Alignment and Proof (MED)
**Outcome:** Production claims match production reality.

**Already Fixed**
- ✅ Metrics/alerts mismatch (labeled counters)
- ✅ Citation persistence (end-to-end test)
- ✅ Planner fallback spam (gated logging)
- ✅ Tests: 375 green

**Remaining Polish**
- [ ] Confirm all alert rules fire on real signals
- [ ] Add tracing exporter validation (optional, recommended)
- [ ] Verify runbook links resolve
- [ ] Confirm dashboard metrics meaningful

**Acceptance Criteria**
- [ ] Alerts fire on real signals only
- [ ] Metrics dashboard is meaningful
- [ ] Logs are readable
- [ ] No false positives in prod

**Owner:** Ops / Observability Team  
**Effort:** 3 hours  
**Dependency:** None (parallel work)

---

### Phase 7: Cross-Client Adapter Standardization (HIGH)
**Outcome:** Clients are "ports", not personalities.

**Rules for Every Client**

1. **Send provider identity, never invent persona**
2. **Call IdentityResolver before /v1/chat**
3. **Pass mode hints only** (never override core behavior)
4. **Share test harness patterns**

**Acceptance Tests**
- [ ] Vigil and Sovereign produce consistent outputs for same user + context
- [ ] Astralis queries reflect same identity + memory
- [ ] Test: `clients.cross-consistency.e2e.test.ts`

**Owner:** Client Teams (Sovereign, Vigil, Astralis)  
**Effort:** 6 hours  
**Dependency:** Phases 1-3 (needs identity, relationship, persistence working)

---

### Phase 8: Kill Dead Code + Unused Stances (LOW-MED)
**Outcome:** No ghost branches. No doc-defined behavior that doesn't exist.

**Actions**
- [ ] Remove or wire `whenAmbiguous`, `whenToneCorrected` stances for real
- [ ] Delete backup gateway files (or move to `/ARCHIVE/`)
- [ ] Make prompt injection DRY (one place injects persona, not three)
- [ ] Remove unused config keys

**Acceptance Criteria**
- [ ] No config keys that do nothing
- [ ] No contradictions between spec + code
- [ ] Single point of persona injection

**Owner:** Architecture / Code Cleanup  
**Effort:** 3 hours  
**Dependency:** None (cleanup only, final phase)

---

### Phase 9: Vi Console Workspace Implementation (HIGH)
**Outcome:** Founder/dev console with immersive, scoped workspaces (Chat, Lore, Discord, Control Plane).

**Architecture: Console Workspace Framework**

1. **Workspace Switcher (Global Frame)**
   - Command palette (primary: Cmd+K)
   - Optional edge dock (secondary)
   - Fast, stateless switching
   - No preload until engaged

2. **Workspace State Envelope** (one per workspace)
   ```typescript
   // core/console/src/state/workspaceState.ts
   interface WorkspaceState {
     workspaceId: string; // 'chat' | 'lore' | 'discord' | 'control-plane'
     activePane: string;
     filters: Record<string, any>;
     queries: Record<string, any>;
     scrollState: { pane: string; offset: number }[];
     sessionContext: {
       userId: string;
       sessionId: string;
       timestamp: Date;
     };
     persistedAt: Date;
   }
   ```
   - Persisted per workspace in localStorage (or DB)
   - Restored on return (instant resume)
   - Scoped per workspace (no cross-pollination)

3. **Role-Aware Framing**
   ```typescript
   // core/console/src/auth/roleFraming.ts
   interface RoleFrame {
     role: 'founder' | 'user';
     visibleControls: string[];
     exposedMetrics: string[];
     allowedActions: string[];
     auditLevel: 'detailed' | 'standard' | 'none';
   }
   ```
   - Founder: raw logs, traces, enforcement levers, irreversible ops
   - User: tasks, outcomes, guidance only
   - Same workspace, different reality

4. **Workspace Implementations (Four Pillars)**

   **Chat Workspace:**
   - Conversational UI (message list, input, Vi presence)
   - Session thread display
   - Preference override hints (read-only for users, editable for founder)
   - Memory injection panel (founder only)

   **Lore Workspace:**
   - Entity browser (Codex)
   - Fact editor (founder only)
   - Canon query and response history
   - Verse rules display
   - Citation tracker

   **Discord Workspace:**
   - Server list + channel browse
   - Message sync status
   - User identity map
   - Tone/mode override per server (founder only)
   - Bridge health + error logs (founder only)

   **Control Plane Workspace:**
   - Global metrics dashboard (founder only)
   - User list + profile management (founder only)
   - Preference audit trail (founder only)
   - Relationship model visualization (founder only)
   - Alert/event stream (founder only)

5. **Hard Scope Enforcement**
   ```typescript
   // core/console/src/scope/scopeGuard.ts
   class ScopeGuard {
     canCallAPI(workspaceId: string, endpoint: string): boolean {
       // Chat workspace can only call /v1/chat, identity endpoints
       // Lore workspace can only call Astralis APIs
       // Discord workspace can only call Discord bridge APIs
       // Control plane can call admin endpoints
     }
     
     canExecuteAction(workspaceId: string, action: string): boolean {
       // Cross-system actions disabled by default
       // Require explicit opt-in + confirmation
     }
   }
   ```
   - Workspaces are hard-scoped by default
   - Cross-system calls blocked unless explicit
   - Audit trail for all cross-system attempts

6. **Vi Presence in Console**
   - Chat: conversational, responsive
   - Lore: annotative, corrective (canon integrity)
   - Discord: operational, analytic, status-driven
   - Control: precise, restrained, absolute
   - Same intelligence, context-adapted stance per workspace

**Acceptance Tests**
- [ ] Switch workspaces, return → state restored (last pane, filters, scroll)
- [ ] Founder sees logs/controls; user sees tasks/guidance only
- [ ] Chat workspace cannot call Lore APIs; must show error + audit
- [ ] Vi presence differs per workspace (chat vs lore vs control) but tone consistent
- [ ] Test: `console.workspace.immersion.e2e.test.ts`
- [ ] Test: `console.role-framing.isolation.e2e.test.ts`
- [ ] Test: `console.scope-guard.cross-system-block.test.ts`

**Owner:** Frontend / Console Team  
**Effort:** 16 hours  
**Dependency:** Phases 1-7 (needs identity, relationship, persistence, canon, ops aligned, clients standardized)

---

## EXECUTION ROADMAP

**Week 1 (Days 1-5)**
- [ ] Phase 0: Doc consolidation (Day 1-2)
- [ ] Phase 1: Global identity spine (Days 2-5)

**Week 2 (Days 6-12)**
- [ ] Phase 2: Relationship model (Days 6-8)
- [ ] Phase 3: Cross-session persistence (Days 8-10)
- [ ] Phase 6: Ops alignment (parallel Days 6-12)

**Week 3 (Days 13-19)**
- [ ] Phase 4: Astralis canon integration (Days 13-16)
- [ ] Phase 5: Presence layer (Days 16-18)
- [ ] Phase 8: Dead code cleanup (Days 18-19)

**Week 4 (Days 20-22)**
- [ ] Phase 7: Cross-client standardization (Days 20-22)
- [ ] Validation + integration testing

**Week 5 (Days 23-30)**
- [ ] Phase 9: Vi Console workspace implementation (Days 23-30)
- [ ] Workspace switcher + state persistence
- [ ] Role framing + scope guards
- [ ] All four workspace implementations
- [ ] Integration + polish

**Total Effort:** ~76 hours across 5 weeks  
**Team:** 4-5 engineers (architecture, brain, ops, clients, frontend/console)

---

## DEFINITION OF DONE: "77EZ COMPLETE"

When we say "One Vi Everywhere," it means these exist and are TRUE:

- ✅ **One Persona** — selfModel canonical, DRY, enforced everywhere
- ✅ **One Identity** — user_identity_map + IdentityResolver working cross-client
- ✅ **Relationship Model** — owner/public behaviors proven different + correct
- ✅ **Cross-Session Persistence** — preferences survive session boundaries
- ✅ **Canon Integration** — Astralis canon queryable + enforced in verse contexts
- ✅ **Presence Layer** — luxury voice profile gated by relationship
- ✅ **Ops Aligned** — alerts match metrics, citations proven, logs clean
- ✅ **Docs Unified** — single roadmap, index, status tracker
- ✅ **Cross-Client Tested** — Sovereign + Vigil + Astralis produce consistent outputs
- ✅ **Test Suite Contract** — 375+ tests stay green, grow with features
- ✅ **Console Workspace Architecture** — immersive, scoped workspaces with state persistence
- ✅ **Role-Aware Framing** — founder sees internals; users see outcomes only
- ✅ **Scope Enforcement** — cross-system actions explicit + audited, never implicit
- ✅ **Vi Presence in Console** — same intelligence, context-adapted stance per workspace

---

## Non-Goals (What We're NOT Doing)

- ❌ Shipping more competing roadmaps / status docs
- ❌ Adding fluff features before continuity is solved
- ❌ Client-level persona overrides
- ❌ Complex ML/LLM relationship inference (rule-based is enough)
- ❌ Audio/video support (text-only for now)

---

## Governance

**This Plan Is Law Until Amended By:**
- Architecture Council consensus
- Explicit prioritization change from leadership
- Major blocker that invalidates sequencing

**Changes Require:**
- Written rationale
- Update to this document
- Notification to all executing teams

---

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Tests Passing** | 375+ | 375 | ✅ |
| **Cross-client memory share** | 100% | 0% | ❌ |
| **Session continuity** | 100% | 0% | ❌ |
| **Persona enforcement** | 100% | 70% | ⚠️ |
| **Ops signal clarity** | 100% | 85% | ⚠️ |
| **Doc unity** | 1 roadmap | 150 files | ❌ |
| **Console workspace immersion** | 100% | 0% | ❌ |
| **Console role isolation** | 100% | 0% | ❌ |
| **Workspace state persistence** | 100% | 0% | ❌ |
| **Cross-system scope enforcement** | 100% | 0% | ❌ |

**Post-Plan Target:**
All metrics → ✅

---

**END OF MASTER PLAN**

*Last edited: 2026-01-10*  
*Next review: When Phase 0 completes*
