# Tentai Ecosystem Roadmap

**Last Updated:** 2025-12-23  
**Status:** Active Development

---

## Overview

The Tentai Ecosystem is built in phases, with each component progressing through defined milestones. Core infrastructure (`vi`) leads, with client applications following after their dependencies are met.

---

## Phase Status

### ✅ Phase 0: Foundation (Complete)
**Timeline:** Q4 2025  
**Status:** Complete

- Workspace structure and governance
- Copilot rules and contribution guidelines
- Documentation standards
- Build tooling and verification frameworks

**Deliverables:**
- [x] Repository structure
- [x] Copilot rules (Section 13: Verification standards)
- [x] PR checklist template
- [x] Verification script patterns

---

### 🔵 Phase 1: Core Runtime (In Progress)
**Timeline:** Q4 2025 - Q1 2026  
**Status:** Milestone 2 Complete

#### core/vi (Brain)

**Milestone 1: Foundation** ✅ Complete (2025-12-22)
- Fastify server on port 3000
- `/v1/health` endpoint
- CLI tool (version, help, chat, ask)
- Structured logging (Pino)
- TypeScript build system
- Telemetry recording

**Milestone 2: Data Persistence** ✅ Complete (2025-12-23)
- PostgreSQL integration (Docker Compose)
- Connection pooling (pg)
- SQL migrations with tracking
- Repository pattern (Conversations, Messages)
- Zod request/response validation
- 3 new endpoints:
  - `POST /v1/conversations`
  - `POST /v1/conversations/:id/messages`
  - `GET /v1/conversations/:id/messages`
- Integration tests (E2E)

**Milestone 3: Authentication & Multi-User** 🔜 Planned (Q1 2026)
- User authentication (JWT)
- Session management
- User-specific conversations
- Permission model
- API key management
- Rate limiting

**Milestone 4: LLM Integration** 🔜 Planned (Q1 2026)
- OpenAI/Anthropic client adapters
- Streaming responses
- Token counting and limits
- Error handling and retries
- Context window management
- Model selection per conversation

**Milestone 5: Memory & RAG** 🔜 Planned (Q2 2026)
- Vector database integration
- Embedding generation
- Semantic search
- Long-term memory retrieval
- Context augmentation
- Citation tracking

---

### ❄️ Phase 2: Client Applications (Frozen)
**Timeline:** Q2 2026+  
**Status:** Frozen until vi Milestone 3 complete

All client applications are frozen per governance rules. They will unfreeze in sequence as their dependencies are met.

#### vi-command-center (Mission Control)
**Dependencies:** vi M3 (auth), vi M4 (LLM)  
**Unfreeze Condition:** vi M4 complete

Planned features:
- Web UI for conversation management
- Real-time chat interface
- Conversation history
- User settings
- API key management

#### vibot (Discord Bot)
**Dependencies:** vi M3 (auth), vi M4 (LLM)  
**Unfreeze Condition:** vi M4 complete

Planned features:
- Discord slash commands
- Channel-based conversations
- User permission mapping
- Rate limiting per user
- Moderation tools

#### astralis-codex (Knowledge Base)
**Dependencies:** vi M5 (memory/RAG)  
**Unfreeze Condition:** vi M5 complete

Planned features:
- Lore ingestion
- Semantic search
- Citation generation
- Knowledge graph visualization
- Contradiction detection

---

## Milestone Definitions

### Milestone Criteria

Each milestone must:
1. Have a verification script (`verify-m*.ps1`)
2. Generate a verification log
3. Include a completion report referencing the log
4. Pass all exit criteria from clean state
5. Update documentation (README, QUICKSTART, API docs)

### Milestone Workflow

1. **Planning:** Define scope, exit criteria, and dependencies
2. **Implementation:** Build features incrementally
3. **Verification:** Create automated verification script
4. **Testing:** Unit + integration tests
5. **Documentation:** API reference, completion report
6. **Lock-in:** Governance verification, artifact chain check

---

## Current Sprint

### Active: vi Milestone 3 (Authentication)

**Goal:** Add user authentication and multi-user support to vi core.

**Scope:**
- JWT-based authentication
- User registration and login endpoints
- Session management
- Conversation ownership (user_id foreign key)
- Permission checks on all endpoints
- API key generation for programmatic access
- Rate limiting (per user, per endpoint)

**Exit Criteria:**
- [ ] User registration: `POST /v1/auth/register`
- [ ] User login: `POST /v1/auth/login`
- [ ] Token refresh: `POST /v1/auth/refresh`
- [ ] Protected endpoints require valid JWT
- [ ] Conversations scoped to authenticated user
- [ ] API key CRUD endpoints
- [ ] Rate limiting active (configurable)
- [ ] Integration tests for auth flow
- [ ] Verification script: `verify-m3.ps1`
- [ ] Completion report: `MILESTONE-3-COMPLETION.md`

**Dependencies:**
- PostgreSQL (✅ available from M2)
- Zod validation (✅ available from M2)
- Fastify (✅ available from M1)

**Timeline:** Target Q1 2026

---

## Deferred Features

### Post-MVP (Phase 3+)
- Multi-modal support (audio, video, images)
- Plugin system for custom tools
- Webhooks for event notifications
- GraphQL API alongside REST
- Real-time collaboration (WebSockets)
- Analytics and usage dashboards
- Self-hosted deployment guides
- Kubernetes manifests (ops/tentai-infra)

---

## Dependencies Graph

```
vi M1 (Foundation)
  └─> vi M2 (Data Persistence)
       └─> vi M3 (Auth)
            ├─> vi M4 (LLM)
            │    ├─> vi-command-center unfreeze
            │    └─> vibot unfreeze
            └─> vi M5 (Memory/RAG)
                 └─> astralis-codex unfreeze
```

---

## Completion Metrics

### Milestone 1
- **Lines of Code:** ~1,200
- **Tests:** 10 unit tests
- **Endpoints:** 1 (`/v1/health`)
- **Verification Time:** ~2 minutes

### Milestone 2
- **Lines of Code:** ~2,800 (+1,600)
- **Tests:** 10 unit + 1 integration
- **Endpoints:** 4 (`/v1/health`, 3 new)
- **Verification Time:** ~3 minutes

### Milestone 3 (Projected)
- **Lines of Code:** ~4,500 (+1,700)
- **Tests:** 15 unit + 3 integration
- **Endpoints:** 8 (4 existing + 4 auth)
- **Verification Time:** ~4 minutes

---

## Release Strategy

### Versioning

- **0.1.0:** Milestone 1 (Foundation)
- **0.2.0:** Milestone 2 (Data Persistence)
- **0.3.0:** Milestone 3 (Auth) — Target
- **0.4.0:** Milestone 4 (LLM)
- **0.5.0:** Milestone 5 (Memory/RAG)
- **1.0.0:** Production-ready (all Phase 2 clients unfrozen and functional)

### Release Process

1. Milestone verification passes
2. Completion report published
3. Tag commit: `git tag v0.X.0`
4. Update CHANGELOG.md
5. Notify downstream dependents

---

## Contact & Governance

**Primary Governance Doc:** [copilot-rules.md](../playbooks/copilot-rules.md)  
**Verification Standards:** Section 13 (Logs Must Be Saved As Files)  
**PR Template:** [.github/pull_request_template.md](../../.github/pull_request_template.md)

For questions or contributions, see contribution guidelines in the root README.
