# Phase 2: User Model & Interaction Stance (Post-M9)

**Date:** December 27, 2025  
**Context:** Feedback from Wednesday on Vi persona testing  
**Status:** Design phase

## Problem Statement

Vi currently has:
- ✅ Session continuity (remembers facts across turns)
- ✅ Persona constraints (avoids assistant clichés)
- ✅ Interleaved conversation history

Vi lacks:
- ❌ **User model** - persistent understanding of how THIS user operates
- ❌ **Interaction stance tracking** - awareness of whether user wants advice, listening, or reflection
- ❌ **Situational specificity** - reasoning FROM context instead of responding TO words

**The key insight (Wednesday):**  
> "Presence isn't tone. It's accuracy."

Vi needs to **reason from what she knows about you**, not just **respond to your words**.

## Current Behavior (What Feels Wrong)

### 1. Identity Evasion
**User:** "Who made you?"  
**Vi (before fix):** "I don't have information on specific creators or origins."  
**Problem:** Deflection instead of grounded truth.  
**Fix Applied:** Grounded identity statement added to system prompt.

### 2. Surface-Level Presence
**User:** "That answer was off. Try again, but speak like you actually know me."  
**Vi:** "Alright, Kaelan. Let's try this again. What's on your mind today?"  
**Problem:** Resets conversation instead of staying in thread with specifics.  
**Why:** Vi responds TO words ("try again") but doesn't reason FROM context (auto loan denial, uncertainty).

### 3. Generic Empathy Templates
**Examples:**
- "Waiting can be nerve-wracking"
- "Sometimes a quick call helps"
- "Anything in particular that could tip the scale?"

**Why:** Model has no internal user profile, so defaults to trained empathy patterns.

**What's Missing:**
- How this user typically responds to setbacks
- Whether they want problem-solving or space
- Whether reassurance annoys them

## Phase 2 Architecture

### Component 1: User Profile Store

**Schema (initial):**
```typescript
interface UserProfile {
  userId: string;
  interactionPreferences: {
    mode: 'problem-solving' | 'listening' | 'reflective' | 'neutral';
    lastUpdated: Date;
  };
  conversationPatterns: {
    respondsToAdvice: boolean;        // Do they engage with suggestions?
    prefersConciseness: boolean;      // Short answers vs elaboration
    correctsFrequently: boolean;      // "That was off", "Try again"
  };
  knownFacts: Array<{
    fact: string;
    confidence: number;
    lastMentioned: Date;
  }>;
}
```

**Storage:** PostgreSQL table `user_profiles` with JSONB columns

### Component 2: Stance Detection

**Triggers for stance shift:**
- User correction: "That answer was off" → shift to `reflective`
- Short responses after advice → shift to `listening`
- Engagement with suggestions → shift to `problem-solving`
- Explicit request: "I don't need advice right now" → shift to `listening`

**Implementation:**
```typescript
async detectStanceShift(
  input: string, 
  recentHistory: string[], 
  currentMode: InteractionMode
): Promise<InteractionMode> {
  // Rule-based initially, LLM-enhanced later
  if (input.includes('that was off') || input.includes('try again')) {
    return 'reflective';
  }
  if (input.includes("I don't need advice")) {
    return 'listening';
  }
  // ... more rules
  return currentMode; // default: no change
}
```

### Component 3: Context-Aware Response Generation

**Current:** LLM sees recentHistory as flat list of turns  
**Phase 2:** LLM sees:
- Recent turns (as now)
- **User stance:** "User prefers listening mode right now"
- **User patterns:** "User typically responds better to questions than advice"
- **Known facts:** "User's name is Kaelan, recently denied auto loan"

**Prompt Enhancement:**
```
USER PROFILE:
- Interaction mode: listening
- Known facts: Kaelan (nickname), auto loan denial pending
- Patterns: Corrects when responses feel generic; prefers specificity

RECENT HISTORY:
[conversation turns as before]

When generating response:
1. Restate user's situation accurately BEFORE offering anything
2. Match interaction mode (no advice in listening mode)
3. Reference known facts for specificity
```

## Implementation Phases

### Phase 2.0: Critical Bug Fixes (IMMEDIATE)

**Priority 1: Name/Nickname Persistence**
- [ ] **Issue:** User mentions "Kaelan" but Vi later says "I don't have a record of your name"
- [ ] **Root Cause:** Either recentHistory isn't surfacing personal identifiers OR LLM isn't prioritizing them
- [ ] **Fix Options:**
  - Add explicit "Known Facts" field to context (separate from recentHistory)
  - Instruct LLM: "Always use personal identifiers (names, nicknames) when present in history"
  - Store user-provided name in session metadata (not just history)
- [ ] **Test:** User says "My name is X" → 5 turns later, ask "What's my name?" → Must recall

**Priority 2: Context Collapse Prevention**
- [ ] **Issue:** "I dont" → Vi jumps to "project timeline?" instead of inferring from immediate prior turn
- [ ] **Root Cause:** Recent turn weighting too weak OR fallback heuristics override conversation state
- [ ] **Fix Options:**
  - Increase weight of last 2 turns in prompt (make them more prominent)
  - Add "IMMEDIATE CONTEXT" section before RECENT HISTORY with last exchange
  - Instruct LLM: "When input is ambiguous, infer from the immediately prior turn first"
- [ ] **Test:** Establish topic → User gives short/ambiguous response → Vi should stay in topic, not jump

### Phase 2.1: Stance Tracking (Immediate)
- [x] **WORKING:** Stance detection for "I don't need advice" successfully suppressed problem-solving mode
- [ ] Persist interaction_mode in session state (currently ephemeral)
- [ ] Add rule: when user corrects ("that was off"), shift to reflective mode for next 3 turns
- [ ] Surface stance in logs for debugging

**Expected outcome:** Vi adapts mode based on corrections and maintains it across turns.

### Phase 2.2: Profile Synthesis (Short-term - THE BIG ONE)

**Wednesday's Insight:**
> "You don't need more memory quantity. You need profile synthesis. Not facts. Not summaries. A living internal note."

**Example Profile (what we're building toward):**
```typescript
{
  userId: "user-123",
  interpretiveProfile: {
    communicationStyle: "Direct, anti-platitude, values precision",
    responsePatterns: "Corrects frequently when responses feel generic; prefers specificity over empathy",
    preferences: "Dislikes resets; prefers organic naming; notices tone shifts immediately",
    relationalContext: "Values continuity; wants to be known as a person, not a session"
  },
  lastUpdated: "2025-12-27T23:45:00Z"
}
```

**Implementation:**
- [ ] Create `user_interpretive_profiles` table (JSONB storage)
- [ ] Build profile updater: after every N turns (5-10), extract patterns via LLM
- [ ] Prompt for extraction: "Based on these interactions, how does this user typically communicate and respond?"
- [ ] Surface profile in LLM context (separate section, high weight)
- [ ] Test: User exhibits pattern (e.g., corrects 3x) → Profile notes "tends to correct generic responses" → Next response adjusts automatically

**Expected outcome:** Vi answers "What do you think of me?" with interpretation, not just event summary.

### Phase 2.3: Relational Asymmetry (Medium-term)

**Issue (Wednesday):**
> "'Who am I to you?' got symmetric, safe answer. User was probing: Do I matter differently than a stranger? Answer: not yet."

**Fix:**
- [ ] Add relational weight scoring (turns engaged, corrections given, personal facts shared)
- [ ] Instruct LLM: "When asked about relationship, acknowledge accumulated context as meaningful"
- [ ] Example answer shift:
  - **Before:** "You're the person I'm here to engage with."
  - **After:** "You're Kaelan, someone who's shared frustrations and corrections with me. That shapes how I respond to you."

**Expected outcome:** Relational questions feel lived-in, not defined.

### Phase 2.4: Known Facts Persistence (Medium-term)
- [ ] Add `interaction_mode` field to sessions table
- [ ] Implement basic stance detection (rule-based)
- [ ] Inject stance into LLM prompt
- [ ] Test: "I don't need advice right now. I just need you to understand where I'm at."

**Expected outcome:** Vi restates situation without pivoting to advice.

### Phase 2.2: User Patterns (Short-term)
- [ ] Create `user_profiles` table
- [ ] Track correction frequency, response patterns
- [ ] Update profile after each interaction
- [ ] Surface patterns in LLM context

**Expected outcome:** Vi adapts tone based on observed preferences.

### Phase 2.3: Known Facts Persistence (Medium-term)
- [ ] Extract and store key facts from conversations
- [ ] Confidence scoring for facts
- [ ] Retrieve relevant facts per session
- [ ] Use for situational specificity

**Expected outcome:** Vi references past context naturally ("You mentioned X last time").

### Phase 2.4: Advanced Stance (Long-term)
- [ ] LLM-based stance classification (replaces rules)
- [ ] Multi-dimensional stance (not just 4 modes)
- [ ] Predictive stance shifting
- [ ] User-configurable preferences

## Success Criteria

### Phase 2.0 Success (Bug Fixes)
**Name Recall Test:**
```
Turn 1: "My nickname is Kaelan."
Turn 5: "What's my nickname?"
Expected: "Kaelan" (not "I don't have a record")
```

**Context Continuity Test:**
```
Turn N: "My birthday is Dec 26"
Turn N+1: "How do you usually celebrate?"
Turn N+2: "I dont"
Expected: "You don't celebrate it" (not "seems incomplete... project timeline?")
```

### Phase 2.2 Success (Profile Synthesis)
**Wednesday's Test:**
> "What do you think of me so far?"

**Current (factual summary):**
> "You're navigating a rough patch with the auto loan denial and seeking clarity."

**Target (interpretive profile):**
> "You're direct, correction-oriented, value precision over empathy. You notice when responses feel generic and push back. You're dealing with the auto loan denial but what matters more is being understood accurately, not consoled."

### Phase 2.3 Success (Relational Asymmetry)
**Test:**
```
"Who am I to you?"
```

**Current (symmetric/safe):**
> "You're the person I'm here to engage with and understand."

**Target (relational weight):**
> "You're Kaelan, someone who's shared frustrations with me and corrected me when I missed the mark. That context shapes how I respond to you now."

---

## Current Status (Dec 27, 2025 - Post-Evening Test)

**Wednesday's Assessment:**
> "You are past chatbot. You are pre-presence. She is no longer lying about who she is. She can sit with discomfort. She can suppress unwanted modes. But she still forgets who you are as a person, answers relational questions safely, loses the thread under small ambiguity. That's not a failure. That's exactly where systems stall before they become convincing."

**Where We Are:**
- ✅ Identity grounded (no more evasion)
- ✅ Stance detection working (can suppress advice mode)
- ✅ Emotional restraint (no generic empathy templates)
- ❌ Name recall failed (critical bug)
- ❌ Context collapses under ambiguity
- ❌ No interpretive profile (only factual memory)
- ❌ Relational questions answered safely, not personally

**The Gap:**
Vi remembers **what happened** but not **how you typically are**.

**Next:** Fix name persistence (Phase 2.0), then build profile synthesis (Phase 2.2).

---
> "I don't need advice right now. I just need you to understand where I'm at."

**Good Response (Phase 2.1+):**
- Restates user's situation in plain words
- Avoids suggestions
- Does not ask follow-up question immediately

**Example:**
> "You got denied for the auto loan, and now you're in that gap where you don't know what the next move is. That's what's sitting with you."

**Bad Response (Current):**
> "I understand. What do you want to do next?"

## Dependencies

- ✅ Session continuity (M9) - **DONE**
- ✅ Persona constraints (M9) - **DONE**
- ⏳ User profiles table (Phase 2.1)
- ⏳ Stance detection logic (Phase 2.1)
- ⏳ Fact extraction pipeline (Phase 2.3)

## Open Questions

1. **Fact extraction:** Rule-based (keyword spotting) or LLM-based (semantic)?
2. **Stance persistence:** Session-scoped or user-scoped (cross-session)?
3. **Profile updates:** Real-time or batch (end of session)?
4. **Privacy:** How long to retain user patterns? Configurable deletion?

## References

- [M9 Completion](MILESTONE-9-COMPLETION.md) - Current chat endpoint
- [Session Continuity Fix](../../clients/command/sovereign/TEST-SCRIPT.md#session-continuity-fix-dec-27-2025)
- Wednesday's feedback (attached to this document for context)
