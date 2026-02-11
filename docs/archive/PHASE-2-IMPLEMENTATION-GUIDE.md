# PHASE 2 IMPLEMENTATION GUIDE: Grounding Enforcement

**Phase:** 2/8 (Grounding Gate Implementation)  
**Status:** Starting  
**Duration:** Week 1-2  
**Goal:** Enforce citations + canon awareness at generation time

---

## 🎯 PHASE 2 OBJECTIVES

### Primary Deliverable: GroundingGate

Implement a critical enforcement layer that validates ALL responses against:
1. Canon consistency (conflicts with established lore)
2. Memory consistency (contradicts persistent knowledge)
3. Citation coverage (claims are provably sourced)
4. Confidence thresholds (uncertain claims are tagged)

### Why This Matters

**Current state:** Vi can hallucinate responses without source  
**Phase 2 goal:** Vi is incapable of ungrounded generation (unless explicitly permitted)

**Quote from spec:** "Grounding before reasoning — enforcement layer must exist before we add autonomous loops. Otherwise, autonomous hallucinations."

---

## 📋 IMPLEMENTATION CHECKLIST

### Task 1: Design GroundingGate Interfaces & Types (Estimated: 4-6 hours)

**Deliverables:**
- [ ] Create `core/vi/src/brain/grounding/` directory structure
- [ ] Implement `GroundingRequirements` type
- [ ] Implement `GroundingCheck` type with Citation structures
- [ ] Implement `GroundingGate` class interface
- [ ] Create `CanonFirstStrategy` interface

**Files to Create:**
1. `core/vi/src/brain/grounding/types.ts` — Type definitions
2. `core/vi/src/brain/grounding/GroundingGate.ts` — Main gate implementation
3. `core/vi/src/brain/grounding/CanonResolver.ts` — Canon lookup logic
4. `core/vi/src/brain/grounding/MemoryResolver.ts` — Memory lookup logic

**Acceptance Criteria:**
- All types compile without errors
- Interfaces match spec exactly
- No breaking changes to existing code

---

### Task 2: Implement CanonFirstStrategy (Estimated: 6-8 hours)

**Goal:** When user asks about Astralis entities, ALWAYS check canon first

**Deliverable:**
- Resolver that queries Astralis canon for entity info
- Falls back to LLM only if canon doesn't answer
- Returns citations for all canon-sourced answers

**Implementation Steps:**
1. Create query interface for canon entities
2. Implement entity lookup logic
3. Add confidence scoring
4. Create citation objects
5. Test with sample canon queries

**Key Logic:**
```
User asks about character → Check canon first
Canon has answer → Use it (cite it)
Canon incomplete → Supplement with memory
Memory available → Add memory citation
Neither available → LLM with uncertainty tag
```

---

### Task 3: Implement GroundingGate Core (Estimated: 8-10 hours)

**Goal:** Validate responses before they're sent to users

**Deliverables:**
1. `GroundingGate` class with core methods:
   - `validateResponse(text, context)` → GroundingCheck
   - `extractClaims(text)` → Claim[]
   - `findSources(claim)` → Citation[]
   - `reconcileCitations(citations)` → unified citation set
   - `shouldBlock(check)` → boolean

2. Integration point in pipeline:
   - After generation, before response
   - Async validation
   - Proper error handling

**Key Design:**
- Non-blocking by default (logs but allows)
- Configurable strictness levels
- Can ban ungrounded responses in strict mode
- Auto-tags uncertain claims

---

### Task 4: Add Citation Tracking (Estimated: 6-8 hours)

**Goal:** Every response includes provenance metadata

**Deliverables:**
1. Extend `ChatResponse` type with citations
2. Update response generation to include citations
3. Format citations for UI display
4. Store citations with conversation history

**Changes:**
- `ChatResponse.citations: Citation[]`
- Each citation includes: source, confidence, ID, timestamp
- Frontend displays citations in UI
- Conversation history preserves citations

---

### Task 5: Create Integration Tests (Estimated: 8-10 hours)

**Goal:** Verify grounding works end-to-end

**Test Files to Create:**
1. `phase-2.1-grounding-gate.test.ts` — Core gate tests
   - Valid citations pass
   - Ungrounded claims blocked
   - Multiple sources reconciled
   - Confidence scoring correct

2. `phase-2.2-canon-resolution.test.ts` — Canon lookup tests
   - Entity found in canon
   - Partial canon matches
   - Canon + memory combined
   - Proper citations returned

3. `phase-2.3-citation-tracking.test.ts` — Response tracking tests
   - Citations included in responses
   - Citations preserved in history
   - Multiple citations per claim
   - Confidence levels correct

**Test Strategy:**
- Use fixtures with known canon/memory data
- Test both allow and block cases
- Test edge cases (conflicting sources, etc.)
- Verify no regressions to existing tests

---

## 🔄 INTEGRATION POINTS

### 1. Chat Pipeline Integration

**Location:** `core/vi/src/brain/pipeline.ts`

**Change:** Add grounding validation after response generation

```typescript
// Before: response → user
// After: response → grounding validation → citations → user

const response = await generateResponse(context);
const groundingCheck = await groundingGate.validate(response, context);
const finalResponse = {
  ...response,
  citations: groundingCheck.citations,
  confidence: groundingCheck.confidence,
};
```

### 2. Response Type Extension

**Location:** `core/vi-protocol/src/schemas/Chat.ts`

**Change:** Add citations to ChatResponse

```typescript
interface ChatResponse {
  // Existing
  role: 'assistant';
  content: string;
  
  // NEW
  citations: Citation[];
  confidence: number;
  groundingStatus: 'grounded' | 'ungrounded' | 'uncertain';
}
```

### 3. Database Schema Update

**Location:** `core/vi/src/db/migrations/`

**Change:** Add citations table if needed

```sql
CREATE TABLE IF NOT EXISTS response_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  message_id UUID NOT NULL REFERENCES messages(id),
  
  citation_type VARCHAR(50) NOT NULL,  -- 'canon_entity', 'memory', 'tool_output', 'user_input'
  source_id VARCHAR(255) NOT NULL,      -- Entity ID or memory ID
  source_text TEXT,
  confidence NUMERIC(3,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  UNIQUE(message_id, source_id, citation_type)
);
```

### 4. Repository Addition

**Location:** `core/vi/src/db/repositories/`

**New:** `CitationRepository.ts`

```typescript
class CitationRepository {
  async storeCitations(messageId: string, citations: Citation[]): Promise<void>;
  async getCitationsForMessage(messageId: string): Promise<Citation[]>;
  async getCitationsBySource(sourceId: string): Promise<Citation[]>;
}
```

---

## 🧪 SUCCESS CRITERIA

### Unit Tests
- [ ] GroundingGate validates responses correctly
- [ ] CanonFirstStrategy finds entities in canon
- [ ] Citations are properly formatted
- [ ] Confidence scoring is deterministic

### Integration Tests
- [ ] End-to-end: question → canon lookup → response with citations
- [ ] Conflicting sources handled properly
- [ ] Citations stored in database
- [ ] Existing tests still pass (no regressions)

### Manual Testing
- [ ] Can ask about known canon entities and get citations
- [ ] Unknown entities tagged as uncertain
- [ ] UI displays citations correctly
- [ ] Admin can see citation provenance

### Metrics
- [ ] 0 test failures
- [ ] All 198 existing tests still pass
- [ ] New 40+ grounding tests added
- [ ] Coverage increases to 80%+

---

## 📊 PHASE 2 PROGRESS TRACKER

**Status:** Starting Phase 2  
**Start Date:** January 8, 2026  
**Target Completion:** January 15, 2026

| Task | Status | Progress | ETA |
|------|--------|----------|-----|
| 1. Design types & interfaces | Not started | 0% | Jan 9 |
| 2. CanonFirstStrategy | Not started | 0% | Jan 10 |
| 3. GroundingGate core | Not started | 0% | Jan 11 |
| 4. Citation tracking | Not started | 0% | Jan 12 |
| 5. Integration tests | Not started | 0% | Jan 13 |
| 6. Regression testing | Not started | 0% | Jan 14 |
| 7. Documentation | Not started | 0% | Jan 15 |

---

## 🚀 NEXT STEP: Task 1 (Types & Interfaces)

Ready to start with Phase 2 implementation?

**I will:**
1. Create the grounding types and interfaces from spec
2. Build out the GroundingGate foundation
3. Set up the CanonFirstStrategy resolver
4. Create initial test stubs

**Then we verify all tests pass before moving to Task 2.**

---

## 📚 REFERENCE DOCS

- **77EZ Spec (Pillar C):** [ops/tentai-docs/specs/77EZ-CLOSURE-SPEC.md](../../ops/tentai-docs/specs/77EZ-CLOSURE-SPEC.md)
- **Phase 1 Complete:** [PHASE-1-COMPLETE.md](PHASE-1-COMPLETE.md)
- **Comprehensive Audit:** [COMPREHENSIVE_AUDIT.md](COMPREHENSIVE_AUDIT.md#GAP-CLOSURE-ROADMAP)

---

**START WHEN READY: `Proceed with Phase 2 Task 1`**
