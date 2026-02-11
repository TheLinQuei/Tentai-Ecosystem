# Milestone 6: Memory and Consolidation

**Status:** Proposed → In Progress

## Summary
Milestone 6 gives Vi the ability to remember and learn. With LLM intelligence (M5) proven, we now add memory: conversation history, semantic knowledge extraction, and memory consolidation. Vi goes from stateless to contextual.

## Why This Matters
M4 + M5 built a reasoning system that understands and responds.
M6 makes it *remember* what it learns.
- Episodic memory: "This user asked about X and I responded Y"
- Semantic memory: "I extracted that X means Y from this context"
- Consolidation: "Similar conversations can be summarized and reused"

This transforms Vi from a chatbot into a learning assistant.

## What's Built

### 1. **Vector Storage** ([src/db/migrations.ts](src/db/migrations.ts))
- New migration: `0006_add_pgvector_extension`
- Enable pgvector on Postgres (for semantic search)
- Table: `memory_vectors` (embedding storage)
  - Columns: id, user_id, session_id, type (episodic|semantic), embedding (vector), text, metadata, timestamp

### 2. **Embedding Service** ([src/brain/memory/embeddings.ts](src/brain/memory/embeddings.ts))
- `EmbeddingService` interface
- `OpenAIEmbeddingService`: Uses OpenAI API (text-embedding-3-small)
- `StubEmbeddingService`: Deterministic stub (no API costs)
- Vector size: 1536 (compatible with text-embedding-3-small)

### 3. **Memory Store** ([src/brain/memory/MemoryStore.ts](src/brain/memory/MemoryStore.ts))
- Implements `MemoryStore` interface from M4
- Methods:
  - `store(record)`: Save episodic/semantic memory with embedding
  - `retrieve(query, userId, count)`: Semantic search using embeddings
  - `consolidate(userId)`: Summarize and prune old memories
- Uses pgvector for similarity search (`<->` operator)

### 4. **Memory Types** ([src/brain/memory/types.ts](src/brain/memory/types.ts))
- `EpisodicMemory`: conversations, queries, responses (immutable)
- `SemanticMemory`: extracted knowledge, facts, summaries
- `MemoryEntry`: unified storage format
- `ConsolidationResult`: summarization output

### 5. **Enhanced Reflector** ([src/brain/reflector.ts](src/brain/reflector.ts))
- Phase 1 stays simple (no changes)
- Phase 2 hook: Optional LLM-driven semantic extraction
- New method: `reflectWithMemory(thought, memoryStore)` (optional)
- Extracts key findings → semantic memory

### 6. **Enhanced Planner** ([src/brain/planner.ts](src/brain/planner.ts))
- Phase 1 stays deterministic
- Phase 2 hook: Optional memory-aware planning
- New method: `planWithMemory(intent, memoryStore)` (optional)
- Retrieves similar past plans → uses as context

### 7. **Memory API Endpoints** ([src/api/routes/memory.ts](src/api/routes/memory.ts))
- `GET /api/v1/memory/:userId`: List user's memories (paginated)
- `POST /api/v1/memory/:userId/search`: Semantic search
- `DELETE /api/v1/memory/:userId/:memoryId`: Forget specific memory
- `POST /api/v1/memory/:userId/consolidate`: Trigger consolidation

### 8. **Integration Tests** ([tests/integration/memory.e2e.test.ts](tests/integration/memory.e2e.test.ts))
- Store episodic memory
- Store semantic memory
- Semantic search (embedding similarity)
- Consolidation (summarization)
- Memory retrieval in planning/reflection
- Forget operation

---

## Canonical Entry Points

**For memory integration:**
- **[src/brain/memory/MemoryStore.ts](src/brain/memory/MemoryStore.ts)** is the unified memory interface
- **[src/brain/memory/embeddings.ts](src/brain/memory/embeddings.ts)** handles vector embeddings
- **[src/brain/memory/types.ts](src/brain/memory/types.ts)** defines memory structures

**For API access:**
- **[src/api/routes/memory.ts](src/api/routes/memory.ts)** exposes memory endpoints

**For testing:**
- **[tests/integration/memory.e2e.test.ts](tests/integration/memory.e2e.test.ts)** proves memory flow

---

## Phase Boundaries (What's NOT in M6)

### Deferred to M7 (Tools):
- Tool-specific memory (tool usage history, tool performance)
- Tool selection using memory (e.g., "this user always uses tool X for task Y")

### Deferred to M8+ (Advanced):
- Multi-user knowledge bases (shared semantic memory)
- Memory ranking/importance scoring
- Automatic memory purging (retention policies)
- Cross-session consolidation

### M6 Scope (User-Specific):
- Episodic memory (conversation history)
- Semantic memory (extracted knowledge)
- Consolidation (summarization, pruning)
- Semantic search (embedding-based retrieval)
- Memory API (list, search, delete)

---

## Exit Criteria (M6 Complete)

- ✅ pgvector extension installed
- ✅ `memory_vectors` table created
- ✅ Embedding service (OpenAI + stub)
- ✅ Memory store (store/retrieve/consolidate)
- ✅ Memory types defined
- ✅ Reflector enhanced (optional LLM-driven extraction)
- ✅ Planner enhanced (optional memory-aware planning)
- ✅ Memory API endpoints (list, search, delete, consolidate)
- ✅ Integration tests prove memory flow
- ✅ Verification script and log exist

---

## Implementation Plan

### Step 1: Database
1. Create migration: `0006_add_pgvector_extension`
2. Create migration: `0007_add_memory_vectors_table`
3. Add indexes for performance

### Step 2: Embeddings
1. Create `src/brain/memory/embeddings.ts`
2. Implement `EmbeddingService` interface
3. Create `OpenAIEmbeddingService`
4. Create `StubEmbeddingService`

### Step 3: Memory Types
1. Create `src/brain/memory/types.ts`
2. Define `EpisodicMemory`, `SemanticMemory`, `MemoryEntry`

### Step 4: Memory Store
1. Create `src/brain/memory/MemoryStore.ts`
2. Implement `store()` with embedding
3. Implement `retrieve()` with vector similarity search
4. Implement `consolidate()` with LLM summarization

### Step 5: Reflector & Planner
1. Add `reflectWithMemory()` hook to reflector
2. Add `planWithMemory()` hook to planner
3. Keep Phase 1 logic unchanged

### Step 6: API
1. Create `src/api/routes/memory.ts`
2. Add endpoints: GET, POST (search), DELETE, POST (consolidate)
3. Add authentication checks

### Step 7: Tests
1. Unit tests for embedding service
2. Unit tests for memory store
3. Integration tests for full flow
4. API endpoint tests

### Step 8: Verification
1. Create `scripts/verify-m6.ps1`
2. Run full test suite with Docker

---

## Dependencies

**NPM Packages:**
- Already have: `openai`, `@anthropic-ai/sdk`
- Already have: `pg`, `pg-pool`
- Already available in Postgres: `pgvector` (extension)

**Database:**
- Postgres with pgvector extension (already in docker-compose.yml)

**M5 Artifacts:**
- LLM gateway (for semantic extraction)
- Embedding API (OpenAI text-embedding-3-small)

---

## Risk Mitigation

### Embedding Cost Control
- Use `text-embedding-3-small` (cheaper than large)
- Stub embedding service for testing (no API costs)
- Batch embedding operations
- Cache embeddings (don't re-embed same text)

### Vector Search Performance
- Index on vector similarity
- Limit search results (top-k retrieval)
- Consolidation to prune old memories

### Privacy
- Memory is per-user (no cross-user leakage)
- Forget endpoint for GDPR compliance
- Metadata never logged

---

## What Happens Next (M7: Tools)

With memory proven, M7 adds tool integration:
1. **Tool Registry** (catalog of available tools)
2. **Tool Selection** (use memory to pick best tool)
3. **Tool Execution** (sandboxed, with audit trail)
4. **Tool-Specific Memory** (tool usage history)
5. **Tool Performance** (track success/failure)

M6 makes Vi remember. M7 makes Vi act.

---

## The Brain is Learning
M4 built the state machine. M5 wired the intelligence. M6 adds memory.
Vi now remembers conversations, extracts knowledge, and uses past context to make better decisions.
The skeleton is becoming a complete cognitive system.
