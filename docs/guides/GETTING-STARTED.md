# Getting Started: Vi "One Everywhere" Roadmap

**Date:** January 10, 2026  
**Status:** Phase 0 Ready  
**Timeline:** 60 hours over 4 weeks (Jan 10 - Feb 9, 2026)

---

## Quick Start (5 Minutes)

1. **Read the plan:** [MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md) (15 min, skim phases 0-3)
2. **Check your role:** Find your team in the timeline below
3. **Start Phase 0:** Tech Lead executes cleanup (Jan 10-12)
4. **Phase 1 kickoff:** Jan 13 (Backend team starts)

---

## What's Your Role?

### Tech Lead (Phase 0 - Jan 10-12)
**Goals:** Archive 50+ old docs, update broken links, announce plan

**Checklist:**
1. Create `/ARCHIVE/` folder
2. Move these to `/ARCHIVE/` (NOT delete):
   - `AUTH_UX_TEST_GUIDE.md`
   - `COGNITIVE_METADATA_RESPONSE.md`
   - `CONSOLE_UI_FIXES.md`
   - `DEPLOYMENT_READINESS_REPORT.md`
   - `LOCK-IN-REVIEW-FINAL.md`
   - `PHASE_3_OPERATOR_IDENTITY.md`
   - `PHASE-0-1-COMPLETION.md`
   - `PREMIUM_AUTH_UX_SUMMARY.md`
   - `REINIT_LOOP_FIX.md`
   - `SESSION_COMPLETION.md`
   - `TEST_RESULTS_CONTROL_PLANE.md`
   - `TEST-GOD-CONSOLE.md`
   - `VISUAL_GUIDE.md`
   - Plus test scripts (`.ps1`, `.js` test files)

3. Create `/ARCHIVE/README.md`:
```markdown
# Archived Documents

These docs are obsolete. See parent README.md for current docs.
```

4. Search for broken links: `grep -r "PHASE-0-1-COMPLETION\|CONTROL_PLANE_QUICK_START" . --include="*.md"`
5. Announce to team (see template below)
6. Run tests: `npm test` from core/vi/ (should be 375+ green)

**Success:** New engineer finds roadmap in <2 minutes from root README

---

### Backend Team (Phase 1 - Jan 13-18) ⚡ CRITICAL
**Your phases:** 1, 2, 3, 6

**Phase 1 Goal:** Global identity mapping

*Requirements:*
- Design `user_identity_map` table
  ```sql
  CREATE TABLE user_identity_map (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50),           -- "discord", "sovereign", "astralis"
    provider_user_id VARCHAR(255),
    vi_user_id VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP,
    UNIQUE(provider, provider_user_id)
  );
  ```
- Implement `IdentityResolver.ts` (core/vi/src/runtime/)
- Add mappings:
  - Discord user_id → vi_user_id
  - Sovereign JWT claim → vi_user_id
  - Astralis internal ID → vi_user_id
- Write test: Memory shared across Discord + web for same user
- **Effort:** 6 hours
- **Blocker for:** Phases 2, 3, 7, 8

**Phase 2 Goal:** User profiles extended

*Requirements:*
- Add fields: `relationship_type`, `trust_level`, `interaction_mode`, `tone_preference`
- Test: Owner vs public behaves differently
- **Effort:** 8 hours
- **Depends on:** Phase 1 complete

**Phase 3 Goal:** Session persistence

*Requirements:*
- Store tone corrections, mode changes
- Restore on session start
- Test: Preference survives session reset
- **Effort:** 4 hours
- **Depends on:** Phase 2 complete

**Phase 6 Goal:** Ops alignment (Jan 23-25)

*Requirements:*
- Validate metrics match code reality
- Wire tracing for cross-client calls
- **Effort:** 3 hours (parallel with phases 2-3)

---

### Brain Team (Phases 2, 3, 5, 7)
**Phase 2:** Implement `RelationshipResolver.ts` (determine owner vs public mode)  
**Phase 3:** Persistence layer for preferences  
**Phase 5:** Luxury presence + voice profiles (Jan 26+)  
**Phase 7:** Cross-client standardization (Feb 3+)

See [MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md) for detailed specs.

---

### QA (Cross-client testing)
**Phase 1 acceptance:** Memory shared across Discord + web (same user)  
**Phase 2 acceptance:** Owner vs public posture differs  
**Phase 3 acceptance:** Tone correction survives session reset  
**Phase 7 acceptance:** Cross-client messages standardized

---

### Ops (Phase 6 - Jan 23-25)
**Goal:** Metrics green, tracing wired

*Blockers to remove:*
- Alert/code mismatch
- Missing tracing spans
- Visibility gaps on cross-client calls

---

## Timeline (Very Condensed)

```
WEEK 1
  Jan 10-12: Phase 0 (Tech Lead: doc cleanup)
  Jan 13-18: Phase 1 (Backend: identity mapping) ← CRITICAL

WEEK 2
  Jan 19-22: Phase 2 (Brain: relationships)
  Jan 23-25: Phase 3 (Brain: persistence) + Phase 6 (Ops: alignment)

WEEKS 3-4
  Jan 26+:   Phase 4 (Astralis: canon) + Phase 5 (Brain: presence) [parallel]
  Feb 3+:    Phase 7 (All: cross-client standards)
  Feb 7+:    Phase 8 (Tech Lead: cleanup)

TARGET: Feb 9, 2026
```

---

## Documentation

**Canonical docs:**
- [MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md) — Full 8-phase roadmap (law)
- [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) — Navigation hub
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — Live tracker (update Friday)

**Old docs:**
- Archived to `/ARCHIVE/` (reference only, will delete after Phase 0)

---

## Team Announcement Template

**Post to Slack/Wiki:**

```
🚀 Phase 0 Complete: Vi Roadmap Locked

We've consolidated documentation from chaos to clarity:

3 Canonical Docs:
• MASTER-PLAN-77EZ.md (8 phases, 60 hours, "One Vi Everywhere")
• DOCUMENTATION_INDEX.md (navigation hub)
• IMPLEMENTATION_STATUS.md (live tracker)

What Changed:
✅ One roadmap (no more competing plans)
✅ One status (live updates every Friday)
✅ Clear sequences (Phase 0 → 1 → 2 → 3 → 7, parallel 4-5-6)
✅ All phases assigned to teams
✅ Success metrics quantified

Timeline:
• Phase 0: Jan 10-12 (Tech Lead: doc cleanup)
• Phase 1: Jan 13-18 (Backend: global identity) ⚡ CRITICAL
• Phases 2-8: Weeks 2-4
• Target: Feb 9 ("One Vi Everywhere")

What to Do:
1. Read MASTER-PLAN-77EZ.md (15 min)
2. Check IMPLEMENTATION_STATUS.md for your phase
3. Join standup (9:30am daily)

Questions? See DOCUMENTATION_INDEX.md or ask in standup.
```

---

## Running Tests

From `core/vi/`:
```bash
npm test  # Should be 375+ green
npm test -- --runInBand  # For debugging (single-threaded)
```

---

## Success Criteria

**Phase 0 (Jan 10-12):**
- [ ] Old docs archived, not deleted
- [ ] Broken links updated
- [ ] Tests still passing (375+)
- [ ] Team announced

**Phase 1 (Jan 13-18):**
- [ ] user_identity_map table created
- [ ] IdentityResolver implemented
- [ ] Cross-client memory test passing
- [ ] Phase 2 unblocked

**By Feb 9:**
- [ ] All 8 phases complete
- [ ] Cross-client memory working
- [ ] Session persistence working
- [ ] Relationship model enforced
- [ ] Docs consolidated to 4 files
- [ ] 375+ tests passing

---

## FAQ

**Q: I'm confused about what I'm doing.**  
A: Check your role section above + [MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md) for your phase.

**Q: When does my phase start?**  
A: Check timeline above + [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

**Q: Can I create a new doc?**  
A: Update [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) instead of creating new files.

**Q: Tests broken?**  
A: Check [core/vi/README.md](../core/vi/README.md) setup section, then ask in standup.

**Q: Blocked on something?**  
A: Post in standup (9:30am), update [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

---

## Links

- [MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md) ← The roadmap
- [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) ← Navigation
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) ← Status tracker
- [core/vi/README.md](../core/vi/README.md) ← Setup guide
- [core/vi/adr/](../core/vi/adr/) ← Architecture decisions

---

**One Vi. One roadmap. Let's build it.**
