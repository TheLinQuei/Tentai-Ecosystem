# Step 2: Documentation Cleanup — COMPLETE ✅

**Status:** Documentation hierarchy locked and verified  
**Date:** December 23, 2025  
**Enforced by:** [`copilot-rules.md`](../playbooks/copilot-rules.md ) Section 8

---

## What Was Locked

**Rule: Documentation is written directly to its final location. Temporary or staging documents are forbidden.**

### Root (Lobby Only — Exactly 4 Files)

✅ **Verified clean:**
```
README.md          ← Entry point (links to real docs)
FREEZE.md          ← Governance (stays here)
copilot-rules.md   ← Pointer to canonical in ops/playbooks/
vi.md              ← Philosophy (stays here)
```

**Zero other files in root.** No QUICKSTART, no STRUCTURE, no reports, no completion tracking.

### Ecosystem Docs (ops/tentai-docs/00-ecosystem/)

✅ **12 files consolidated and organized:**
```
INDEX.md                      ← Master index
CANONICAL_PATHS.md            ← Path decision (NEW)
PHASE1_SPEC.md               ← Phase 1 master spec
PHASE0_COMPLETE.md           ← Phase 0 completion
STRUCTURE.md                 ← Why this structure
QUICKSTART.md                ← 5-minute orientation
HANDOFF.md                   ← Implementation roadmap
DIRECTORIES.md               ← Complete tree
UNIMPLEMENTED_BY_DESIGN.md   ← Boundary pattern
CLEANUP.md                   ← Phase 4 cleanup notes
ROOT_CLEANUP_COMPLETE.md     ← Cleanup report
(future) MILESTONE_VERIFICATION.md ← Stability process
```

### Process/Rules (ops/tentai-docs/playbooks/)

✅ **Governance rules consolidated:**
```
copilot-rules.md        ← This file (CANONICAL, sections 0-12)
doc-writing-rules.md    ← How to write docs
repo-structure.md       ← Repository structure guide
```

### Repo-Specific Docs (core/vi/docs/)

✅ **2 files in place:**
```
00-milestone1-complete.md     ← Milestone 1 completion
10-phase1-implementation.md   ← Implementation guide
```

### Enhanced Doc Placement Rule

Updated [`copilot-rules.md`](../playbooks/copilot-rules.md ) **Section 8: Doc Placement** with:

1. **Explicit rule:** "Documentation is written directly to its final location. Temporary or staging documents are forbidden."

2. **Decision tree:** Shows exactly where each type of doc belongs (4-question flow)

3. **Examples:** What's wrong, what's right (WRONG vs RIGHT pairs)

4. **Never create list:** Forbids temp files, staging docs, wrong locations

5. **Enforcement:** Code review + future CI/CD checks

---

## Verification Checklist

✅ **Root has exactly 4 files** (README, FREEZE, copilot-rules, vi.md)  
✅ **Ecosystem docs consolidated** (12 files in ops/tentai-docs/00-ecosystem/)  
✅ **Playbooks organized** (3 files in ops/tentai-docs/playbooks/)  
✅ **Repo docs in place** (2 files in core/vi/docs/)  
✅ **No temp/staging docs exist**  
✅ **No duplicate docs** across ecosystem and repo folders  
✅ **Doc placement rule locked** (copilot-rules.md Section 8)  
✅ **No references to deleted paths** (old docs gone)  

---

## Decision Tree (Now in copilot-rules.md Section 8)

```
Is this about the whole ecosystem?       → ops/tentai-docs/00-ecosystem/
Is this a process/rule for building?     → ops/tentai-docs/playbooks/
Is this an architecture decision?        → ops/tentai-docs/90-adr/
Is this specific to one repository?      → <repo>/docs/
Is this philosophy/vision/brand?         → Root (rare) or ops/tentai-docs/brand/
Otherwise?                               → Stop. Doesn't belong in docs. Use GitHub Issues.
```

---

## Enforcement

### In Code Review
- Reject any doc in root except the 4 allowed files
- Reject any "temporary" or "staging" doc
- Reject any doc not in its correct final location

### In CI/CD (Future)
```bash
# Lint check: no .md files in root except the 4 allowed
# Lint check: no _*.md, TEMP_*.md, DRAFT_*.md anywhere
# Build fails if docs aren't in designated locations
```

### In This Ruleset
- Follow copilot-rules.md Section 8 exactly
- No exceptions for "temporary" documentation
- If uncertain, create a DESIGN NOTE ADR first before the doc

---

## What This Prevents

| Problem | Solution |
|---------|----------|
| Docs scattered across root | Only 4 files allowed in root |
| Unclear where to find something | Decision tree in Section 8 |
| "Temporary" docs that never move | All docs written to final location immediately |
| Duplicate docs in multiple places | Single canonical location per doc |
| Ecosystem docs mixed with repo docs | Separate folders with clear rules |
| Completion tracking in root | Goes in `<repo>/docs/`, never root |
| Reports scattered everywhere | Consolidated to ecosystem or repo docs |

---

## Next Steps

✅ **Step 1: Canonical Path Resolution** — COMPLETE  
✅ **Step 2: Documentation Cleanup** — COMPLETE  
→ **Step 3: Milestone 1 Reproducibility Verification**  
→ **Step 4: Governance Lock-In**

---

**Step 2 complete. Documentation is now organized, locked, and enforced.**

**Ready for Step 3: Milestone 1 Reproducibility Verification.**
