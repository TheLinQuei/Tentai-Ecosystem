# How to Brief Copilot (Avoid Doc Bloat)

When asking me (Copilot) to do something, use this template to include context:

---

## Template to Include in Your Request

```
🚀 TASK: [What you want me to do]

📋 CONTEXT:
- Current docs: /docs/ (plans/, guides/, status/, reference/, archive/)
- Canonical rules: /docs/reference/copilot-rules.md
- Roadmap: /docs/plans/MASTER-PLAN-77EZ.md
- Status: /docs/status/IMPLEMENTATION_STATUS.md

⚠️ BEFORE YOU START:
✅ Check copilot-rules.md for constraints
✅ Don't create new .md files unless absolutely necessary
✅ Consolidate instead of duplicating
✅ Update existing docs, don't create new ones

🎯 SPECIFIC CONSTRAINTS FOR THIS TASK:
- [Any specific "don'ts" for this task]
- [Any specific locations/patterns to follow]
```

---

## Example: Good Request

```
🚀 TASK: Update MASTER-PLAN-77EZ.md with Phase 1 details

📋 CONTEXT:
- Docs in /docs/
- Rules: /docs/reference/copilot-rules.md (rule #11: no new docs)
- Status: /docs/status/IMPLEMENTATION_STATUS.md

⚠️ BEFORE YOU START:
✅ Read copilot-rules.md section 11 (Documentation Law)
✅ No new files—only update existing ones
✅ Keep file count at current level

🎯 CONSTRAINTS:
- Only modify /docs/plans/MASTER-PLAN-77EZ.md
- Don't create PHASE-1-DETAILS.md (update the plan instead)
- Cross-reference /docs/status/ for current status
```

---

## Example: Bad Request (What to Avoid)

❌ "Add documentation about Phase 1"
- I might create Phase-1-Implementation.md, Phase-1-Checklist.md, Phase-1-Details.md
- Creates bloat

✅ "Update MASTER-PLAN-77EZ.md with Phase 1 details. Do not create new files."
- I know exactly where to put information
- Prevents bloat

---

## Quick Reference: What Docs Exist

**Canonical (Read-Only Unless Updating):**
- `/docs/README.md` — Hub
- `/docs/plans/MASTER-PLAN-77EZ.md` — Roadmap
- `/docs/guides/GETTING-STARTED.md` — Quick start
- `/docs/status/IMPLEMENTATION_STATUS.md` — Progress
- `/docs/reference/copilot-rules.md` — Build law (THIS)

**You Can Update:** Any of above + code files

**You Cannot Create:** New .md files without explicit approval

**Archive:** `/docs/archive/` — Old files (reference only)

---

## The Rule

**Before I make any suggestions, create any files, or write any docs:**

1. I will read this file
2. I will read copilot-rules.md
3. I will check current /docs/ structure
4. I will ask: "Is this a new doc or an update to existing?"
5. If new: I will ask you first before creating

---

## Copy-Paste Checklist for You

When briefing me:

```
✅ Have you read /docs/reference/copilot-rules.md sections 11-12?
✅ Are you asking me to UPDATE an existing doc (good)?
✅ Or asking me to CREATE a new doc (needs justification)?
✅ Is this task covered in /docs/status/IMPLEMENTATION_STATUS.md?
✅ Do you want me to reference other docs before starting?
```

---

## The Goal

→ Me: "Before I start, let me check the roadmap and rules."  
→ You: "Yes, and here's what to watch out for."  
→ Result: No more accidental file explosion.

---

**Last updated:** January 10, 2026
