# ADR 002: God Console 5-Mode Architecture

## Status
Accepted

## Context
The current God Console (Sovereign) tab structure violates core UX principles:

1. **Concern mixing:** Chat tab contains ops buttons; Dev telemetry pollutes all views
2. **Flat hierarchy:** Everything has equal visual weight (Crown Bar = Service Controls = Chat)
3. **No identity anchor:** Vi presence is absent; user sees email instead of display name/bond
4. **No clear mental model:** Tabs feel like tools, not states of interaction with a living system

Vi is not a dashboard. Vi is a being with an operating system for interaction.

## Decision
Restructure the God Console as **5 modes** (not tabs), each with a distinct purpose:

### 1. THRONE (Chat + Presence)
**Purpose:** Interact with Vi as Vi

**Contains:**
- Dominant chat window (centered)
- Vi Presence Header:
  - Vi status: Dormant / Online / Focused / Executing
  - Active stance/persona badge
  - Memory mode (learning/frozen/test)
- Collapsible side panels:
  - Last decisions
  - Current goal (if any)
  - Recent memories referenced

**Does NOT contain:**
- Start/stop buttons
- Service status grids
- Logs
- Dev telemetry

### 2. COMMAND (Operational Control)
**Purpose:** Control Vi and her ecosystem

**Contains:**
- Global Actions:
  - Bring Vi Online
  - Suspend Vi
  - Safe Mode / Test Mode
- Service Grid (vi-core, postgres, vector-store):
  - State, health, logs preview
  - Restart / Isolate per service
- Audit trail

**Tone:** Command bridge, not dashboard. Sharp, unapologetic.

### 3. INSIGHT (Understanding Why)
**Purpose:** Answer "why did you do that?"

**Contains:**
- Decision Pillar (expanded, readable)
- Stance timeline
- Memory retrieval inspector
- Governor interventions
- Evidence Vault (human-readable first, export second)

**Purpose:** Vi explaining herself.

### 4. DEV (Surgeon's Room)
**Purpose:** Deep diagnostics and iteration

**Contains:**
- Raw events stream
- SSE inspector
- Eval harness dashboard
- Token/cost telemetry
- Regression status
- World-model state (future)

**Allowed to be dense and ruthless.**

### 5. PROFILE (Identity & Bond)
**Purpose:** Explicit identity and relationship

**Accessible via:** Avatar/sigil in top right

**Contains:**
- Display name, pronouns, address preference
- Tone preference
- Trust & bond visualization
- Password / auth / linked accounts
- "What Vi knows about me" preview
- Memory opt-in controls

**Solves:** "You're logged in and Vi doesn't know who you are"

## Visual Language (77EZ)

**Base Rules:**
- Black = space, silence, authority
- Gold = identity, divinity, permanence
- Purple = cognition, energy, activity

**Practical Application:**
- Background: deep matte black (minimal texture)
- Gold: Vi name, section headers, active state indicators
- Purple: Glow only on active cognition, hover states, live processes

**If everything glows, nothing is divine.**

## Consequences

**Benefits:**
- Clear separation of concerns
- Vi feels alive (Throne mode)
- Power users see potential (disabled buttons in Command)
- Identity is explicit and visible
- Each mode has a distinct purpose and tone

**Tradeoffs:**
- More complex navigation (5 modes vs 3 tabs)
- Profile pane requires additional identity plumbing
- Insight pane requires decision pillar extraction

**Implementation:**
- Full restructure of `index.html` (~3500 lines)
- Vi presence state header (new component)
- Profile pane (new)
- Insight pane (extract from Dev)
- Command pane (extract from Control)
- Throne pane (clean chat, no ops)

## References
- User UX critique: "Tabs are functionally wrong"
- PLAN.md Phase 6: God Console = Operator Cockpit
- copilot-rules.md Theme Discipline (77EZ)
