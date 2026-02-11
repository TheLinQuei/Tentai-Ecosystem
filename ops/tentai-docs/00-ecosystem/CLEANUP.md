# Structure Cleanup Complete

Root is now a lobby, not a junk drawer.

## What Changed

### Root Files (Now Pristine)
✅ **README.md** — Entry point, links to real docs  
✅ **FREEZE.md** — Governance (stays)  
✅ **copilot-rules.md** — Pointer to canonical version  
✅ **vi.md** — Philosophy declaration (stays)

Everything else moved out.

### Moved to ops/tentai-docs/00-ecosystem/
- DIRECTORIES.md
- HANDOFF.md
- INDEX.md (master index)
- PHASE0_COMPLETE.md
- PROJECT_COMPLETION_REPORT.md
- QUICKSTART.md
- STRUCTURE.md
- UNIMPLEMENTED_BY_DESIGN.md

### Archived Old Duplicates
- `_archive/old-clients/` — astralis-codex, vi-command-center, vibot
- `_archive/old-core/` — vi-core

New structure is now the only source of truth:
- ✅ clients/command/sovereign/
- ✅ clients/lore/astralis-codex/
- ✅ clients/discord/vigil/
- ✅ core/vi/
- ✅ core/vi-protocol/
- ✅ core/vi-sdk/

### Canonical Rules Updated
Added to `ops/tentai-docs/playbooks/copilot-rules.md`:

**Section 8: Doc Placement (NON-NEGOTIABLE)**

Rules:
- ✅ Root is a lobby only
- ✅ Ecosystem docs → `ops/tentai-docs/00-ecosystem/`
- ✅ Repo docs → `<repo>/docs/`
- ✅ ADRs → `*/docs/90-adr/`
- ✅ Brand/specs → `ops/tentai-docs/brand/`, `ops/tentai-docs/specs/`
- ✅ Processes → `ops/tentai-docs/playbooks/`

**Forbidden in root:**
- `*_REPORT.md`
- `*_SUMMARY.md`
- `*_COMPLETE.md`
- Any doc not explicitly allowed

---

## How to Navigate Now

### Quick Links (from root README)
| Need | Path |
|------|------|
| 5-min intro | [ops/tentai-docs/00-ecosystem/QUICKSTART.md](./ops/tentai-docs/00-ecosystem/QUICKSTART.md) |
| Architecture | [ops/tentai-docs/00-ecosystem/STRUCTURE.md](./ops/tentai-docs/00-ecosystem/STRUCTURE.md) |
| Roadmap | [ops/tentai-docs/00-ecosystem/HANDOFF.md](./ops/tentai-docs/00-ecosystem/HANDOFF.md) |
| Rules | [ops/tentai-docs/playbooks/copilot-rules.md](./ops/tentai-docs/playbooks/copilot-rules.md) |
| Master Index | [ops/tentai-docs/00-ecosystem/INDEX.md](./ops/tentai-docs/00-ecosystem/INDEX.md) |

### What Stays in Root
- **README.md** — "Start here" with links out
- **FREEZE.md** — Status of repos
- **vi.md** — Philosophy
- **copilot-rules.md** — Pointer file (links to canonical)

### What Copilot Can't Do Anymore
❌ Create `SOMETHING_REPORT.md` in root  
❌ Create `SOMETHING_SUMMARY.md` in root  
❌ Create `SOMETHING_COMPLETE.md` in root  
❌ Create any doc file outside designated folders  

Copilot will bounce docs to the right place or fail loudly.

---

## How This Prevents Sprawl

**Before:** Root had 15+ documentation files  
→ Looked like a downloads folder  
→ Copilot kept inventing new docs at 2am

**After:** Root has 4 files (lobby only)  
→ All docs have designated homes  
→ Rule enforcement (rule 8 in copilot-rules.md)  
→ Copilot must follow the rule or fail

The rule is now non-negotiable. It's in the build rules.

---

## Archive Reference

Old structure is archived, not deleted:

```
_archive/
  ├── old-clients/
  │   ├── astralis-codex/      (use clients/lore/astralis-codex/ instead)
  │   ├── vi-command-center/   (use clients/command/sovereign/ instead)
  │   └── vibot/               (use clients/discord/vigil/ instead)
  └── old-core/
      └── vi-core/             (use core/vi/ instead)
```

If you need to reference anything from the old structure, it's safe to delete after you're confident in the new paths.

---

## Next Steps

1. All team members should update their bookmarks to the new doc locations
2. Any scripts that reference root docs need updating
3. Copilot now has a hard rule (Section 8 of copilot-rules.md)
4. New docs must go to the right place or fail

---

**Root: Clean ✅**  
**Rules: Enforced ✅**  
**Sprawl: Prevented ✅**
