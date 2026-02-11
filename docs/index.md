# DOCUMENTATION INDEX: Single Entry Point

**STATUS:** Canonical Navigation Hub  
**LAST UPDATED:** January 10, 2026

---

## 🎯 START HERE

- **[MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md)** ← **THE ROADMAP** (all 8 phases, execution order, success metrics)

---

## 📋 QUICK REFERENCE

| What You Need | Location | Purpose |
|---------------|----------|---------|
| **Roadmap & Phases** | [MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md) | Complete execution plan (8 phases, 60 hrs) |
| **Current Status** | [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | Live checkbox tracker (what's done, in-progress, blocked) |
| **Architecture Overview** | [core/vi/README.md](../core/vi/README.md) | API reference, project structure |
| **Persona Spec** | [core/vi/src/config/selfModel.json](../core/vi/src/config/selfModel.json) | Canonical identity definition |
| **Phase 2: User Model** | [PHASE-2-USER-MODEL.md](PHASE-2-USER-MODEL.md) | Relationship model, interaction stance (reference for Phase 2) |
| **Tech Setup** | [core/vi/docs/Phase-1-Implementation-Guide.md](Phase-1-Implementation-Guide.md) | Infrastructure, testing, database (reference) |

---

## 🏗️ ARCHITECTURE DECISIONS (ADRs)

- [001 Policy Engine Architecture](../core/vi/adr/001-policy-engine-architecture.md)
- [002 Memory Strategy](../core/vi/adr/002-memory-strategy.md)
- [004 Planner Schema Validation](../core/vi/adr/004-planner-schema-validation.md)
- [003 Model Provider Selection (ops)](../ops/tentai-docs/adr/003-model-provider-selection.md)

---

## 🔌 CLIENT INTEGRATION

| Client | Status | Integration Guide |
|--------|--------|-------------------|
| **Sovereign (Web)** | ✅ Stable | [clients/command/sovereign/README.md](../clients/command/sovereign/README.md) |
| **Vigil (Discord)** | ⚠️ Docs Incomplete | [clients/discord/vigil/README.md](../clients/discord/vigil/README.md) |
| **Astralis (Codex)** | ⚠️ Tool Mode | [clients/lore/astralis-codex/README.md](../clients/lore/astralis-codex/README.md) |

---

## 🧪 TEST HARNESS & VALIDATION

- **Unit Tests:** Run `npm test` (375+ tests, currently all green)
- **Integration Tests:** See test files in [core/vi/tests/integration/](../core/vi/tests/integration/)
- **Cross-Client:** See test scripts in each client directory
- **Runbooks:** [ops/tentai-docs/playbooks/](../ops/tentai-docs/playbooks/)

---

## 📚 REFERENCE DOCUMENTATION

### Protocols & APIs
- [vi-protocol/README.md](../core/vi-protocol/README.md) — Message schemas, event types
- [core/vi/docs/Vi-Core-API-Reference.md](../core/vi/docs/Vi-Core-API-Reference.md) — Endpoint signatures

### Packages
- [packages/auth-client/README.md](../packages/auth-client/README.md) — Authentication client
- [packages/telemetry/README.md](../packages/telemetry/README.md) — Observability setup
- [packages/tokens/README.md](../packages/tokens/README.md) — Token management
- [packages/ui/README.md](../packages/ui/README.md) — UI components

### Operations
- [ops/tentai-docs/specs/77EZ-CLOSURE-SPECIFICATION.md](../ops/tentai-docs/specs/77EZ-CLOSURE-SPECIFICATION.md) — Production readiness checklist
- [ops/tentai-infra/README.md](../ops/tentai-infra/README.md) — Infrastructure setup
- [ops/tentai-docs/playbooks/Alert-Runbooks.md](../ops/tentai-docs/playbooks/Alert-Runbooks.md) — Alert response procedures

---

## 🗂️ WHAT TO IGNORE (ARCHIVED)

All files in `/ARCHIVE/` are historical or superseded:
- Phase 0-3 completion summaries
- Milestone mini-docs (M1-M9 stubs)
- Audits, receipts, verification reports
- Duplicate roadmaps

**Do not read these unless understanding historical context. Use documents above instead.**

---

## 🔄 HOW TO USE THIS INDEX

**You are:**
- [ ] **New engineer?** → Read [MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md), then client README
- [ ] **Architecture reviewer?** → Start with ADRs, then MASTER-PLAN
- [ ] **Ops/DevOps?** → Check [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), then ops playbooks
- [ ] **Working on Phase N?** → Find Phase N in MASTER-PLAN, reference linked docs

---

## ❓ Questions?

- **What should I read?** Start with [MASTER-PLAN-77EZ.md](../core/vi/MASTER-PLAN-77EZ.md)
- **Is this up to date?** Check [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) (updated weekly)
- **Where's the old status?** Check `/ARCHIVE/` (kept for context only)
- **How do I add a doc?** Update this index + MASTER-PLAN only. Archive conflicts.

---

**PRINCIPLE: One truth, many references. Never duplicate roadmaps.**

*Last sync: 2026-01-10*
